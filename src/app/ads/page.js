'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AdBanner from '@/components/AdBanner';
import AdAnalyticsModal from '@/components/AdAnalyticsModal';
import { HiPhotograph, HiCheckCircle, HiSparkles, HiRefresh, HiTrash, HiClock, HiCreditCard } from 'react-icons/hi';
import toast from 'react-hot-toast';

const MAX_MEDIA = 5;
const MAX_VIDEO_MB = 12;        // videos fly to Supabase Storage (ads-media bucket) as real files — proper clips welcome!
const MAX_PAYLOAD_KB = 5200;    // safety ceiling for the (light) ad row itself once videos live in storage

// 🎬 True for base64 video strings AND hosted video URLs (uploaded to Supabase Storage)
const isVideoSrc = (m) => typeof m === 'string'
  && (m.startsWith('data:video') || /\.(mp4|webm|mov|m4v|3gp|3gpp|ogg)(\?|#|$)/i.test(m));

// ⬆️ Upload one video to the public `ads-media` storage bucket — with LIVE % progress (XHR, since
// fetch can't show upload progress on phones). A stall watchdog aborts if NOTHING moves for 30s.
const uploadAdVideoOnce = (file, path, onPct, accessToken) => new Promise((resolve, reject) => {
  if (!accessToken) {
    reject(new Error('Your login expired — log in again before uploading an ad.'));
    return;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPA_FALLBACK_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPA_FALLBACK_KEY;
  const xhr = new XMLHttpRequest();
  let lastMove = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastMove > 30000) { clearInterval(watchdog); try { xhr.abort(); } catch {} reject(new Error('stall')); }
  }, 4000);
  xhr.upload.onprogress = (e) => {
    lastMove = Date.now();
    if (e.lengthComputable && onPct) onPct(Math.min(1, e.loaded / e.total));
  };
  xhr.onload = () => {
    clearInterval(watchdog);
    if (xhr.status >= 200 && xhr.status < 300) resolve(`${base}/storage/v1/object/public/ads-media/${path}`);
    else reject(new Error(xhr.status === 413 ? '413' : `http-${xhr.status}`));
  };
  xhr.onerror = () => { clearInterval(watchdog); reject(new Error('neterr')); };
  xhr.ontimeout = () => { clearInterval(watchdog); reject(new Error('timeout')); };
  xhr.timeout = 8 * 60 * 1000; // absolute ceiling — stall watchdog normally trips far earlier (30s of zero movement)
  xhr.open('POST', `${base}/storage/v1/object/ads-media/${path}`);
  xhr.setRequestHeader('apikey', key);
  // Storage writes must carry the signed-in user's JWT, never the public anon key.
  xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  xhr.setRequestHeader('x-upsert', 'true');
  xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
  xhr.send(file);
});

// 🔁 Up to 3 goes per video (instant retry keeps the % climbing); permanent errors (over limit) fail fast.
const uploadAdVideo = async (file, path, onPct, accessToken) => {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await uploadAdVideoOnce(file, path, onPct, accessToken);
    } catch (err) {
      lastErr = err;
      if (err?.message === '413') throw new Error('That video is over storage\'s 15MB hard limit — keep clips under 12MB (≈30 seconds).');
      await new Promise(r => setTimeout(r, 900 * attempt)); // little breather, then try again
    }
  }
  throw new Error('This network keeps dropping the video — please try on stronger data/Wi-Fi, or trim the clip smaller.');
};

// 🌐 Direct PostgREST save with a HARD timeout — unlike fire-and-hope this ALWAYS comes back,
// so the button can never sit at "Submitting…" forever on shaky mobile networks.
// (Anon key is public-by-design; fallbacks mirror the ones in /api/send-reset.)
const SUPA_FALLBACK_URL = 'https://biqutnjvhkvldrihywdb.supabase.co';
const SUPA_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU';
const postgrestSave = async (method, path, body, timeoutMs) => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPA_FALLBACK_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPA_FALLBACK_KEY;
  let bearer = '';
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.auth.getSession();
    bearer = data?.session?.access_token || '';
  } catch {}
  if (!bearer) throw new Error('Your login expired — log in again to change this ad.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        // merge-duplicates = re-tapping Submit after a network hiccup safely overwrites instead of erroring
        Prefer: method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new Error(`Network too slow — nothing was saved (gave up after ${Math.round(timeoutMs / 1000)}s). Try again on stronger data/Wi-Fi, and keep videos under ${MAX_VIDEO_MB}MB.`);
    }
    throw new Error('No connection — check your data/Wi-Fi and try again. Nothing was saved.');
  }
  clearTimeout(timer);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 413) throw new Error('That upload is too heavy — remove a video (or use a much shorter clip) and try again.');
    throw new Error((txt || `Save failed (HTTP ${res.status})`).slice(0, 160));
  }
};

// ✨ Local "AI" description writer — builds a tailored advert from your CATEGORY pick, the words you
// typed as Alt text on each photo/video, your business name, AND real facts from the media itself.
const AI_CATEGORIES = [
  { id: 'auto',     label: '✨ Auto-detect',  topic: '',                                     hook: '' },
  { id: 'fashion',  label: '👗 Fashion',      topic: 'quality fashion pieces & outfits',     hook: 'Sizes & colours available — just ask for yours! 👗' },
  { id: 'hair',     label: '💇 Hair & Beauty', topic: 'top-notch hair & beauty services',    hook: 'Book your slot today — spaces fill up fast! 💇🏽‍♀️' },
  { id: 'skincare', label: '🧴 Skincare',     topic: 'original skincare & beauty products',  hook: 'Your glow-up starts with ONE order 🧴' },
  { id: 'food',     label: '🍲 Food',         topic: 'delicious, freshly-made food',         hook: 'Made fresh when you order — come hungry! 🍲' },
  { id: 'gadgets',  label: '📱 Gadgets',      topic: 'genuine gadgets & accessories',        hook: 'Original & tested — no fakes, no stories 📱' },
  { id: 'thrift',   label: '👟 Thrift/Okrika', topic: 'quality thrift (okrika) finds',       hook: 'First come, best pick — stock moves FAST 👟' },
  { id: 'other',    label: '🛠 Services',     topic: 'trusted, quality service',             hook: 'Tell us what you need — consider it sorted 🛠' },
];
const AI_PATTERNS = [
  { keys: ['fashion', 'cloth', 'wear', 'outfit', 'dress', 'gown', 'ankara', 'jean', 'shirt', 'skirt', 'blouse', 'two-piece', 'twopiece'], cat: 'fashion' },
  { keys: ['thrift', 'okrika', 'shoe', 'sneaker', 'bag', 'sandal', 'heel'], cat: 'thrift' },
  { keys: ['hair', 'salon', 'barber', 'wig', 'braid', 'lash', 'nail', 'makeup', 'mua'], cat: 'hair' },
  { keys: ['cream', 'soap', 'skincare', 'glow', 'cosmetic', 'beauty oil', 'lotion', 'scrub'], cat: 'skincare' },
  { keys: ['food', 'restaurant', 'chops', 'snack', 'cake', 'bakery', 'meal', 'cook', 'pepper soup', 'jollof'], cat: 'food' },
  { keys: ['phone', 'gadget', 'laptop', 'accessor', 'electronic', 'charger', 'tech', 'earpod', 'speaker'], cat: 'gadgets' },
];

// 👁 Truly read the uploaded media first: orientation of each image, and how bright/colourful
// the set looks (tiny 24px canvas sample) — the AI then writes copy that matches the actual visuals
function analyzeMedia(files) {
  const out = { count: files.length, videos: 0, portraits: 0, landscapes: 0, squares: 0, bright: 0, dark: 0, colorful: 0, images: 0 };
  return Promise.all(files.map(m => new Promise(res => {
    if (isVideoSrc(m)) { out.videos++; return res(); }
    out.images++;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
      if (h > w * 1.15) out.portraits++; else if (w > h * 1.15) out.landscapes++; else out.squares++;
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let lum = 0, sat = 0;
        for (let i = 0; i < d.length; i += 4) {
          lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          sat += mx - mn;
        }
        lum /= (d.length / 4); sat /= (d.length / 4);
        if (lum >= 140) out.bright++; else if (lum < 95) out.dark++;
        if (sat >= 55) out.colorful++;
      } catch {}
      res();
    };
    img.onerror = () => res();
    img.src = m;
  }))).then(() => out);
}

function visualStory(a) {
  // No media counts, no "swipe through" — just a confident line that matches the media kind & look
  if (!a || !a.count) return '';
  const hasV = a.videos > 0, hasI = a.images > 0;
  const mediaWords = hasI && hasV ? 'photos & videos' : hasV ? 'short videos' : 'photos';
  let mood = '';
  if (hasI) {
    const half = Math.max(1, Math.ceil(a.images / 2));
    mood = a.dark >= half ? 'clean, classy ' : a.colorful >= half ? 'bright, colourful ' : 'clear, well-lit ';
  }
  return `Real ${mood}${mediaWords} of the ACTUAL items — what you see is exactly what arrives. 💯`;
}

function aiDescriptions(name, a, opts = {}) {
  const n = (name || 'My Business').trim();
  // Topic: 1) the category chip you tapped  2) auto-detect from your ALT TEXTS first, then the name
  let cat = AI_CATEGORIES.find(c => c.id === opts.category) || AI_CATEGORIES[0];
  if (!cat.topic) {
    const bag = [(opts.alts || []).join(' '), n].map(s => (s || '').toLowerCase());
    for (const text of bag) {
      const hit = AI_PATTERNS.find(p => p.keys.some(k => text.includes(k)));
      if (hit) { cat = AI_CATEGORIES.find(c => c.id === hit.cat) || cat; break; }
    }
  }
  const topic = cat.topic || 'quality products & trusted service';
  const hook = cat.hook || '';
  const topicCap = topic.charAt(0).toUpperCase() + topic.slice(1);
  const proof = visualStory(a);
  const tag = '#' + (n.replace(/[^a-z0-9]/gi, '').slice(0, 18) || 'Payround');
  const hashtag = `${tag} #Payround #NaijaBusiness`;
  const proofLine = proof ? `\u{1F4F8} ${proof}\n` : '';
  const hookLine = hook ? `${hook}\n` : '';
  return [
    `\u{1F6A8} ${n} is LIVE!\n${topicCap} that people keep coming back for — and now it's one tap away.\n${proofLine}${hookLine}✔ Honest prices\n✔ Fast responses\n✔ Quick delivery\n👉 Send us a WhatsApp message NOW to order — first come, first served!\n${hashtag}`,
    `Why do customers love ${n}? Simple — ${topic}, done RIGHT. 💯\n${proofLine}${hookLine}No stories, no stress: pick what you want, chat us, get it fast. That's it.\n🎁 New customers get a warm welcome — try us this week!\n👉 WhatsApp us now — we reply in minutes.\n${hashtag}`,
    `Looking for ${topic} you can actually trust? Stop scrolling. 😌\n${n} delivers the goods — literally.\n${proofLine}💬 One message on WhatsApp and your order is moving.\n${hookLine}✔ Quality guaranteed\n✔ Prices that respect your pocket\n✔ Speed you'll love\n👉 Tap to chat with us on WhatsApp now!\n${hashtag}`,
    `✨ ${n} — for people who don't settle for less.\nWe've got the ${topic} everyone is talking about, served with a smile.\n${proofLine}${hookLine}Don't wait for "later" — stock moves FAST. 🏃🏽‍♂️💨\n👉 Message us on WhatsApp today and thank yourself tomorrow.\n${hashtag}`,
  ];
}

// 🧩 Shows how PayRound AUTO-SORTS the media into the Sponsored slots:
// tall (portrait) shots → the 2 portrait slots • wide (landscape) shots → the landscape slot.
// Every photo/video renders in FULL (never cropped).
function SlotFitPreview({ media }) {
  const [shapes, setShapes] = useState([]); // per item: true = portrait(tall), false = landscape(wide)
  useEffect(() => {
    let alive = true;
    if (!media || !media.length) { setShapes([]); return undefined; }
    Promise.all(media.map((m) => new Promise((res) => {
      if (isVideoSrc(m)) {
        const v = document.createElement('video');
        v.muted = true; v.preload = 'metadata';
        v.onloadedmetadata = () => res((v.videoHeight || 0) > (v.videoWidth || 0));
        v.onerror = () => res(false);
        setTimeout(() => res(false), 5000);
        v.src = m;
      } else {
        const img = new Image();
        img.onload = () => res(img.naturalHeight > img.naturalWidth);
        img.onerror = () => res(false);
        img.src = m;
      }
    }))).then((r) => { if (alive) setShapes(r); });
    return () => { alive = false; };
  }, [media]);

  if (!media || !media.length) return null;
  const portraits = media.filter((_, i) => shapes[i] === true);
  const landscapes = media.filter((_, i) => shapes[i] === false);
  const thumb = (m, i, port) => (
    <span key={i} className="shrink-0 inline-flex items-center justify-center bg-black rounded-lg overflow-hidden" style={{ width: port ? 40 : 56, height: 40 }}>
      {isVideoSrc(m)
        ? <video src={m} muted playsInline className="w-full h-full object-contain" />
        : <img src={m} alt="" className="w-full h-full object-contain" />}
    </span>
  );
  return (
    <div className="mb-3 rounded-xl p-2" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
      <p className="text-[10px] font-bold mb-1.5 text-center" style={{ color: '#475569' }}>🧩 PayRound auto-sorts your media into the Sponsored slots:</p>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#e0e7ff', color: '#3730a3' }}>🟦 2 Portrait slots</span>
        <div className="flex gap-1 overflow-x-auto">
          {shapes.length < media.length
            ? <span className="text-[10px]" style={{ color: '#64748b' }}>checking shapes…</span>
            : portraits.length ? portraits.map((m, i) => thumb(m, i, true)) : <span className="text-[10px]" style={{ color: '#64748b' }}>none — upload a tall shot to fill these!</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0" style={{ background: '#ffedd5', color: '#9a3412' }}>🟧 1 Landscape slot</span>
        <div className="flex gap-1 overflow-x-auto">
          {shapes.length < media.length
            ? <span className="text-[10px]" style={{ color: '#64748b' }}>checking…</span>
            : landscapes.length ? landscapes.map((m, i) => thumb(m, i, false)) : <span className="text-[10px]" style={{ color: '#64748b' }}>none — upload a wide shot for this!</span>}
        </div>
      </div>
    </div>
  );
}

export default function AdsPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({ businessName: '', description: '', contact: '', whatsapp: '', website: '' });
  const [mediaFiles, setMediaFiles] = useState([]);
  const rawVid = useRef({});   // dataUrl -> original video File (uploaded to Supabase Storage on submit)
  const adIdRef = useRef('');  // stable ad id across Submit retries — videos reuse the same storage paths (no duplicates)
  const [mediaAlts, setMediaAlts] = useState([]);   // optional alt text per photo/video (advertiser's words)
  const [mediaError, setMediaError] = useState('');
  const [editId, setEditId] = useState('');         // set while fixing a declined ad (UPDATE instead of INSERT)
  const [planDays, setPlanDays] = useState(7);
  const [receipt, setReceipt] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [sending, setSending] = useState(false);
  const [aiIdx, setAiIdx] = useState(0);
  const [aiUsed, setAiUsed] = useState(false);
  const [category, setCategory] = useState('auto'); // 🎯 what are you selling? — drives the AI writer

  const [settings, setSettings] = useState(null); // owner bank + ad prices (owner-editable)
  const [authChecked, setAuthChecked] = useState(false);
  const authSyncSeq = useRef(0); // Newer auth checks invalidate slower results from older lifecycle events.
  const [myEmail, setMyEmail] = useState(''); // Set only from a verified Supabase Auth user, never localStorage.
  const [myAds, setMyAds] = useState([]);
  const [tab, setTab] = useState('create');           // 📑 'create' (📢) | 'mine' (📂 My Ads)
  const [mineFilter, setMineFilter] = useState('all'); // all | live | review | await_receipt | declined
  const [activeAds, setActiveAds] = useState([]);

  // 🔗 Deep link: /ads?tab=mine (&f=live|review|await_receipt|declined) opens straight on the My Ads tab
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('tab') === 'mine') setTab('mine');
      const f = (q.get('f') || '').trim();
      if (['all', 'live', 'review', 'await_receipt', 'declined'].includes(f)) setMineFilter(f);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [viewImg, setViewImg] = useState('');
  const [previewAd, setPreviewAd] = useState(null); // 👁 live preview (saved ads OR the form before submitting)
  const [statsAd, setStatsAd] = useState(null);     // 📊 analytics modal (expired ads only — unlocks after the run)

  // 👁 Build a temporary ad (marked active so AdBanner renders it) from any source
  const openPreview = (ad) => setPreviewAd({ ...ad, active: true, _preview: true });

  const previewForm = () => {
    if (!formData.businessName.trim()) { toast.error('Type your business name first — then preview.'); return; }
    if (mediaFiles.length === 0) { toast.error('Add at least 1 photo/video — that\'s what people see first!'); return; }
    const cover = mediaFiles[0];
    openPreview({
      id: editId || 'preview-draft',
      business_name: formData.businessName.trim(),
      description: formData.description.trim() || '(no description yet)',
      phone: formData.contact.trim(),
      contact: formData.contact.trim(),
      whatsapp: formData.whatsapp.trim() || formData.contact.trim(),
      website: formData.website.trim() || null,
      media_urls: JSON.stringify(mediaFiles),
      media_url: cover,
      media_type: isVideoSrc(cover) ? 'video' : 'image',
      media_alts: JSON.stringify(mediaAlts.map(a => (a || '').trim())),
      duration_days: plan.days,
      price: plan.price,
    });
  };

  const plans = [
    { days: 1, label: '1 Day', price: Number(settings?.ad_1day || 500) },
    { days: 7, label: '1 Week', price: Number(settings?.ad_1week || 3325) },
    { days: 30, label: '1 Month', price: Number(settings?.ad_1month || 13500) },
  ];
  const plan = plans.find(p => p.days === planDays) || plans[1];

  const loadMyAds = useCallback(async (email, shouldApply = () => true) => {
    if (!email) {
      if (shouldApply()) setMyAds([]);
      return [];
    }
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.from('ads').select('*').eq('submitter_email', email).order('submitted_at', { ascending: false });
      if (shouldApply()) setMyAds(data || []);
      return data || [];
    } catch {
      if (shouldApply()) setMyAds([]);
      return [];
    }
  }, []);

  // localStorage is only a display cache and is forgeable/stale. Supabase Auth is the
  // source of truth. Re-check on browser Back/Forward because those pages may be restored
  // from the back-forward cache without remounting this component.
  const syncAuth = useCallback(async () => {
    const requestId = ++authSyncSeq.current;
    let user = null;
    let error = null;
    try {
      const { supabase } = await import('@/lib/supabase');
      const result = await supabase.auth.getUser();
      user = result.data?.user || null;
      error = result.error || null;
    } catch (err) {
      error = err;
    }

    const email = (user?.email || '').trim().toLowerCase();
    // pageshow/focus/visibility/auth-change can fire together. A slower, older
    // response must never overwrite the newest verified auth state.
    if (requestId !== authSyncSeq.current) return { user, email, stale: true };

    if (email) {
      setMyEmail(email);
      await loadMyAds(email, () => requestId === authSyncSeq.current);
    } else {
      setMyEmail('');
      setMyAds([]);
      setTab('create');
      setShowForm(false);
      setEditId('');
      // Remove a stale display cache when Auth confirms that there is no valid user.
      const msg = String(error?.message || '').toLowerCase();
      if (!error || msg.includes('session') || msg.includes('jwt') || msg.includes('auth')) {
        try { localStorage.removeItem('payround_user'); } catch {}
      }
    }
    if (requestId === authSyncSeq.current) setAuthChecked(true);
    return { user, email, stale: requestId !== authSyncSeq.current };
  }, [loadMyAds]);

  useEffect(() => {
    let subscription;
    const recheck = () => {
      setAuthChecked(false);
      syncAuth();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') recheck(); };

    recheck();
    window.addEventListener('pageshow', recheck);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisible);

    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = supabase.auth.onAuthStateChange(() => {
          // Run outside the auth callback to avoid competing with Supabase's session lock.
          setTimeout(recheck, 0);
        });
        subscription = data.subscription;
      } catch {}
    })();

    return () => {
      // Prevent an in-flight check from updating state after this page unmounts.
      authSyncSeq.current += 1;
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisible);
      subscription?.unsubscribe();
    };
  }, [syncAuth]);

  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: s } = await supabase.from('public_pricing').select('bank_name, account_number, account_name, ad_1day, ad_1week, ad_1month').eq('id', 1).single();
        if (s) setSettings(s);
      } catch {}
      try {
        const { getAdsFromSupabase } = await import('@/lib/supabase');
        setActiveAds(await getAdsFromSupabase());
      } catch {}
    })();
  }, []);

  const pickMedia = async (files) => {
    setMediaError('');
    if (mediaFiles.length >= MAX_MEDIA) { setMediaError(`Maximum is ${MAX_MEDIA} photos/videos per ad.`); return; }
    const list = [];
    for (const file of Array.from(files || [])) {
      if (mediaFiles.length + list.length >= MAX_MEDIA) { setMediaError(`Maximum is ${MAX_MEDIA} photos/videos per ad — extra files skipped.`); break; }
      const isVideo = file.type.startsWith('video/');
      if (!isVideo && !file.type.startsWith('image/')) { setMediaError('Only images and videos are allowed.'); continue; }
      if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) { setMediaError(`"${file.name}" is over ${MAX_VIDEO_MB}MB — please trim the clip a little (about 30 seconds max) and try again.`); continue; }
      try {
        if (isVideo) {
          const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
          rawVid.current[dataUrl] = file; // keep the real file — it goes to fast Storage on submit (not inside the ad text)
          list.push(dataUrl);
        } else {
          const { compressImage } = await import('@/lib/image');
          list.push(await compressImage(file, 1000, 0.82));
        }
      } catch { setMediaError('One file could not be read — try another.'); }
    }
    setMediaFiles(prev => {
      const merged = [...prev, ...list].slice(0, MAX_MEDIA);
      setMediaAlts(aPrev => [...aPrev, ...list.map(() => '')].slice(0, merged.length));
      return merged;
    });
  };

  const useAiDescription = async (regen, catOverride) => {
    if (!formData.businessName.trim()) { toast.error('Type your business name first — the AI writes from it.'); return; }
    const catId = catOverride || category;
    const t = toast.loading('✨ Studying your photos & videos…');
    const analysis = await analyzeMedia(mediaFiles);
    const variants = aiDescriptions(formData.businessName, analysis, { category: catId, alts: mediaAlts });
    const next = regen ? (aiIdx + 1) % variants.length : aiIdx % variants.length;
    setAiIdx(next);
    setFormData(prev => ({ ...prev, description: variants[next] }));
    setAiUsed(true);
    const catLabel = (AI_CATEGORIES.find(c => c.id === catId) || AI_CATEGORIES[0]).label;
    toast.success(regen
      ? `✨ Fresh version (${catLabel}) — edit freely!`
      : `✨ Written for ${catLabel} + your ${mediaFiles.length || 'uploaded'} photo/video facts — edit anything!`, { id: t, duration: 4000 });
  };

  // Tap a market chip → AI instantly rewrites for that market (if it already wrote something)
  const pickCategory = (id) => {
    setCategory(id);
    if (aiUsed) useAiDescription(false, id);
    else toast(`Category set: ${(AI_CATEGORIES.find(c => c.id === id) || {}).label} — now tap "✨ Write it for me (AI)" ✍️`);
  };

  const pickReceipt = async (file) => {
    setReceiptError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) { setReceiptError('Receipt must be an image (screenshot of your transfer).'); return; }
    try {
      const { compressImage } = await import('@/lib/image');
      setReceipt(await compressImage(file, 1000, 0.82));
    } catch { setReceiptError('Could not read that image — try another.'); }
  };

  const statusOf = (ad) => {
    if (ad.status === 'approved') {
      if (ad.expires_at && new Date(ad.expires_at).getTime() < Date.now()) return 'expired';
      return 'live';
    }
    if (ad.status === 'archived') return 'expired'; // cleared from the owner panel 24h after ending — analytics stay yours
    if (ad.status === 'declined') return 'declined';
    return ad.payment_receipt_url ? 'review' : 'await_receipt';
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  };

  const daysLeft = (ad) => {
    if (!ad.expires_at) return null;
    const left = Math.ceil((new Date(ad.expires_at).getTime() - Date.now()) / 86400000);
    return Math.max(0, left);
  };

  // Real submission — everything persisted in one go; receipt optional (can be added later from My Ads)
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Revalidate at the point of submission. Never trust myEmail/localStorage for ownership.
    let supabaseClient;
    let authUser;
    let authEmail = '';
    let accessToken = '';
    try {
      const mod = await import('@/lib/supabase');
      supabaseClient = mod.supabase;
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data?.user?.email) throw new Error('not-authenticated');
      authUser = data.user;
      authEmail = data.user.email.trim().toLowerCase();
      const { data: sessionData } = await supabaseClient.auth.getSession();
      accessToken = sessionData?.session?.access_token || '';
      if (!accessToken) throw new Error('not-authenticated');
      setMyEmail(authEmail);
    } catch {
      setMyEmail('');
      setMyAds([]);
      setShowForm(false);
      toast.error('Please log in before submitting an ad.');
      setTimeout(() => router.push('/login?redirect=%2Fads'), 500);
      return;
    }

    if (!formData.contact.trim()) { toast.error('Contact phone is required.'); return; }
    if (mediaFiles.length === 0) { toast.error('Add at least 1 photo or video of your business.'); return; }
    if (!receipt && !window.confirm(`No payment receipt attached!\n\nYour ad will be SAVED as "Awaiting payment". Pay ₦${plan.price.toLocaleString()} to the PayRound account shown and upload the receipt later from "My Ads" on this page — nothing will be lost.\n\nSave the ad now without the receipt?`)) return;
    setSending(true);
    const t = toast.loading('Preparing your ad…', { duration: Infinity });
    try {
      // Stable id across retries — re-tapped Submit reuses the same storage paths (no duplicate files)
      if (!editId && !adIdRef.current) adIdRef.current = `ad-${Date.now()}`;
      const adId = editId || adIdRef.current;
      // 🎬 Upload ALL videos AT THE SAME TIME (parallel!) with ONE overall % — far faster than one-by-one
      const jobs = [];
      mediaFiles.forEach((m, idx) => {
        const file = rawVid.current[m];
        if (file) {
          const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
          // User id in the path lets Storage RLS prove who owns each upload.
          jobs.push({ idx, m, file, path: `ads/${authUser.id}/${adId}/media-${idx + 1}.${ext}`, fraction: 0, url: '' });
        }
      });
      if (jobs.length) {
        const totals = jobs.reduce((s, j) => s + (j.file.size || 1), 0);
        let lastToast = 0;
        const bump = () => {
          const now = Date.now();
          if (now - lastToast < 400) return;
          lastToast = now;
          const done = jobs.reduce((s, j) => s + j.fraction * (j.file.size || 1), 0);
          const pct = Math.min(99, Math.round((done / totals) * 100));
          toast.loading(`📤 Uploading ${jobs.length} video${jobs.length > 1 ? 's' : ''} at once… ${pct}% — please don’t close this page`, { id: t });
        };
        bump();
        await Promise.all(jobs.map(async (j) => {
          try {
            j.url = await uploadAdVideo(j.file, j.path, (f) => { j.fraction = f; bump(); }, accessToken);
          } catch (vErr) {
            // Backup plan: a small clip can still ride inside the ad; a big one must give up with a clear message
            if (j.file.size <= 3.5 * 1024 * 1024) j.url = ''; // empty url → falls back to inline dataUrl below
            else throw vErr;
          }
          j.fraction = 1; bump();
        }));
      }
      // Photos & previously-saved media stay as they are; freshly-uploaded videos become their storage URL
      const finalMedia = mediaFiles.map((m, idx) => {
        const j = jobs.find(x => x.idx === idx);
        return j ? (j.url || m) : m;
      });
      toast.loading(receipt ? '💾 Saving ad + receipt…' : '💾 Saving your ad…', { id: t });
      const cover = finalMedia[0];
      const payload = {
        id: adId,
        business_name: formData.businessName.trim(),
        description: formData.description.trim(),
        phone: formData.contact.trim(),
        contact: formData.contact.trim(),
        whatsapp: formData.whatsapp.trim() || formData.contact.trim(),
        website: formData.website.trim() || null,
        media_urls: JSON.stringify(finalMedia),
        media_url: cover,
        media_type: isVideoSrc(cover) ? 'video' : 'image',
        media_alts: mediaAlts.some(a => (a || '').trim()) ? JSON.stringify(mediaAlts.map(a => (a || '').trim())) : null,
        duration_days: plan.days,
        price: plan.price,
        payment_receipt_url: receipt || null,
        receipt_uploaded_at: receipt ? new Date().toISOString() : null,
        submitter_email: authEmail,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      };
      const bodyKB = Math.round(JSON.stringify(payload).length / 1024);
      if (bodyKB > MAX_PAYLOAD_KB) throw new Error(`This ad is still too heavy (~${(bodyKB / 1024).toFixed(1)}MB) — remove a photo or two and try again.`);
      const { data: saved, error: saveErr } = await supabaseClient.rpc('submit_ad', { p: payload });
      if (saveErr) throw saveErr;
      if (!saved?.ok) throw new Error('Ad was not saved. Try again.');
      toast.success(editId
        ? 'Updated ad sent for review again! 🎉 The reason it was declined is cleared.'
        : receipt
          ? 'Ad + receipt submitted! PayRound will confirm your payment and set it LIVE. 🎉'
          : '✅ Ad SAVED! Nothing is lost — pay and upload your receipt anytime from the My Ads tab.', { id: t, duration: 6000 });
      setFormData({ businessName: '', description: '', contact: '', whatsapp: '', website: '' });
      setMediaFiles([]);
      rawVid.current = {};
      adIdRef.current = '';
      setReceipt('');
      setAiUsed(false); setAiIdx(0); setCategory('auto');
      setMediaAlts([]);
      setEditId('');
      setShowForm(false);
      loadMyAds(authEmail);
      // Straight to the My Ads tab, already filtered to where the new ad landed 🎯
      if (!editId) setTimeout(() => { setTab('mine'); setMineFilter(receipt ? 'review' : 'await_receipt'); }, 450);
    } catch (err) {
      toast.error(`Could not submit: ${err.message || 'try again'}`, { id: t, duration: 8000 });
    } finally {
      setSending(false); // NEVER stuck at "Submitting…" again
    }
  };

  // Upload/replace the payment receipt on a saved ad
  const uploadReceiptFor = async (ad, file) => {
    if (!file || !file.type.startsWith('image/')) { toast.error('Receipt must be an image.'); return; }
    const t = toast.loading('Uploading receipt…', { duration: Infinity });
    try {
      const { email, stale } = await syncAuth();
      if (stale) throw new Error('Your sign-in changed — please try again.');
      if (!email) throw new Error('Your login expired — log in again.');
      if ((ad.submitter_email || '').toLowerCase() !== email) throw new Error('You can only change your own ads.');
      const { compressImage } = await import('@/lib/image');
      const dataUrl = await compressImage(file, 1000, 0.82);
      await postgrestSave('PATCH', `ads?id=eq.${encodeURIComponent(ad.id)}&submitter_email=eq.${encodeURIComponent(email)}`, { payment_receipt_url: dataUrl, receipt_uploaded_at: new Date().toISOString() }, 60000);
      toast.success('Receipt uploaded! PayRound will review and set your ad LIVE. 🎉', { id: t, duration: 5000 });
      setMineFilter('review'); // show it land under ⏳ Pending
      loadMyAds(email);
    } catch (err) { toast.error(`Upload failed: ${err.message || 'try again'}`, { id: t, duration: 7000 }); }
  };

  // ✏️ Fix a declined ad — load it back into the form; submitting UPDATEs the same row
  const startEdit = async (ad) => {
    const { email, stale } = await syncAuth();
    if (stale) {
      toast.error('Your sign-in changed — please tap Edit again.');
      return;
    }
    if (!email) {
      toast.error('Please log in before editing an ad.');
      router.push('/login?redirect=%2Fads');
      return;
    }
    if ((ad.submitter_email || '').trim().toLowerCase() !== email) {
      toast.error('You can only edit your own ads.');
      return;
    }

    let media = [], alts = [];
    try { const m = JSON.parse(ad.media_urls || '[]'); if (Array.isArray(m)) media = m; } catch {}
    try { const a = JSON.parse(ad.media_alts || '[]'); if (Array.isArray(a)) alts = a; } catch {}
    setFormData({
      businessName: ad.business_name || '',
      description: ad.description || '',
      contact: ad.phone || ad.contact || '',
      whatsapp: ad.whatsapp || '',
      website: ad.website || '',
    });
    setMediaFiles(media);
    rawVid.current = {}; // already-saved media are strings (no re-upload needed)
    setMediaAlts(media.map((_, i) => alts[i] || ''));
    setPlanDays(ad.duration_days || 7);
    setReceipt(ad.payment_receipt_url || '');
    setEditId(ad.id);
    setCategory('auto');
    setTab('create'); // jump to the Create Ad tab with the form loaded
    setShowForm(true);
    toast(ad.status === 'declined'
      ? 'Ad loaded into the form ✏️ — fix what PayRound flagged and resubmit below.'
      : 'Ad loaded into the form ✏️ — tweak anything you like, then hit the button below.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteAd = async (ad) => {
    if (!window.confirm(`Delete the ad "${ad.business_name}" permanently? This cannot be undone.`)) return;
    const t = toast.loading('Deleting…');
    try {
      const { email, stale } = await syncAuth();
      if (stale) throw new Error('Your sign-in changed — please try again.');
      if (!email) throw new Error('Your login expired — log in again.');
      if ((ad.submitter_email || '').toLowerCase() !== email) throw new Error('You can only delete your own ads.');
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').delete().eq('id', ad.id).eq('submitter_email', email);
      if (error) throw error;
      toast.success('Ad deleted.', { id: t, duration: 3500 });
      loadMyAds(email);
    } catch (err) { toast.error(`Could not delete: ${err.message || 'try again'}`, { id: t, duration: 6000 }); }
  };

  const bank = { name: settings?.bank_name || 'Opay', number: settings?.account_number || '9151723199', holder: settings?.account_name || 'Basikoro James Okeroghene' };

  const StatusChip = ({ ad }) => {
    const s = statusOf(ad);
    const map = {
      await_receipt: ['💰 AWAITING PAYMENT', 'ad-status-amber'],
      review: ['⏳ PAYMENT UNDER REVIEW', 'ad-status-blue'],
      live: ['🟢 LIVE', 'ad-status-green'],
      expired: ['⌛ EXPIRED', 'ad-status-gray'],
      declined: ['❌ DECLINED', 'ad-status-red'],
    };
    const [txt, cls] = map[s];
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{txt}</span>;
  };

  // My Ads tab — live counters + filtered view
  const mineCounts = { all: myAds.length, live: 0, review: 0, await_receipt: 0, expired: 0, declined: 0 };
  myAds.forEach(a => { const s = statusOf(a); if (mineCounts[s] !== undefined) mineCounts[s] += 1; });
  const shownAds = mineFilter === 'all' ? myAds : myAds.filter(a => statusOf(a) === mineFilter);
  const mineEmpty = {
    live: 'No live ads right now — once PayRound confirms your payment the ad appears here. 🟢',
    review: 'Nothing under review. Submit an ad with its receipt and it queues here while PayRound confirms the payment. ⏳',
    await_receipt: 'No saved ads waiting for payment. 💾 Save one from the Create Ad tab and it waits for you right here.',
    expired: 'No expired ads yet. When a live ad finishes its paid days it lands here — and its full analytics unlock. 📊',
    declined: 'No declined ads — keep it up! 🎉',
    all: '',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Advertise Your Business</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Reach thousands of Payround users across Nigeria. Pick how long your advert runs, pay, upload your receipt — and you&apos;re LIVE.
          </p>
        </div>

        {/* 📑 Tabs — Create Ad vs My Ads */}
        {authChecked && myEmail && (
          <div className="flex justify-center gap-2 mb-6">
            <button onClick={() => setTab('create')}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all ${tab === 'create' ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}>
              📢 Create Ad
            </button>
            <button onClick={() => setTab('mine')}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all ${tab === 'mine' ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}>
              📂 My Ads {myAds.length > 0 && <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'mine' ? 'bg-white/25 text-white' : 'bg-primary-100 text-primary-700'}`}>{myAds.length}</span>}
            </button>
          </div>
        )}

        {/* 📂 MY ADS TAB — everything the advertiser ever submitted, grouped by status */}
        {authChecked && myEmail && tab === 'mine' && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📂 My Ads ({myAds.length})</h2>
            <p className="text-xs mb-3 ad-hint">Your ads stay saved here forever — unless you delete them yourself. Saved one to pay later? It waits under <b>💾 Saved</b> — upload the receipt whenever you're ready.</p>
            {myAds.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                <p className="font-semibold text-gray-700 mb-1">You haven't submitted any ads yet</p>
                <p className="text-xs mb-4 ad-hint">Live, pending, saved and declined ads all appear here the moment you submit one.</p>
                <button onClick={() => setTab('create')} className="bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">📢 Create Your First Ad</button>
              </div>
            ) : (
            <>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[['all', '🗂 All'], ['live', '🟢 Live'], ['review', '⏳ Pending'], ['await_receipt', '💾 Saved'], ['expired', '⌛ Expired'], ['declined', '❌ Declined']].map(([k, label]) => (
                <button key={k} onClick={() => setMineFilter(k)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${mineFilter === k ? 'bg-gray-900 text-white border-gray-900 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {label} <span className={mineFilter === k ? 'text-white/70' : 'text-gray-400'}>· {mineCounts[k] || 0}</span>
                </button>
              ))}
            </div>
            {shownAds.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-xs text-gray-400">{mineEmpty[mineFilter]}</div>
            ) : (
            <div className="space-y-3">
              {shownAds.map(ad => {
                let media = [];
                try { const m = JSON.parse(ad.media_urls || '[]'); if (Array.isArray(m)) media = m; } catch {}
                const cover = media[0] || ad.media_url || '';
                const left = daysLeft(ad);
                const pendingDelete = statusOf(ad) !== 'live';
                return (
                  <div key={ad.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex gap-3">
                      {cover && (
                        <button onClick={() => setViewImg(cover)} className="shrink-0" title="Tap to view">
                          {isVideoSrc(cover)
                            ? <video src={cover} muted playsInline className="w-16 h-16 rounded-xl object-cover border bg-black" />
                            : <img src={cover} alt="" className="w-16 h-16 rounded-xl object-cover border" />}
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm truncate">{ad.business_name}</p>
                          <StatusChip ad={ad} />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          ⏱ {ad.duration_days || '?'} day{(ad.duration_days || 0) > 1 ? 's' : ''} · ₦{Number(ad.price || 0).toLocaleString()} · {media.length || 1} photo/video{(media.length || 1) > 1 ? 's' : ''}
                        </p>
                        <p className="text-[11px] ad-hint">📅 Created: {fmtDate(ad.submitted_at)}</p>
                        {statusOf(ad) === 'live' && ad.expires_at && (
                          <p className="text-[11px] ad-note-green font-semibold mt-0.5">📺 Showing until {new Date(ad.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{left !== null ? ` — ${left} day${left === 1 ? '' : 's'} left` : ''}</p>
                        )}
                        {statusOf(ad) === 'expired' && (
                          <p className="text-[11px] mt-0.5" style={{ color: '#1e293b', fontWeight: 700 }}>⌛ Ended {ad.expires_at ? new Date(ad.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} — no longer showing on the site. 📊 Your full analytics are ready below!</p>
                        )}
                        {statusOf(ad) === 'review' && (
                          <p className="text-[11px] ad-note-blue mt-0.5">✅ Receipt uploaded{ad.receipt_uploaded_at ? ` ${fmtDate(ad.receipt_uploaded_at)}` : ''} — waiting for PayRound to confirm payment.</p>
                        )}
                        {statusOf(ad) === 'await_receipt' && (
                          <p className="text-[11px] mt-0.5 ad-amber border rounded-lg px-2 py-1 inline-block">💡 Pay ₦{Number(ad.price || 0).toLocaleString()} to {bank.name} {bank.number} ({bank.holder}) then upload your receipt below.</p>
                        )}
                      </div>
                    </div>
                    {statusOf(ad) === 'declined' && (
                      <div className="mt-3 border rounded-xl p-3 ad-redbox">
                        <p className="text-[11px] font-bold mb-0.5 ad-red-title">❌ Why PayRound declined this ad:</p>
                        <p className="text-xs ad-red-text">{ad.reject_reason || 'No reason was given — please re-check the ad rules and resubmit.'}</p>
                        <button onClick={() => startEdit(ad)} className="mt-2 w-full sm:w-auto text-sm font-extrabold text-white bg-primary-600 px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors shadow-md shadow-primary-200">✏️ EDIT & RESUBMIT THIS AD</button>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {/* 👁 See it exactly as viewers will + ✏️ change it anytime before it's live */}
                      <button onClick={() => openPreview(ad)} className="text-[11px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors">👁 Preview</button>
                      {statusOf(ad) === 'expired' && (
                        <button onClick={() => setStatsAd(ad)} className="text-[11px] font-extrabold text-white bg-violet-600 border border-violet-600 px-3 py-1.5 rounded-full hover:bg-violet-700 transition-colors shadow-sm shadow-violet-200">📊 View Analytics</button>
                      )}
                      {statusOf(ad) === 'live' && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full">🔒 Analytics unlock when this ad expires</span>
                      )}
                      {statusOf(ad) === 'review' && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full">🔒 Analytics unlock after the ad runs</span>
                      )}
                      {(statusOf(ad) === 'await_receipt' || statusOf(ad) === 'review') && (
                        <button onClick={() => startEdit(ad)} className="text-[11px] font-bold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-full hover:bg-primary-100 transition-colors">✏️ Edit</button>
                      )}
                      {ad.payment_receipt_url ? (
                        <button onClick={() => setViewImg(ad.payment_receipt_url)} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">🧾 View receipt</button>
                      ) : statusOf(ad) === 'await_receipt' ? (
                        <label className="text-[11px] font-semibold text-white bg-amber-500 px-3 py-1.5 rounded-full cursor-pointer hover:bg-amber-600 transition-colors">
                          📤 Upload payment receipt
                          <input type="file" accept="image/*" className="hidden" onChange={e => { uploadReceiptFor(ad, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                      ) : null}
                      {pendingDelete && (
                        <button onClick={() => deleteAd(ad)} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors">🗑 Delete ad</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            </>
            )}
          </div>
        )}

        {/* Active Ads */}
        {tab === 'create' && activeAds.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Featured Businesses</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeAds.map(ad => (
                <AdBanner key={ad.id} ad={ad} />
              ))}
            </div>
          </div>
        )}

        {/* Do not reveal either visitor or advertiser controls until Auth has been verified. */}
        {tab === 'create' && !authChecked && (
          <div className="text-center bg-white border border-gray-100 rounded-2xl p-8 shadow-sm" role="status" aria-live="polite">
            <div className="w-8 h-8 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">Checking your sign-in…</p>
          </div>
        )}

        {/* CTA */}
        {tab === 'create' && authChecked && !showForm && (
          <div className="text-center bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-8 md:p-12">
            <HiPhotograph className="w-12 h-12 text-primary-200 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">Advertise Your Business Here</h2>
            <p className="text-primary-100 mb-2 max-w-lg mx-auto">
              Get your business in front of active savers across Nigeria. From just <b className="text-gold-400">₦{plans[0].price.toLocaleString()}/day</b>.
            </p>
            {myEmail ? (
              <>
                <p className="text-primary-200 text-xs mb-6">Pay straight to the PayRound account, upload your receipt — advert goes live after payment is confirmed.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-gold-500 text-gray-900 font-semibold px-8 py-3.5 rounded-xl hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/25"
                >
                  Submit Your Ad Now
                </button>
              </>
            ) : (
              <>
                <p className="text-primary-100 text-sm mb-2 font-semibold">Visitors cannot run ads.</p>
                <p className="text-primary-200 text-xs mb-6">Create a free PayRound account first — then you can submit your business advert from this page.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a href="/signup?redirect=%2Fads" className="bg-gold-500 text-gray-900 font-semibold px-8 py-3.5 rounded-xl hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/25">
                    Sign up free — then advertise
                  </a>
                  <a href="/login?redirect=%2Fads" className="bg-white/15 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/25 transition-all">
                    I already have an account
                  </a>
                </div>
              </>
            )}
          </div>
        )}

        {/* Form — a verified Supabase user is required; cached browser data is never enough. */}
        {tab === 'create' && authChecked && myEmail && showForm && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Advertise Your Business</h3>
              {editId && <p className="text-[11px] font-semibold border rounded-lg px-2 py-1 mb-3 ad-amber">✏️ Editing your declined ad — submitting replaces it and sends it back for review (created date stays).</p>}
              {!editId && <div className="mb-3" />}

              <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label">Business Name *</label>
                    <input
                      type="text"
                      value={formData.businessName}
                      onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                      placeholder="Your business name"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* 📸 Media — right under the business name (max 5) */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label">Business Photos / Videos * (max {MAX_MEDIA})</label>
                    <p className="text-[11px] mb-1.5 ad-hint">💡 The Sponsored area has <b>2 portrait slots</b> and <b>1 landscape slot</b> — PayRound <b>auto-sorts</b> each photo/video into the right slot, always shown in FULL (never cropped). Photos play ~5s, videos play to the end.</p>
                    <label className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-primary-300 hover:bg-primary-50/40 transition-all">
                      <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { pickMedia(e.target.files); e.target.value = ''; }} />
                      <HiPhotograph className="w-6 h-6 text-gray-400" />
                      <span className="text-xs ad-hint">Tap to add photos or videos 🎬 — images auto-compressed, videos up to <b>{MAX_VIDEO_MB}MB</b> fly to fast file storage ({mediaFiles.length}/{MAX_MEDIA} added)</span>
                    </label>
                    {mediaError && <p className="text-xs text-red-500 mt-1">{mediaError}</p>}
                    {mediaFiles.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {mediaFiles.map((m, i) => (
                          <div key={i} className="relative w-24">
                            {isVideoSrc(m)
                              ? <video src={m} muted playsInline className="w-24 h-16 rounded-lg object-cover border bg-black" />
                              : <img src={m} alt={mediaAlts[i] || `media ${i + 1}`} className="w-24 h-16 rounded-lg object-cover border" />}
                            <button type="button" onClick={() => { const gone = mediaFiles[i]; if (rawVid.current[gone]) delete rawVid.current[gone]; setMediaFiles(prev => prev.filter((_, x) => x !== i)); setMediaAlts(prev => prev.filter((_, x) => x !== i)); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] shadow z-10">✕</button>
                            <input
                              type="text"
                              value={mediaAlts[i] || ''}
                              onChange={e => setMediaAlts(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                              placeholder="Alt text (optional)"
                              maxLength={70}
                              title="Describe this photo/video — optional, e.g. 'Ankara gown, size 12'. Shown if the picture can't load and used as the image label."
                              className="mt-1 w-24 px-1.5 py-1 border border-gray-200 rounded-lg text-[9px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ✨ Description with optional AI writer */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium ad-label">Description *</label>
                      <button
                        type="button"
                        onClick={() => useAiDescription(aiUsed)}
                        className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full hover:bg-purple-100 transition-colors"
                      >
                        {aiUsed ? <><HiRefresh className="w-3 h-3" /> Regenerate</> : <><HiSparkles className="w-3 h-3" /> ✨ Write it for me (AI)</>}
                      </button>
                    </div>
                    <p className="text-[11px] mb-1.5 ad-hint">Type it yourself — or let our AI write one. <b>Tell the AI your market below</b> 👇 (it also reads your Alt texts &amp; how bright/clear your photos look). You can edit the result freely.</p>
                    {/* 🎯 What are you selling? — one tap removes all AI guessing */}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {AI_CATEGORIES.map(c => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => pickCategory(c.id)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                            category === c.id
                              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder='Describe your business… or tap "✨ Write it for me (AI)" above'
                      rows={4}
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label">Contact Phone *</label>
                    <input
                      type="tel"
                      value={formData.contact}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
                      placeholder="08012345678"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label">WhatsApp Number *</label>
                    <input
                      type="tel"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                      placeholder="e.g. 09151723199 — customers can chat you on WhatsApp"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label">Website (optional)</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                      placeholder="https://yourbusiness.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* ⏱ Duration — price shown beside each timeframe */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label"><HiClock className="inline w-4 h-4 mr-1 -mt-0.5" />How long should your ad run? *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {plans.map(p => (
                        <button
                          type="button"
                          key={p.days}
                          onClick={() => setPlanDays(p.days)}
                          className={`rounded-xl border-2 p-3 text-center transition-all ad-plan ${planDays === p.days ? 'ad-plan-sel' : ''}`}
                        >
                          <p className="text-sm font-bold">{p.label}</p>
                          <p className="text-xs font-semibold mt-0.5 ad-plan-price">₦{p.price.toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 💳 Pay the PayRound account */}
                  <div className="rounded-xl border-2 p-4 ad-paycard">
                    <p className="text-[11px] font-bold mb-1 ad-pay-title"><HiCreditCard className="inline w-4 h-4 mr-1 -mt-0.5" />PAY ₦{plan.price.toLocaleString()} TO THE PAYROUND ACCOUNT</p>
                    <div className="text-xs space-y-0.5">
                      <p><span className="ad-pay-label">Bank:</span> <b>{bank.name}</b></p>
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="ad-pay-label">Account No:</span> <b className="font-mono ad-pay-number">{bank.number}</b>
                        <button type="button" onClick={() => { try { navigator.clipboard.writeText(bank.number); toast.success('Account number copied! 📋'); } catch {} }} className="text-[10px] font-semibold px-2 py-0.5 rounded-full ad-pay-copy">Copy</button>
                      </p>
                      <p><span className="ad-pay-label">Name:</span> <b>{bank.holder}</b></p>
                    </div>
                    <p className="text-[10px] mt-2 ad-pay-note">Use your business name as the transfer remark. Your ad goes LIVE as soon as PayRound confirms the payment.</p>
                  </div>

                  {/* 🧾 Receipt */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5 ad-label">Payment Receipt (screenshot of your transfer)</label>
                    {receipt ? (
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => setViewImg(receipt)}><img src={receipt} alt="receipt" className="w-20 h-20 rounded-xl object-cover border" /></button>
                        <button type="button" onClick={() => setReceipt('')} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">✕ Remove</button>
                      </div>
                    ) : (
                      <label className="w-full border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer transition-all ad-dropzone">
                        <input type="file" accept="image/*" className="hidden" onChange={e => { pickReceipt(e.target.files?.[0]); e.target.value = ''; }} />
                        <span className="text-lg">🧾</span>
                        <span className="text-xs text-center">Tap to upload your transfer receipt<br /><span className="text-[10px] ad-drop-sub">Not paid yet? No wahala — submit now, your ad stays saved, upload the receipt anytime from My Ads.</span></span>
                      </label>
                    )}
                    {receiptError && <p className="text-xs text-red-500 mt-1">{receiptError}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={previewForm}
                    disabled={sending}
                    className="w-full border-2 font-bold py-3 rounded-xl transition-all mt-1 disabled:opacity-50 ad-prevbtn"
                  >
                    👁 Preview how your ad will look
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
                  >
                    {sending ? 'Submitting…' : receipt ? 'Submit Ad + Receipt for Review' : 'Save Ad (upload receipt later)'}
                  </button>
                  <p className="text-[10px] text-center ad-hint">Your ad details are stored safely — leaving this page to go pay will NOT delete anything.</p>
                </form>
            </div>
          </div>
        )}
      </div>

      {/* full-screen image viewer */}
      {viewImg && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewImg('')}>
          <button className="absolute top-4 right-4 text-white text-2xl font-bold bg-white/10 w-10 h-10 rounded-full">✕</button>
          {isVideoSrc(viewImg)
            ? <video src={viewImg} controls autoPlay playsInline className="max-h-[85vh] max-w-full rounded-xl" onClick={e => e.stopPropagation()} />
            : <img src={viewImg} alt="view" className="max-h-[85vh] max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />}
        </div>
      )}

      {/* 👁 LIVE PREVIEW — the exact Sponsored card people will see (taps disabled in preview) */}
      {previewAd && (
        <div className="fixed inset-0 z-[95] bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewAd(null)}>
          <div className="rounded-2xl max-w-sm w-full p-4 shadow-2xl ad-preview max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] font-extrabold text-center mb-2 pv-title">👁 LIVE PREVIEW — this is exactly what people see in the Sponsored area</p>
            <SlotFitPreview media={(() => { try { const m = JSON.parse(previewAd?.media_urls || '[]'); return Array.isArray(m) ? m : []; } catch { return []; } })()} />
            <div
              className="rounded-xl border border-dashed border-gray-200 p-2"
              onClickCapture={(e) => { if (!e.target.closest('button')) { e.preventDefault(); e.stopPropagation(); } }}
            >
              <AdBanner ad={previewAd} big track={false} />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setPreviewAd(null)} className="flex-1 bg-gray-900 text-white text-sm font-bold py-2.5 rounded-xl">✕ Close preview</button>
              <button onClick={() => { setPreviewAd(null); toast('Happy? Hit the green submit button 🚀 — or keep editing ✏️'); }} className="flex-1 bg-primary-600 text-white text-sm font-bold py-2.5 rounded-xl">Looks good 👍</button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 ANALYTICS — unlocked the moment an ad's paid run ends */}
      {statsAd && <AdAnalyticsModal ad={statsAd} onClose={() => setStatsAd(null)} />}

      <Footer />
    </div>
  );
}
