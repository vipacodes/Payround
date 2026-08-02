'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import { parseAdMedia, isVideoSrc } from '@/components/AdBanner';
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

// PayRound accounts allowed to manage ANY ad's items (e.g. the house ads)
const MANAGER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
const MAX_ITEMS = 12;

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
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let mounted = true;
    try { setViewerEmail((JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase()); } catch {}
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.from('ads').select('*').eq('id', params.id).single();
        if (!mounted) return;
        if (error || !data || data.status !== 'approved') { setNotFound(true); setLoading(false); return; }
        setAd(data);
        // The person advertising — their PayRound profile stays linked to the business
        if (data.submitter_email && data.submitter_email !== 'visitor') {
          const { data: u } = await supabase.from('users').select('id, name, is_verified, profile_pic').eq('email', data.submitter_email.toLowerCase()).single();
          if (mounted && u) setOwner(u);
        }
      } catch { if (mounted) setNotFound(true); }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [params.id]);

  // Advertiser posts a NEW item — it goes live instantly (photos compressed, videos up to 6MB)
  const addItem = async (file) => {
    if (!file) return;
    const items = parseAdMedia(ad.media_urls);
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
      const next = [...items, dataUrl];
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').update({ media_urls: JSON.stringify(next) }).eq('id', ad.id);
      if (error) throw error;
      setAd(prev => ({ ...prev, media_urls: JSON.stringify(next) }));
      toast.success('✅ Item added — it is live now! Tap Share to send it to your WhatsApp groups & status. 📤');
    } catch (e) { toast.error(`Could not add item: ${e.message || 'try again'}`); }
    setAdding(false);
  };

  // Advertiser (or PayRound) can delete an item — it disappears for everyone
  const deleteItem = async (idx) => {
    if (!window.confirm('Delete this item? It disappears for everyone.')) return;
    const items = parseAdMedia(ad.media_urls);
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

  const media = parseAdMedia(ad.media_urls).map((src, idx) => ({ src, idx }));
  const pinned = pinnedItem >= 0 && pinnedItem < media.length ? media[pinnedItem] : null;
  const rest = media.filter((m) => m.idx !== pinnedItem);
  const wa = waLink(ad.whatsapp || ad.contact);
  // The advertiser manages their own items; PayRound accounts can manage any ad
  const canManage = !!viewerEmail && (viewerEmail === (ad.submitter_email || '').toLowerCase() || MANAGER_EMAILS.includes(viewerEmail));

  const shareBizText = () => `🛍️ ${ad.business_name}\n${(ad.description || '').slice(0, 120)}\n\nSee all their items on PayRound: ${bizUrl(ad.id)}`;
  const shareItemText = (idx) => `🛍️ Check out this item from ${ad.business_name} on PayRound:\n${itemUrl(ad.id, idx)}\n\n💬 View all their items and chat with the business right there.`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

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
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 inline-flex items-center gap-1 px-2 py-0.5 rounded-full mt-1">
                <HiStar className="w-3 h-3" /> Approved business
              </p>
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
                <input type="file" accept="image/*,video/*" className="hidden" disabled={adding} onChange={(e) => { addItem(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <span className="text-[11px] text-emerald-700">{media.length}/{MAX_ITEMS} items live</span>
            </div>
          </div>
        )}

        {/* The item the user tapped on the ad shows FIRST */}
        {pinned && (
          <div className="bg-white rounded-2xl border-2 border-gold-300 p-4 mb-4">
            <p className="text-[11px] font-bold text-gold-700 mb-2 flex items-center gap-1"><HiStar className="w-3.5 h-3.5" /> ITEM YOU VIEWED</p>
            {isVideoSrc(pinned.src) ? (
              <video src={pinned.src} controls autoPlay muted playsInline className="w-full max-h-[420px] rounded-xl bg-black" />
            ) : (
              <img src={pinned.src} alt="" className="w-full max-h-[420px] object-contain rounded-xl bg-gray-50" />
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
                {isVideoSrc(m.src) ? (
                  <div className="relative">
                    <video src={m.src} controls muted playsInline preload="metadata" className="w-full h-44 object-cover bg-black" />
                    <span className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><HiPlay className="w-3.5 h-3.5" /></span>
                  </div>
                ) : (
                  <img src={m.src} alt="" className="w-full h-44 object-cover" />
                )}
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
      </div>

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
