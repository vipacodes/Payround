'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AdBanner from '@/components/AdBanner';
import { HiPhotograph, HiCheckCircle, HiSparkles, HiRefresh, HiTrash, HiClock, HiCreditCard } from 'react-icons/hi';
import toast from 'react-hot-toast';

const MAX_MEDIA = 5;
const MAX_VIDEO_MB = 12;        // videos fly to Supabase Storage (ads-media bucket) as real files — proper clips welcome!
const MAX_PAYLOAD_KB = 5200;    // safety ceiling for the (light) ad row itself once videos live in storage

// 🎬 True for base64 video strings AND hosted video URLs (uploaded to Supabase Storage)
const isVideoSrc = (m) => typeof m === 'string'
  && (m.startsWith('data:video') || /\.(mp4|webm|mov|m4v|3gp|3gpp|ogg)(\?|#|$)/i.test(m));

// ⬆️ Upload one video to the public `ads-media` storage bucket — returns its public https URL.
// Hard timeout so slow networks fail with a clear message instead of spinning forever.
const uploadAdVideo = async (file, path, timeoutMs = 180000) => {
  const { supabase } = await import('@/lib/supabase');
  const timer = new Promise((_, rej) => setTimeout(
    () => rej(new Error('Video upload is taking too long on this network — try stronger data/Wi-Fi or a shorter clip.')),
    timeoutMs
  ));
  const up = await Promise.race([
    supabase.storage.from('ads-media').upload(path, file, { contentType: file.type || 'video/mp4', upsert: true }),
    timer,
  ]);
  if (up?.error) throw up.error;
  const { data } = supabase.storage.from('ads-media').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Storage did not return a link for the video.');
  return data.publicUrl;
};

// 🌐 Direct PostgREST save with a HARD timeout — unlike fire-and-hope this ALWAYS comes back,
// so the button can never sit at "Submitting…" forever on shaky mobile networks.
// (Anon key is public-by-design; fallbacks mirror the ones in /api/send-reset.)
const SUPA_FALLBACK_URL = 'https://biqutnjvhkvldrihywdb.supabase.co';
const SUPA_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU';
const postgrestSave = async (method, path, body, timeoutMs) => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPA_FALLBACK_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPA_FALLBACK_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
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

// ✨ Local "AI" description writer — builds a tailored advert from the business name + the photos/videos uploaded.
const AI_PATTERNS = [
  { keys: ['fashion', 'cloth', 'wear', 'outfit', 'dress', 'thrift', 'okrika', 'shoe', 'sneaker', 'bag', 'tailor'], topic: 'quality fashion pieces' },
  { keys: ['hair', 'salon', 'barber', 'wig', 'braid', 'lash', 'nail'], topic: 'top-notch beauty & hair services' },
  { keys: ['food', 'restaurant', 'chops', 'snack', 'cake', 'bakery', 'meal', 'cook'], topic: 'delicious, freshly-made meals' },
  { keys: ['cream', 'soap', 'skincare', 'glow', 'cosmetic', 'makeup', 'beauty', 'oil'], topic: 'original skincare & beauty products' },
  { keys: ['phone', 'gadget', 'laptop', 'accessor', 'electronic', 'charger', 'tech'], topic: 'genuine gadgets & accessories' },
  { keys: ['thrift', 'shoes'], topic: 'quality thrift finds' },
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
  if (!a || !a.count) return '';
  const shapes = [];
  if (a.portraits) shapes.push(`${a.portraits} portrait (tall) shot${a.portraits > 1 ? 's' : ''}`);
  if (a.landscapes) shapes.push(`${a.landscapes} wide shot${a.landscapes > 1 ? 's' : ''}`);
  if (a.squares) shapes.push(`${a.squares} square shot${a.squares > 1 ? 's' : ''}`);
  if (a.videos) shapes.push(`${a.videos} short video${a.videos > 1 ? 's' : ''}`);
  const mood = a.dark >= Math.max(1, Math.floor(a.images / 2))
    ? 'clean, classy shots'
    : a.colorful >= Math.max(1, Math.floor(a.images / 2))
      ? 'bright, colourful photos'
      : 'clear, well-lit photos';
  return `Swipe through ${a.count} real ${mood}${shapes.length ? ' — ' + shapes.join(' + ') : ''} — what you see is exactly what arrives.`;
}

function aiDescriptions(name, a) {
  const n = (name || 'My Business').trim();
  const lower = n.toLowerCase();
  const hit = AI_PATTERNS.find(p => p.keys.some(k => lower.includes(k)));
  const topic = hit ? hit.topic : 'quality products & trusted service';
  const proof = visualStory(a);
  const hashtag = '#' + n.replace(/[^a-z0-9]/gi, '').slice(0, 18) + ' #Payround #NaijaBusiness';
  return [
    `🚨 ${n} is LIVE!
${topic.charAt(0).toUpperCase() + topic.slice(1)} that people keep coming back for — and now it's one tap away.
${proof ? '📸 ' + proof + '\n' : ''}✔ Honest prices\n✔ Fast responses\n✔ Quick delivery
👉 Send us a WhatsApp message NOW to order — first come, first served!
${hashtag}`,
    `Why do customers love ${n}? Simple — ${topic}, done RIGHT. 💯
${proof ? proof + '\n' : ''}No stories, no stress: pick what you want, chat us, get it fast. That's it.
🎁 New customers get a warm welcome — try us this week!
👉 WhatsApp us now — we reply in minutes.
${hashtag}`,
    `Looking for ${topic} you can actually trust? Stop scrolling. 😌
${n} delivers the goods — literally.
${proof ? '📸 ' + proof + '\n' : ''}💬 One message on WhatsApp and your order is moving.
✔ Quality guaranteed\n✔ Prices that respect your pocket\n✔ Speed you'll love
👉 Tap to chat with us on WhatsApp now!
${hashtag}`,
    `✨ ${n} — for people who don't settle for less.
We've got the ${topic} everyone is talking about, served with a smile.
${proof ? proof + '\n' : ''}Don't wait for "later" — stock moves FAST. 🏃🏽‍♂️💨
👉 Message us on WhatsApp today and thank yourself tomorrow.
${hashtag}`,
  ];
}

export default function AdsPage() {
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({ businessName: '', description: '', contact: '', whatsapp: '', website: '' });
  const [mediaFiles, setMediaFiles] = useState([]);
  const rawVid = useRef({});   // dataUrl -> original video File (uploaded to Supabase Storage on submit)
  const [mediaAlts, setMediaAlts] = useState([]);   // optional alt text per photo/video (advertiser's words)
  const [mediaError, setMediaError] = useState('');
  const [editId, setEditId] = useState('');         // set while fixing a declined ad (UPDATE instead of INSERT)
  const [planDays, setPlanDays] = useState(7);
  const [receipt, setReceipt] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [sending, setSending] = useState(false);
  const [aiIdx, setAiIdx] = useState(0);
  const [aiUsed, setAiUsed] = useState(false);

  const [settings, setSettings] = useState(null); // owner bank + ad prices (owner-editable)
  const [myEmail, setMyEmail] = useState('');
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

  const plans = [
    { days: 1, label: '1 Day', price: Number(settings?.ad_1day || 500) },
    { days: 7, label: '1 Week', price: Number(settings?.ad_1week || 3325) },
    { days: 30, label: '1 Month', price: Number(settings?.ad_1month || 13500) },
  ];
  const plan = plans.find(p => p.days === planDays) || plans[1];

  const loadMyAds = useCallback(async (email) => {
    if (!email) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.from('ads').select('*').eq('submitter_email', email).order('submitted_at', { ascending: false });
      setMyAds(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      let email = '';
      try { email = (JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase(); } catch {}
      setMyEmail(email);
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: s } = await supabase.from('owner_settings').select('bank_name, account_number, account_name, ad_1day, ad_1week, ad_1month').eq('id', 1).single();
        if (s) setSettings(s);
      } catch {}
      loadMyAds(email);
      try {
        const { getAdsFromSupabase } = await import('@/lib/supabase');
        setActiveAds(await getAdsFromSupabase());
      } catch {}
    })();
  }, [loadMyAds]);

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

  const useAiDescription = async (regen) => {
    if (!formData.businessName.trim()) { toast.error('Type your business name first — the AI writes from it.'); return; }
    const t = toast.loading('✨ Studying your photos & videos…');
    const analysis = await analyzeMedia(mediaFiles);
    const variants = aiDescriptions(formData.businessName, analysis);
    const next = regen ? (aiIdx + 1) % variants.length : aiIdx % variants.length;
    setAiIdx(next);
    setFormData(prev => ({ ...prev, description: variants[next] }));
    setAiUsed(true);
    toast.success(regen ? '✨ Fresh version written from your media — edit freely!' : '✨ Written from your photos/videos — edit anything you like!', { id: t });
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
    if (!formData.businessName.trim() || !formData.description.trim()) { toast.error('Business name and description are required.'); return; }
    if (!formData.contact.trim()) { toast.error('Contact phone is required.'); return; }
    if (mediaFiles.length === 0) { toast.error('Add at least 1 photo or video of your business.'); return; }
    if (!receipt && !window.confirm(`No payment receipt attached!\n\nYour ad will be SAVED as "Awaiting payment". Pay ₦${plan.price.toLocaleString()} to the PayRound account shown and upload the receipt later from "My Ads" on this page — nothing will be lost.\n\nSave the ad now without the receipt?`)) return;
    setSending(true);
    const t = toast.loading('Preparing your ad…', { duration: Infinity });
    try {
      const adId = editId || `ad-${Date.now()}`;
      // 🎬 Videos go to Supabase Storage as REAL files (fast on mobile) — the ad row itself stays light & quick.
      const finalMedia = [];
      let i = 0;
      for (const m of mediaFiles) {
        i++;
        const file = rawVid.current[m];
        if (!file) { finalMedia.push(m); continue; } // photos & previously-saved items stay as they are
        toast.loading(`📤 Uploading video ${i} of ${mediaFiles.length} to storage… please don’t close this page`, { id: t });
        try {
          const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
          finalMedia.push(await uploadAdVideo(file, `ads/${adId}/media-${i}-${Date.now()}.${ext}`));
        } catch (vErr) {
          // Backup plan: a small clip can still ride inside the ad; a big one must give up with a clear message
          if (file.size <= 3.5 * 1024 * 1024) { finalMedia.push(m); toast.loading('💾 Saving your ad…', { id: t }); }
          else throw vErr;
        }
      }
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
        submitter_email: myEmail || 'visitor',
        status: 'pending',
        submitted_at: new Date().toISOString(),
      };
      // Save through a hard-timeout fetch so the button ALWAYS comes back (never stuck on "Submitting…")
      const bodyKB = Math.round(JSON.stringify(payload).length / 1024);
      if (bodyKB > MAX_PAYLOAD_KB) throw new Error(`This ad is still too heavy (~${(bodyKB / 1024).toFixed(1)}MB) — remove a photo or two and try again.`);
      const timeoutMs = bodyKB > 1400 ? 120000 : 60000;
      if (editId) {
        // fixing a declined ad — UPDATE the same row (keeps its original created date) and clear the rejection
        const { submitted_at, ...rest } = payload;
        await postgrestSave('PATCH', `ads?id=eq.${encodeURIComponent(editId)}`, { ...rest, reject_reason: null }, timeoutMs);
      } else {
        await postgrestSave('POST', 'ads', payload, timeoutMs);
      }
      toast.success(editId
        ? 'Updated ad sent for review again! 🎉 The reason it was declined is cleared.'
        : receipt
          ? 'Ad + receipt submitted! PayRound will confirm your payment and set it LIVE. 🎉'
          : '✅ Ad SAVED! Nothing is lost — pay and upload your receipt anytime from the My Ads tab.', { id: t });
      setFormData({ businessName: '', description: '', contact: '', whatsapp: '', website: '' });
      setMediaFiles([]);
      rawVid.current = {};
      setReceipt('');
      setAiUsed(false); setAiIdx(0);
      setMediaAlts([]);
      setEditId('');
      setShowForm(false);
      loadMyAds(myEmail);
      // Straight to the My Ads tab, already filtered to where the new ad landed 🎯
      if (!editId) setTimeout(() => { setTab('mine'); setMineFilter(receipt ? 'review' : 'await_receipt'); }, 450);
    } catch (err) {
      toast.error(`Could not submit: ${err.message || 'try again'}`, { id: t });
    } finally {
      setSending(false); // NEVER stuck at "Submitting…" again
    }
  };

  // Upload/replace the payment receipt on a saved ad
  const uploadReceiptFor = async (ad, file) => {
    if (!file || !file.type.startsWith('image/')) { toast.error('Receipt must be an image.'); return; }
    const t = toast.loading('Uploading receipt…', { duration: Infinity });
    try {
      const { compressImage } = await import('@/lib/image');
      const dataUrl = await compressImage(file, 1000, 0.82);
      await postgrestSave('PATCH', `ads?id=eq.${encodeURIComponent(ad.id)}`, { payment_receipt_url: dataUrl, receipt_uploaded_at: new Date().toISOString() }, 60000);
      toast.success('Receipt uploaded! PayRound will review and set your ad LIVE. 🎉', { id: t });
      setMineFilter('review'); // show it land under ⏳ Pending
      loadMyAds(myEmail);
    } catch (err) { toast.error(`Upload failed: ${err.message || 'try again'}`, { id: t }); }
  };

  // ✏️ Fix a declined ad — load it back into the form; submitting UPDATEs the same row
  const startEdit = (ad) => {
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
    setTab('create'); // jump to the Create Ad tab with the form loaded
    setShowForm(true);
    toast('Ad loaded into the form ✏️ — fix what PayRound flagged and resubmit below.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteAd = async (ad) => {
    if (!window.confirm(`Delete the ad "${ad.business_name}" permanently? This cannot be undone.`)) return;
    const t = toast.loading('Deleting…');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').delete().eq('id', ad.id);
      if (error) throw error;
      toast.success('Ad deleted.', { id: t });
      loadMyAds(myEmail);
    } catch (err) { toast.error(`Could not delete: ${err.message || 'try again'}`, { id: t }); }
  };

  const bank = { name: settings?.bank_name || 'Opay', number: settings?.account_number || '9151723199', holder: settings?.account_name || 'Basikoro James Okeroghene' };

  const StatusChip = ({ ad }) => {
    const s = statusOf(ad);
    const map = {
      await_receipt: ['💰 AWAITING PAYMENT', 'bg-amber-100 text-amber-800'],
      review: ['⏳ PAYMENT UNDER REVIEW', 'bg-blue-100 text-blue-800'],
      live: ['🟢 LIVE', 'bg-emerald-100 text-emerald-800'],
      expired: ['⌛ EXPIRED', 'bg-gray-200 text-gray-600'],
      declined: ['❌ DECLINED', 'bg-red-100 text-red-700'],
    };
    const [txt, cls] = map[s];
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{txt}</span>;
  };

  // My Ads tab — live counters + filtered view
  const mineCounts = { all: myAds.length, live: 0, review: 0, await_receipt: 0, declined: 0 };
  myAds.forEach(a => { const s = statusOf(a); if (mineCounts[s] !== undefined) mineCounts[s] += 1; });
  const shownAds = mineFilter === 'all' ? myAds : myAds.filter(a => statusOf(a) === mineFilter);
  const mineEmpty = {
    live: 'No live ads right now — once PayRound confirms your payment the ad appears here. 🟢',
    review: 'Nothing under review. Submit an ad with its receipt and it queues here while PayRound confirms the payment. ⏳',
    await_receipt: 'No saved ads waiting for payment. 💾 Save one from the Create Ad tab and it waits for you right here.',
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
        {myEmail && (
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
        {myEmail && tab === 'mine' && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📂 My Ads ({myAds.length})</h2>
            <p className="text-xs text-gray-500 mb-3">Your ads stay saved here forever — unless you delete them yourself. Saved one to pay later? It waits under <b>💾 Saved</b> — upload the receipt whenever you're ready.</p>
            {myAds.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                <p className="font-semibold text-gray-700 mb-1">You haven't submitted any ads yet</p>
                <p className="text-xs text-gray-400 mb-4">Live, pending, saved and declined ads all appear here the moment you submit one.</p>
                <button onClick={() => setTab('create')} className="bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">📢 Create Your First Ad</button>
              </div>
            ) : (
            <>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[['all', '🗂 All'], ['live', '🟢 Live'], ['review', '⏳ Pending'], ['await_receipt', '💾 Saved'], ['declined', '❌ Declined']].map(([k, label]) => (
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
                        <p className="text-[11px] text-gray-400">📅 Created: {fmtDate(ad.submitted_at)}</p>
                        {statusOf(ad) === 'live' && ad.expires_at && (
                          <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">📺 Showing until {new Date(ad.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{left !== null ? ` — ${left} day${left === 1 ? '' : 's'} left` : ''}</p>
                        )}
                        {statusOf(ad) === 'review' && (
                          <p className="text-[11px] text-blue-700 mt-0.5">✅ Receipt uploaded{ad.receipt_uploaded_at ? ` ${fmtDate(ad.receipt_uploaded_at)}` : ''} — waiting for PayRound to confirm payment.</p>
                        )}
                        {statusOf(ad) === 'await_receipt' && (
                          <p className="text-[11px] text-amber-700 mt-0.5">💡 Pay ₦{Number(ad.price || 0).toLocaleString()} to {bank.name} {bank.number} ({bank.holder}) then upload your receipt below.</p>
                        )}
                      </div>
                    </div>
                    {statusOf(ad) === 'declined' && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-red-700 mb-0.5">❌ Why PayRound declined this ad:</p>
                        <p className="text-xs text-red-800">{ad.reject_reason || 'No reason was given — please re-check the ad rules and resubmit.'}</p>
                        <button onClick={() => startEdit(ad)} className="mt-2 text-[11px] font-bold text-white bg-primary-600 px-4 py-1.5 rounded-full hover:bg-primary-700 transition-colors">✏️ Edit & Resubmit</button>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 flex-wrap">
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

        {/* CTA */}
        {tab === 'create' && !showForm && (
          <div className="text-center bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-8 md:p-12">
            <HiPhotograph className="w-12 h-12 text-primary-200 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">Advertise Your Business Here</h2>
            <p className="text-primary-100 mb-2 max-w-lg mx-auto">
              Get your business in front of active savers across Nigeria. From just <b className="text-gold-400">₦{plans[0].price.toLocaleString()}/day</b>.
            </p>
            <p className="text-primary-200 text-xs mb-6">Pay straight to the PayRound account, upload your receipt — advert goes live after payment is confirmed.</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-gold-500 text-gray-900 font-semibold px-8 py-3.5 rounded-xl hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/25"
            >
              Submit Your Ad Now
            </button>
          </div>
        )}

        {/* Form */}
        {tab === 'create' && showForm && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Advertise Your Business</h3>
              {editId && <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-3">✏️ Editing your declined ad — submitting replaces it and sends it back for review (created date stays).</p>}
              {!editId && <div className="mb-3" />}

              <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name *</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Photos / Videos * (max {MAX_MEDIA})</label>
                    <p className="text-[11px] text-gray-500 mb-1.5">💡 The Sponsored area has <b>2 portrait slots</b> and <b>1 landscape slot</b> — upload both tall and wide shots to show everywhere. Photos display up to 5s, videos up to 10s.</p>
                    <label className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-primary-300 hover:bg-primary-50/40 transition-all">
                      <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { pickMedia(e.target.files); e.target.value = ''; }} />
                      <HiPhotograph className="w-6 h-6 text-gray-400" />
                      <span className="text-xs text-gray-500">Tap to add photos or videos 🎬 — images auto-compressed, videos up to <b>{MAX_VIDEO_MB}MB</b> fly to fast file storage ({mediaFiles.length}/{MAX_MEDIA} added)</span>
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
                      <label className="block text-sm font-medium text-gray-700">Description *</label>
                      <button
                        type="button"
                        onClick={() => useAiDescription(aiUsed)}
                        className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full hover:bg-purple-100 transition-colors"
                      >
                        {aiUsed ? <><HiRefresh className="w-3 h-3" /> Regenerate</> : <><HiSparkles className="w-3 h-3" /> ✨ Write it for me (AI)</>}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-1.5">Type it yourself — or let our AI write one automatically from your business name &amp; the photos/videos you uploaded above. You can edit the result freely.</p>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Phone *</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp Number *</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Website (optional)</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5"><HiClock className="inline w-4 h-4 mr-1 -mt-0.5" />How long should your ad run? *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {plans.map(p => (
                        <button
                          type="button"
                          key={p.days}
                          onClick={() => setPlanDays(p.days)}
                          className={`rounded-xl border-2 p-3 text-center transition-all ${planDays === p.days ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-100' : 'border-gray-200 bg-white hover:border-primary-200'}`}
                        >
                          <p className={`text-sm font-bold ${planDays === p.days ? 'text-primary-700' : 'text-gray-800'}`}>{p.label}</p>
                          <p className={`text-xs font-semibold mt-0.5 ${planDays === p.days ? 'text-primary-600' : 'text-gray-500'}`}>₦{p.price.toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 💳 Pay the PayRound account */}
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/70 p-4">
                    <p className="text-[11px] font-bold text-emerald-800 mb-1"><HiCreditCard className="inline w-4 h-4 mr-1 -mt-0.5" />PAY ₦{plan.price.toLocaleString()} TO THE PAYROUND ACCOUNT</p>
                    <div className="text-xs text-gray-900 space-y-0.5">
                      <p><span className="text-gray-500">Bank:</span> <b>{bank.name}</b></p>
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-500">Account No:</span> <b className="font-mono text-sm tracking-wide">{bank.number}</b>
                        <button type="button" onClick={() => { try { navigator.clipboard.writeText(bank.number); toast.success('Account number copied! 📋'); } catch {} }} className="text-[10px] font-semibold text-emerald-700 border border-emerald-200 bg-white px-2 py-0.5 rounded-full">Copy</button>
                      </p>
                      <p><span className="text-gray-500">Name:</span> <b>{bank.holder}</b></p>
                    </div>
                    <p className="text-[10px] text-emerald-700 mt-2">Use your business name as the transfer remark. Your ad goes LIVE as soon as PayRound confirms the payment.</p>
                  </div>

                  {/* 🧾 Receipt */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Receipt (screenshot of your transfer)</label>
                    {receipt ? (
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => setViewImg(receipt)}><img src={receipt} alt="receipt" className="w-20 h-20 rounded-xl object-cover border" /></button>
                        <button type="button" onClick={() => setReceipt('')} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">✕ Remove</button>
                      </div>
                    ) : (
                      <label className="w-full border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-emerald-300 transition-all">
                        <input type="file" accept="image/*" className="hidden" onChange={e => { pickReceipt(e.target.files?.[0]); e.target.value = ''; }} />
                        <span className="text-lg">🧾</span>
                        <span className="text-xs text-gray-600 text-center">Tap to upload your transfer receipt<br /><span className="text-[10px] text-gray-400">Not paid yet? No wahala — submit now, your ad stays saved, upload the receipt anytime from My Ads.</span></span>
                      </label>
                    )}
                    {receiptError && <p className="text-xs text-red-500 mt-1">{receiptError}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
                  >
                    {sending ? 'Submitting…' : receipt ? 'Submit Ad + Receipt for Review' : 'Save Ad (upload receipt later)'}
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">Your ad details are stored safely — leaving this page to go pay will NOT delete anything.</p>
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

      <Footer />
    </div>
  );
}
