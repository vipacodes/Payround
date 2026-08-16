'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import { parseAdItems, isVideoSrc } from '@/components/AdBanner';
import {
  HiArrowLeft, HiExternalLink, HiPhone, HiPlay, HiShare, HiTrash, HiPlusCircle,
  HiBadgeCheck, HiOfficeBuilding, HiChatAlt2, HiStar
} from 'react-icons/hi';
import toast from 'react-hot-toast';

const waLink = (num) => {
  const digits = String(num || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
};

// Post once on PayRound → share into any WhatsApp group/status with one tap
const SITE_URL = 'https://payround-omega.vercel.app';
const waShare = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const bizUrl = (id) => `${SITE_URL}/business/${id}`;
const itemUrl = (id, idx) => `${SITE_URL}/business/${id}?item=${idx}`;

// A business can hold up to twelve posted items.
const MAX_ITEMS = 12;
// A posted item carries an optional name + price (₦) shown to everyone
const priceOk = (m) => m && m.price !== undefined && m.price !== null && m.price !== '';

function StarsRow({ n, className = '' }) {
  return <span className={`text-yellow-500 tracking-tight ${className}`}>{'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}</span>;
}

// 🔍 Full-screen media viewer — tap any photo/video on the page. Videos start MUTED
// (sound only after you tap 🔊); closing ALWAYS stops the video — no ghost audio.
function BizLightbox({ view, onClose, onNav }) {
  const vidRef = useRef(null);
  const cur = view.list[view.idx];
  const vid = isVideoSrc(cur);
  const [muted, setMuted] = useState(true);
  useEffect(() => { setMuted(true); }, [view.idx]); // 🔇 every item starts silent until tapped
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = muted;
    const p = v.play();
    if (p && p.catch && !muted) p.catch(() => { try { v.muted = true; setMuted(true); v.play().catch(() => {}); } catch {} });
  }, [muted, cur]);
  useEffect(() => () => {
    const v = vidRef.current;
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} }
  }, [cur]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNav]);
  return (
    <div className="fixed inset-0 z-[96] bg-black/95 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 p-3" onClick={e => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="font-bold text-sm text-white truncate">{view.name || 'Business media'}</div>
          <div className="text-[11px] text-white/60">{view.idx + 1} of {view.list.length} · {vid ? 'Video 🔇 (tap for sound)' : 'Photo'}</div>
        </div>
        <button onClick={onClose} className="shrink-0 bg-white/15 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-full">✕ Close</button>
      </div>
      <div className="flex-1 relative flex items-center justify-center px-12 pb-5" onClick={e => e.stopPropagation()}>
        {vid
          ? <video key={view.idx} ref={vidRef} src={cur} controls autoPlay muted={muted} playsInline className="max-w-full max-h-full rounded-xl"
              onClick={e => e.stopPropagation()} />
          : <img key={view.idx} src={cur} alt="" className="max-w-full max-h-full object-contain rounded-xl" />}
        {muted && vid && (
          <button onClick={(e) => { e.stopPropagation(); setMuted(false); }}
            className="absolute top-2 right-2 bg-white/20 hover:bg-white/35 text-white text-xs font-bold px-4 py-2 rounded-full z-20 border border-white/30">🔊 Tap for sound</button>
        )}
        {view.list.length > 1 && (
          <>
            <button onClick={() => onNav(-1)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/30 text-white rounded-full w-10 h-10 text-xl">‹</button>
            <button onClick={() => onNav(1)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/30 text-white rounded-full w-10 h-10 text-xl">›</button>
          </>
        )}
      </div>
    </div>
  );
}

function BusinessContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pinnedItem = parseInt(searchParams.get('item') ?? '-1', 10);
  const [ad, setAd] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewerEmail, setViewerEmail] = useState('');
  const [access, setAccess] = useState({ isPublic: false, isSubmitter: false, isStaffPreview: false, canManage: false });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(null); // staged media { src, isVideo } awaiting name/price
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [fsv, setFsv] = useState(null);               // 🔍 full-screen media viewer { list, idx }
  const [viewerName, setViewerName] = useState('');
  const [reviews, setReviews] = useState([]);          // ⭐ public business reviews
  const [revStars, setRevStars] = useState(5);
  const [revText, setRevText] = useState('');
  const [revBusy, setRevBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    try {
      const u = JSON.parse(localStorage.getItem('payround_user') || '{}');
      setViewerEmail((u.email || '').toLowerCase());
      setViewerName((u.name || '').trim());
    } catch {}
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        // One purpose-built RPC applies the same active-business rule as profile
        // cards/search and returns only safe public owner fields (never their email).
        const { data, error } = await supabase.rpc('get_business_page', { p_ad_id: String(params.id || '') });
        if (!mounted) return;
        if (error || !data?.ad) { setNotFound(true); setLoading(false); return; }
        setAd(data.ad);
        setOwner(data.owner || null);
        setAccess({
          isPublic: Boolean(data.is_public),
          isSubmitter: Boolean(data.is_submitter),
          isStaffPreview: Boolean(data.is_staff_preview),
          canManage: Boolean(data.can_manage),
        });
        // Ad clicks are recorded only by the sponsored placement that led here.
        // Ordinary profile loads, bookmarks and shared business URLs are not ad activity.
      } catch { if (mounted) setNotFound(true); }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [params.id]);

  // ⭐ Load public reviews for this business
  useEffect(() => {
    let alive = true;
    if (!ad?.id) return;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.from('business_reviews')
          .select('*').eq('ad_id', String(ad.id))
          .order('created_at', { ascending: false }).limit(60);
        if (alive && data) setReviews(data);
      } catch {}
    })();
    return () => { alive = false; };
  }, [ad?.id]);

  const myReview = viewerEmail ? reviews.find(r => (r.reviewer || '').toLowerCase() === viewerEmail) : null;

  // ⭐ Post (or update the viewer's own) review — public for everyone to see
  const submitReview = async () => {
    if (!viewerEmail) { toast.error('Log in to drop a review.'); return; }
    setRevBusy(true);
    try {
      const name = viewerName || viewerEmail.split('@')[0];
      const { supabase } = await import('@/lib/supabase');
      const row = {
        ad_id: String(ad.id), reviewer: viewerEmail, reviewer_name: name,
        rating: revStars, text: revText.trim() || null,
      };
      let error;
      if (myReview) {
        ({ error } = await supabase.from('business_reviews')
          .update({ rating: revStars, text: revText.trim() || null, reviewer_name: name })
          .eq('id', myReview.id));
      } else {
        ({ error } = await supabase.from('business_reviews').insert(row));
      }
      if (error) throw error;
      const { data } = await supabase.from('business_reviews')
        .select('*').eq('ad_id', String(ad.id)).order('created_at', { ascending: false }).limit(60);
      setReviews(data || []);
      setRevText(
        ''); setRevStars(5);
      toast.success(myReview ? '⭐ Your review was updated!' : '⭐ Thank you — your review is public now!');
    } catch (e) { toast.error(`Could not post the review: ${(e.message || 'try again').slice(0, 120)}`); }
    setRevBusy(false);
  };

  // Step 1: stage a picked photo/video — then the advertiser adds the item's name & price
  const stageItem = async (file) => {
    if (!file) return;
    const items = parseAdItems(ad.media_urls);
    if (items.length >= MAX_ITEMS) { toast.error(`Maximum of ${MAX_ITEMS} items per business — delete one first.`); return; }
    const isVideo = file.type.startsWith('video/');
    if (!isVideo && !file.type.startsWith('image/')) { toast.error('Only images and videos are allowed.'); return; }
    if (isVideo && file.size > 6 * 1024 * 1024) { toast.error('Videos must be 6MB or less.'); return; }
    setAdding(true);
    try {
      let dataUrl;
      if (isVideo) {
        dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      } else {
        const { compressImage } = await import('@/lib/image');
        dataUrl = await compressImage(file, 900, 0.82);
      }
      setItemName(''); setItemPrice('');
      setDraft({ src: dataUrl, isVideo });
    } catch { toast.error('Could not read that file — try another.'); }
    setAdding(false);
  };

  // Step 2: post the staged item WITH its name & price — live instantly for everyone
  const postItem = async () => {
    if (!draft) return;
    const price = itemPrice.trim() ? Number(itemPrice.replace(/[^0-9.]/g, '')) : null;
    if (itemPrice.trim() && (!Number.isFinite(price) || price < 0)) { toast.error('Enter a valid price in naira.'); return; }
    setAdding(true);
    try {
      const items = parseAdItems(ad.media_urls);
      const item = { src: draft.src };
      if (itemName.trim()) item.name = itemName.trim();
      if (price !== null) item.price = price;
      const next = [...items, item];
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').update({ media_urls: JSON.stringify(next) }).eq('id', ad.id);
      if (error) throw error;
      setAd(prev => ({ ...prev, media_urls: JSON.stringify(next) }));
      setDraft(null);
      toast.success('✅ Item added — it is live now! Tap Share to send it to your WhatsApp groups & status. 📤');
    } catch (e) { toast.error(`Could not add item: ${e.message || 'try again'}`); }
    setAdding(false);
  };

  // Advertiser (or PayRound) can delete an item — it disappears for everyone
  const deleteItem = async (idx) => {
    if (!window.confirm('Delete this item? It disappears for everyone.')) return;
    const items = parseAdItems(ad.media_urls);
    const next = items.filter((_, i) => i !== idx);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').update({ media_urls: JSON.stringify(next) }).eq('id', ad.id);
      if (error) throw error;
      setAd(prev => ({ ...prev, media_urls: JSON.stringify(next) }));
      toast.success('Item deleted.');
    } catch (e) { toast.error(`Could not delete: ${e.message || 'try again'}`); }
  };

  if (loading) return <LoadingScreen label="Loading business…" />;
  if (notFound || !ad) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <HiOfficeBuilding className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Business not found</h2>
          <p className="text-sm text-gray-500 mb-4">This business profile may have been removed.</p>
          <button onClick={() => router.push('/')} className="bg-primary-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl">Go Home</button>
        </div>
        <Footer />
      </div>
    );
  }

  const media = parseAdItems(ad.media_urls).map((it, idx) => ({ ...it, idx }));
  const pinned = pinnedItem >= 0 && pinnedItem < media.length ? media[pinnedItem] : null;
  const rest = media.filter((m) => m.idx !== pinnedItem);
  const wa = waLink(ad.whatsapp || ad.contact);
  // The database decides visibility and management from the verified session.
  // Archived, declined, removed and expired ads are never treated as live businesses.
  const isSubmitter = access.isSubmitter;
  const canManage = access.canManage;
  const bizLive = access.isPublic;
  const isStaffPreview = access.isStaffPreview;

  if (!bizLive && !isSubmitter && !isStaffPreview) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <HiOfficeBuilding className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">⏳ This business is under review</h2>
          <p className="text-sm text-gray-500 mb-4">PayRound checks every business before it shows publicly — check back soon!</p>
          <button onClick={() => router.push('/')} className="bg-primary-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl">Go Home</button>
        </div>
        <Footer />
      </div>
    );
  }

  // ⭐ review stats
  const revCount = reviews.length;
  const revAvg = revCount ? Math.round((reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / revCount) * 10) / 10 : 0;

  const shareBizText = () => `🛍️ ${ad.business_name}\n${(ad.description || '').slice(0, 120)}\n\nSee all their items on PayRound: ${bizUrl(ad.id)}`;
  const shareItemText = (idx) => `🛍️ Check out this item from ${ad.business_name} on PayRound:\n${itemUrl(ad.id, idx)}\n\n💬 View all their items and chat with the business right there.`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        {!bizLive && (
          <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3.5">
            <p className="text-sm font-extrabold text-amber-800">⏳ Your business is under review</p>
            <p className="text-xs text-amber-700 mt-0.5">Only you can see this page for now — it goes public for everyone the moment PayRound approves it. You can still add, price and delete your items below. 👍</p>
          </div>
        )}

        {/* Business header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-gold-100 rounded-2xl flex items-center justify-center shrink-0">
              <span className="text-gold-700 font-bold text-2xl">{(ad.business_name || 'B').charAt(0)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
                {ad.business_name}
                <HiBadgeCheck className="w-5 h-5 text-primary-500 shrink-0" title="Approved business on PayRound" />
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {bizLive ? (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
                    <HiStar className="w-3 h-3" /> Approved business
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 inline-flex items-center gap-1 px-2 py-0.5 rounded-full">⏳ Under review</p>
                )}
                {revCount > 0 && (
                  <span className="text-[11px] text-gray-700 bg-gray-100 border border-gray-200 inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
                    <span className="text-yellow-500">★</span> <b>{revAvg}</b> · {revCount} review{revCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {owner && (
                <button onClick={() => router.push(`/users/${owner.id}`)} title="Switch to their personal profile"
                  className="text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full mt-1.5 flex items-center gap-1.5 transition-colors">
                  {owner.profile_pic && <img src={owner.profile_pic} alt="" className="w-4 h-4 rounded-full object-cover" />}
                  👤 {owner.name || 'a PayRound member'} · View personal profile
                </button>
              )}
            </div>
          </div>
          {ad.description && <p className="text-sm text-gray-700 mt-4 whitespace-pre-line">{ad.description}</p>}

          {/* Contact actions — WhatsApp is visible here */}
          <div className="flex flex-wrap gap-2 mt-4">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#25D366] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:brightness-110 transition-all shadow-md shadow-green-200">
                <HiChatAlt2 className="w-5 h-5" /> Chat on WhatsApp
              </a>
            )}
            {/* Share the whole business into any WhatsApp group / status */}
            <a href={waShare(shareBizText())} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#25D366]/10 text-[#128C4A] border border-[#25D366]/40 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#25D366]/20 transition-all">
              <HiShare className="w-5 h-5" /> Share Business
            </a>
            {owner?.id && !isSubmitter && (
              <button onClick={() => router.push(`/messages?user=${encodeURIComponent(owner.id)}`)}
                className="flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-800 transition-all">
                <HiChatAlt2 className="w-5 h-5" /> Message
              </button>
            )}
            {ad.contact && (
              <a href={`tel:${ad.contact}`} className="flex items-center gap-2 bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-200 transition-all">
                <HiPhone className="w-4 h-4" /> {ad.contact}
              </a>
            )}
            {ad.website && (
              <a href={ad.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-200 transition-all">
                <HiExternalLink className="w-4 h-4" /> Website
              </a>
            )}
          </div>
        </div>

        {/* Manager tools — only the advertiser (or PayRound) sees this */}
        {canManage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5">
            <p className="text-sm font-bold text-emerald-800 mb-1">📦 This is your business — manage items</p>
            <p className="text-xs text-emerald-700 mb-3">Post items here once (they never expire unless you delete them), then tap <b>Share</b> on any item to blast it to all your WhatsApp groups &amp; status.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className={`inline-flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-emerald-700 transition-colors ${adding ? 'opacity-60 pointer-events-none' : ''}`}>
                <HiPlusCircle className="w-5 h-5" />
                {adding ? 'Adding…' : 'Add Item (photo or video)'}
                <input type="file" accept="image/*,video/*" className="hidden" disabled={adding} onChange={(e) => { stageItem(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <span className="text-[11px] text-emerald-700">{media.length}/{MAX_ITEMS} items live</span>
            </div>
            {/* staged item — add name & price before it goes live */}
            {draft && (
              <div className="mt-3 bg-white border border-emerald-200 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  {draft.isVideo ? (
                    <video src={draft.src} muted className="w-20 h-20 object-cover rounded-lg bg-black shrink-0" />
                  ) : (
                    <img src={draft.src} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0" />
                  )}
                  <div className="flex-1 space-y-2">
                    <input type="text" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Item name (optional) e.g. Ankara bag" maxLength={60}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                      <span className="px-3 py-2 bg-gray-50 text-sm font-bold text-gray-500 border-r border-gray-200">₦</span>
                      <input type="text" inputMode="numeric" value={itemPrice} onChange={e => setItemPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Price (optional) e.g. 8500"
                        className="flex-1 px-3 py-2 text-sm focus:outline-none" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={postItem} disabled={adding} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg transition-colors">{adding ? 'Posting…' : '✅ Post Item'}</button>
                      <button onClick={() => setDraft(null)} className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-emerald-700 mt-2">💡 Items with clear prices get more messages from buyers.</p>
              </div>
            )}
          </div>
        )}

        {/* The item the user tapped on the ad shows FIRST */}
        {pinned && (
          <div className="bg-white rounded-2xl border-2 border-gold-300 p-4 mb-4">
            <p className="text-[11px] font-bold text-gold-700 mb-2 flex items-center gap-1"><HiStar className="w-3.5 h-3.5" /> ITEM YOU VIEWED</p>
            <button type="button" onClick={() => { try { document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} }); } catch {} setFsv({ list: media.map(m => m.src), idx: pinned.idx }); }}
              className="block w-full relative" title="Tap for FULL SCREEN 🔍">
              {isVideoSrc(pinned.src) ? (
                <>
                  <video src={pinned.src} autoPlay muted playsInline loop className="w-full max-h-[420px] rounded-xl bg-black pointer-events-none" />
                  <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full">🔍 tap for full screen 🔇</span>
                </>
              ) : (
                <>
                  <img src={pinned.src} alt="" className="w-full max-h-[420px] object-contain rounded-xl bg-gray-50" />
                  <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full">🔍 tap to zoom</span>
                </>
              )}
            </button>
            {(pinned.name || priceOk(pinned)) && (
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {pinned.name && <p className="text-sm font-bold text-gray-900">{pinned.name}</p>}
                {priceOk(pinned) && <span className="bg-gold-500 text-gray-900 text-xs font-bold px-2.5 py-1 rounded-full">₦{Number(pinned.price).toLocaleString()}</span>}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3">
              <a href={waShare(shareItemText(pinned.idx))} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-[#128C4A] hover:brightness-110">
                <HiShare className="w-4 h-4" /> Share to WhatsApp
              </a>
              {canManage && (
                <button onClick={() => deleteItem(pinned.idx)} className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600">
                  <HiTrash className="w-4 h-4" /> Delete
                </button>
              )}
            </div>
          </div>
        )}

        {/* All items */}
        <h2 className="font-bold text-gray-900 mb-3 text-sm">
          {pinned ? 'More items from this business' : 'Items from this business'} {media.length > 0 && <span className="text-xs font-normal text-gray-400">({media.length})</span>}
        </h2>
        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {rest.map((m) => (
              <div key={m.idx} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button type="button" onClick={() => { try { document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} }); } catch {} setFsv({ list: media.map(m2 => m2.src), idx: m.idx }); }}
                  className="block w-full relative" title="Tap for FULL SCREEN 🔍">
                  {isVideoSrc(m.src) ? (
                    <>
                      <video src={m.src} muted playsInline preload="metadata" className="w-full h-44 object-cover bg-black pointer-events-none" />
                      <span className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><HiPlay className="w-3.5 h-3.5" /></span>
                    </>
                  ) : (
                    <img src={m.src} alt={m.name || ''} className="w-full h-44 object-cover" />
                  )}
                  {priceOk(m) && (
                    <span className="absolute top-2 left-2 bg-gold-500 text-gray-900 text-[11px] font-bold px-2 py-0.5 rounded-full shadow">₦{Number(m.price).toLocaleString()}</span>
                  )}
                  <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">🔍</span>
                </button>
                {m.name && <p className="px-3 pt-2 text-xs font-semibold text-gray-900 truncate">{m.name}</p>}
                <div className="flex items-center gap-3 px-3 py-2">
                  <a href={waShare(shareItemText(m.idx))} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-[#128C4A] hover:brightness-110">
                    <HiShare className="w-3.5 h-3.5" /> Share
                  </a>
                  {canManage && (
                    <button onClick={() => deleteItem(m.idx)} className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-600">
                      <HiTrash className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : media.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 mb-6">
            No item photos or videos uploaded yet — chat with the business on WhatsApp to ask.
          </div>
        ) : null}

        {/* ⭐ PUBLIC REVIEWS — every customer can drop their honest verdict */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="font-bold text-gray-900 text-sm">⭐ Customer Reviews</h2>
            {revCount > 0 && (
              <span className="text-xs text-gray-600 flex items-center gap-1">
                <StarsRow n={Math.round(revAvg)} /> <b>{revAvg}</b> ({revCount})
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Bought from {ad.business_name}? your rating helps the whole PayRound community. 💚</p>

          {/* the review form — one review per account, editable any time */}
          {viewerEmail ? (
            isSubmitter ? (
              <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-3">This is your business — you can&apos;t review yourself 😄. Your customers&apos; reviews appear below.</p>
            ) : (
              <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                {myReview && <p className="text-[10px] font-bold text-primary-700 mb-1.5">✏️ You reviewed this business — update it anytime:</p>}
                <div className="flex items-center gap-1.5 mb-2">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} type="button" onClick={() => setRevStars(s)} aria-label={`${s} star${s > 1 ? 's' : ''}`}
                      className={`text-2xl leading-none transition-transform ${revStars >= s ? 'text-yellow-400 scale-110' : 'text-gray-300'}`}>★</button>
                  ))}
                  <span className="text-[11px] font-bold text-gray-500 ml-1">{['Terrible', 'Bad', 'Okay', 'Good', 'Great'][revStars - 1]}</span>
                </div>
                <textarea value={revText} onChange={e => setRevText(e.target.value)} rows={2} maxLength={400}
                  placeholder="One line is enough — e.g. Fast delivery, exactly like the photos!"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <button onClick={submitReview} disabled={revBusy}
                  className="mt-2 bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors">
                  {revBusy ? 'Posting…' : myReview ? '✅ Update my review' : '⭐ Post my review'}
                </button>
              </div>
            )
          ) : (
            <p className="text-[11px] text-gray-500 mb-3">🔒 <a href="/login" className="font-bold text-primary-700 underline">Log in</a> to drop your own review — it is public for everyone.</p>
          )}

          {/* the reviews wall */}
          {revCount === 0 ? (
            <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">No reviews yet — the first customer review lands here. 🌱</p>
          ) : (
            <div className="space-y-2.5">
              {(myReview ? [myReview, ...reviews.filter(r => r.id !== myReview.id)] : reviews).map(r => (
                <div key={r.id} className={`rounded-xl p-3 border ${viewerEmail && (r.reviewer || '').toLowerCase() === viewerEmail ? 'border-primary-200 bg-primary-50/50' : 'border-gray-100 bg-gray-50/60'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-900">
                      {r.reviewer_name || 'A customer'}
                      {viewerEmail && (r.reviewer || '').toLowerCase() === viewerEmail && <span className="ml-1.5 text-[9px] font-extrabold text-primary-700 bg-primary-100 px-1.5 py-0.5 rounded-full">YOURS</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <StarsRow n={Math.max(1, Math.min(5, Number(r.rating) || 5))} />
                      <span className="text-[10px] text-gray-400">{r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                    </span>
                  </div>
                  {r.text && <p className="text-xs text-gray-700 mt-1 whitespace-pre-line">{r.text}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 🔍 FULL-SCREEN media — unmount always stops any playing video */}
      {fsv && <BizLightbox view={fsv} onClose={() => setFsv(null)} onNav={(d) => setFsv(v => (v ? { ...v, idx: (v.idx + d + v.list.length) % v.list.length } : v))} />}

      <Footer />
    </div>
  );
}

export default function BusinessProfilePage() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading business…" />}>
      <BusinessContent />
    </Suspense>
  );
}
