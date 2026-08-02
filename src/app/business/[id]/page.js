'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import { parseAdMedia, isVideoSrc } from '@/components/AdBanner';
import {
  HiArrowLeft, HiExternalLink, HiPhone, HiPlay,
  HiBadgeCheck, HiOfficeBuilding, HiChatAlt2, HiStar
} from 'react-icons/hi';

const waLink = (num) => {
  const digits = String(num || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
};

function BusinessContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pinnedItem = parseInt(searchParams.get('item') ?? '-1', 10);
  const [ad, setAd] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let mounted = true;
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

  const media = parseAdMedia(ad.media_urls);
  const pinned = pinnedItem >= 0 && pinnedItem < media.length ? media[pinnedItem] : null;
  const rest = media.filter((_, i) => i !== pinnedItem);
  const wa = waLink(ad.whatsapp || ad.contact);

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
                <button onClick={() => router.push(`/users/${owner.id}`)} className="text-xs text-primary-600 font-medium mt-1.5 flex items-center gap-1.5 hover:text-primary-700">
                  {owner.profile_pic && <img src={owner.profile_pic} alt="" className="w-5 h-5 rounded-full object-cover" />}
                  Advertised by {owner.name || 'a PayRound member'}
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

        {/* The item the user tapped on the ad shows FIRST */}
        {pinned && (
          <div className="bg-white rounded-2xl border-2 border-gold-300 p-4 mb-4">
            <p className="text-[11px] font-bold text-gold-700 mb-2 flex items-center gap-1"><HiStar className="w-3.5 h-3.5" /> ITEM YOU VIEWED</p>
            {isVideoSrc(pinned) ? (
              <video src={pinned} controls autoPlay muted playsInline className="w-full max-h-[420px] rounded-xl bg-black" />
            ) : (
              <img src={pinned} alt="" className="w-full max-h-[420px] object-contain rounded-xl bg-gray-50" />
            )}
          </div>
        )}

        {/* All items */}
        <h2 className="font-bold text-gray-900 mb-3 text-sm">
          {pinned ? 'More items from this business' : 'Items from this business'} {media.length > 0 && <span className="text-xs font-normal text-gray-400">({media.length})</span>}
        </h2>
        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {rest.map((m, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {isVideoSrc(m) ? (
                  <div className="relative">
                    <video src={m} controls muted playsInline preload="metadata" className="w-full h-44 object-cover bg-black" />
                    <span className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><HiPlay className="w-3.5 h-3.5" /></span>
                  </div>
                ) : (
                  <img src={m} alt="" className="w-full h-44 object-cover" />
                )}
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
