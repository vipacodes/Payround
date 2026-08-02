'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { parseAdMedia, isVideoSrc } from './AdBanner';

// Remembers the last shown ad across visits, so a returning visitor starts on a NEW ad
const CURSOR_KEY = 'payround_ad_cursor';
const SLIDE_MS = 2000; // auto-slide every 2 seconds

export default function AdSlideshow({ ads, className = '' }) {
  const [pos, setPos] = useState(null);    // { a: adIndex, m: mediaIndex }
  const [stopped, setStopped] = useState(false);
  const adsRef = useRef(ads || []);
  adsRef.current = ads || [];
  const touchX = useRef(null);
  const active = adsRef.current.length;
  const ready = pos !== null;

  // On mount: resume at the ad AFTER the one last shown — every visit shows a fresh business
  useEffect(() => {
    if (!active || pos !== null) return;
    let start = 0;
    try {
      const saved = parseInt(localStorage.getItem(CURSOR_KEY) || '-1', 10);
      start = Number.isFinite(saved) && saved >= 0 ? (saved + 1) % active : 0;
    } catch {}
    setPos({ a: start, m: 0 });
  }, [active, pos]);

  // Remember the last shown ad across visits
  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem(CURSOR_KEY, String(pos.a)); } catch {}
  }, [pos]);

  // Auto slideshow — 2s per slide, walking through EVERY photo/video of EVERY live ad.
  // An ad is never repeated until every ad has been shown, then it starts from the first again.
  useEffect(() => {
    if (!active || !ready || stopped) return;
    const t = setInterval(() => {
      setPos(p => {
        if (!p) return p;
        const list = adsRef.current || [];
        const len = list.length;
        if (!len) return p;
        const a = ((p.a % len) + len) % len;
        const media = parseAdMedia(list[a]?.media_urls);
        if (media.length > 0 && p.m + 1 < media.length) return { a, m: p.m + 1 };
        return { a: (a + 1) % len, m: 0 };
      });
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [active, ready, stopped]);

  // Manual slide (arrows or swipe) — stops the auto slideshow
  const step = (dir) => {
    setStopped(true);
    setPos(p => {
      if (!p) return p;
      const len = (adsRef.current || []).length;
      if (!len) return p;
      return { a: ((p.a + dir) % len + len) % len, m: 0 };
    });
  };

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
  };

  if (!active || !pos) return null;

  const list = adsRef.current;
  const a = ((pos.a % active) + active) % active;
  const raw = list[a];
  const media = parseAdMedia(raw?.media_urls);
  const m = media.length ? Math.min(pos.m, media.length - 1) : 0;
  const current = media[m] || null;
  const itemParam = current ? `?item=${m}` : '';
  const businessName = raw.businessName || raw.business_name || 'Business';
  const description = raw.description || '';

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative h-[46vh] min-h-[330px] max-h-[540px] rounded-2xl overflow-hidden bg-gray-900 shadow-lg shadow-gray-200 select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ===== current slide media — tap to open the business profile (tapped item pinned first) ===== */}
        <Link href={`/business/${raw.id}${itemParam}`} className="absolute inset-0 block" title={`Open ${businessName}`}>
          {current ? (
            isVideoSrc(current) ? (
              <div key={`${a}-${m}`} className="ad-slide-media absolute inset-0 flex items-center justify-center bg-black">
                {/* object-contain: the FULL video is visible, never cropped */}
                <video src={current} muted loop playsInline autoPlay className="w-full h-full object-contain" />
              </div>
            ) : (
              <div key={`${a}-${m}`} className="ad-slide-media absolute inset-0">
                {/* blurred backdrop fills the frame so the edges always look designed */}
                <div aria-hidden="true" className="absolute inset-0 scale-125 blur-2xl opacity-60 bg-center bg-cover" style={{ backgroundImage: `url("${current}")` }} />
                {/* object-contain: the FULL image is visible at full resolution, never cropped */}
                <img src={current} alt={businessName} className="relative w-full h-full object-contain" />
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900">
              <span className="text-6xl font-bold text-white/60">{(businessName || 'B').charAt(0)}</span>
            </div>
          )}
        </Link>

        {/* ===== top badges ===== */}
        <span className="absolute top-3 left-3 bg-gold-500 text-gray-900 text-[11px] font-bold px-2.5 py-1 rounded-full shadow">Sponsored</span>
        <span className="absolute top-3 right-3 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
          Ad {a + 1} of {active}
        </span>

        {/* ===== previous / next ad — manual slide stops the auto slideshow ===== */}
        {active > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous ad"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); step(-1); }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/75 text-white rounded-full p-2 shadow transition-all"
            ><HiChevronLeft className="w-6 h-6" /></button>
            <button
              type="button"
              aria-label="Next ad"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); step(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/75 text-white rounded-full p-2 shadow transition-all"
            ><HiChevronRight className="w-6 h-6" /></button>
          </>
        )}

        {/* ===== bottom info bar ===== */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-14 pb-3 px-4 pointer-events-none">
          <p className="text-white font-bold text-base sm:text-lg leading-tight">{businessName}</p>
          {description && (
            <p className="text-white/85 text-xs sm:text-sm mt-0.5 line-clamp-2">{description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 pointer-events-auto">
            <Link href={`/business/${raw.id}${itemParam}`} className="text-xs sm:text-sm font-semibold text-gold-300 hover:text-gold-200">
              View Business →
            </Link>
            {stopped ? (
              <button
                type="button"
                onClick={() => setStopped(false)}
                className="text-[11px] font-semibold text-white/80 hover:text-white bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-full transition-all"
              >▶ Resume slideshow</button>
            ) : (
              active > 1 && <span className="text-[11px] text-white/60">Auto slideshow · swipe or tap arrows to browse</span>
            )}
          </div>
        </div>

        {/* ===== media counter for this ad ===== */}
        {media.length > 1 && (
          <span className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{m + 1}/{media.length}</span>
        )}
      </div>
    </div>
  );
}
