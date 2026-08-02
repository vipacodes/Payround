'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HiExternalLink, HiPhone, HiChevronLeft, HiChevronRight } from 'react-icons/hi';

// Media helpers — ads can carry a slideshow of business images/videos
export function parseAdMedia(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch { return []; }
}
export function isVideoSrc(src) {
  if (!src) return false;
  return src.startsWith('data:video') || /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(src);
}

export default function AdBanner({ ad: raw, variant = 'card', big = false }) {
  const media = parseAdMedia(raw?.media_urls);
  const [idx, setIdx] = useState(0);

  // Slideshow — auto-advance every 3.5s when the ad has multiple items
  useEffect(() => {
    if (media.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % media.length), 3500);
    return () => clearInterval(t);
  }, [media.length]);

  if (!raw) return null;
  // Normalize: works with bundled demo ads AND real ads from the database
  const ad = {
    id: raw.id,
    businessName: raw.businessName || raw.business_name || 'Business',
    description: raw.description || '',
    website: raw.website || null,
    contact: raw.contact || raw.phone || '',
    whatsapp: raw.whatsapp || raw.contact || '',
    active: raw.active !== undefined ? raw.active : raw.status === 'approved',
  };
  if (!ad.active) return null;

  const current = media[idx] || null;
  const itemParam = current ? `?item=${idx}` : '';

  const mediaBox = current ? (
    <Link href={`/business/${raw.id}${itemParam}`} className="block relative group mb-3" title="Open business profile">
      {isVideoSrc(current) ? (
        <video src={current} muted loop playsInline autoPlay className={`w-full ${big ? 'h-48' : 'h-36'} object-cover rounded-xl bg-black`} />
      ) : (
        <img src={current} alt="" className={`w-full ${big ? 'h-48' : 'h-36'} object-cover rounded-xl`} />
      )}
      <span className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/15 transition-all"></span>
      {media.length > 1 && (
        <>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx((idx - 1 + media.length) % media.length); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all"
          ><HiChevronLeft className="w-4 h-4" /></button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx((idx + 1) % media.length); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all"
          ><HiChevronRight className="w-4 h-4" /></button>
          <span className="absolute bottom-1.5 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">{idx + 1}/{media.length}</span>
        </>
      )}
    </Link>
  ) : null;

  if (variant === 'banner') {
    return (
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg mb-1">{ad.businessName}</h3>
            <p className="text-sm text-primary-100">{ad.description}</p>
          </div>
          <div className="flex items-center gap-3">
            {ad.website && (
              <a href={ad.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-white/20 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/30 transition-all">
                <HiExternalLink className="w-4 h-4" />
                Visit
              </a>
            )}
            <a href={`tel:${ad.contact}`} className="flex items-center gap-1.5 bg-white/20 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/30 transition-all">
              <HiPhone className="w-4 h-4" />
              Call
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 ${big ? 'p-5' : 'p-4'} card-hover h-full`}>
      {mediaBox}
      <div className="flex items-start gap-4">
        {!current && (
          <div className="w-14 h-14 bg-gradient-to-br from-gold-100 to-gold-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-gold-700 font-bold text-xl">{(ad.businessName || 'B').charAt(0)}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link href={`/business/${raw.id}${itemParam}`}>
            <h3 className={`font-semibold text-gray-900 ${big ? 'text-base' : 'text-sm'} mb-1 hover:text-primary-600 transition-colors`}>{ad.businessName}</h3>
          </Link>
          <p className={`${big ? 'text-sm' : 'text-xs'} text-gray-600 mb-3 line-clamp-2`}>{ad.description}</p>
          <div className="flex items-center flex-wrap gap-3">
            <Link href={`/business/${raw.id}${itemParam}`} className="flex items-center gap-1 text-xs text-primary-600 font-semibold hover:text-primary-700">
              View Business →
            </Link>
            {ad.website && (
              <a href={ad.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-gray-700">
                <HiExternalLink className="w-3.5 h-3.5" />
                Website
              </a>
            )}
            {ad.contact && (
              <a href={`tel:${ad.contact}`} className="flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-gray-700">
                <HiPhone className="w-3.5 h-3.5" />
                {ad.contact}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
