'use client';

import { useState, useEffect, useRef } from 'react';
import AdVideo from './AdVideo';
import Link from 'next/link';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { parseAdMedia, isVideoSrc } from './AdBanner';

const IMAGE_MS = 5000;  // image ads show max 5 seconds
const VIDEO_MS = 10000; // video ads play max 10 seconds
const KEY = 'payround_slot_'; // per-slot cursor, remembered across visits

// Measure every media item's real shape: portrait goes to the 2 portrait slots, landscape to the landscape slot
function useMediaFeed(ads) {
  const [feed, setFeed] = useState(null); // null = still measuring
  useEffect(() => {
    let alive = true;
    const items = [];
    (ads || []).forEach((ad) => {
      parseAdMedia(ad?.media_urls).forEach((src, idx) => {
        items.push({ ad, idx, src, video: isVideoSrc(src), portrait: false });
      });
    });
    if (!items.length) { setFeed([]); return; }
    Promise.all(items.map((it) => new Promise((res) => {
      if (it.video) {
        const v = document.createElement('video');
        v.muted = true; v.preload = 'metadata';
        v.onloadedmetadata = () => { it.portrait = (v.videoHeight || 0) > (v.videoWidth || 0); res(); };
        v.onerror = () => res();
        it._t = setTimeout(res, 6000);
        v.src = it.src;
      } else {
        const img = new Image();
        img.onload = () => { it.portrait = img.naturalHeight > img.naturalWidth; res(); };
        img.onerror = () => res();
        img.src = it.src;
      }
    }))).then(() => { if (alive) setFeed(items); });
    return () => { alive = false; };
  }, [ads]);
  return feed;
}

// Round-robin across businesses so every advertiser shows before any repeats
function interleave(items) {
  const byAd = new Map();
  items.forEach((it) => {
    const k = it.ad.id;
    if (!byAd.has(k)) byAd.set(k, []);
    byAd.get(k).push(it);
  });
  const queues = [...byAd.values()];
  const out = [];
  let more = true;
  while (more) {
    more = false;
    for (const q of queues) if (q.length) { out.push(q.shift()); more = true; }
  }
  return out;
}

function Placeholder({ ratio }) {
  return (
    <Link href="/ads" className={`relative ${ratio} rounded-2xl border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-center p-4 hover:border-primary-300 transition-colors`}>
      <span className="text-lg">📣</span>
      <span className="text-xs font-semibold text-gray-500 mt-1">Your business could be here</span>
      <span className="text-[10px] text-gray-400 mt-0.5">Tap to advertise</span>
    </Link>
  );
}

function AdSlot({ items, slotKey, startOffset = 0, ratio }) {
  const len = items.length;
  const [pos, setPos] = useState(null);
  const [stopped, setStopped] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const touchX = useRef(null);

  // Resume AFTER the last shown item (per slot) so return visits show fresh ads; offset staggers the two portrait slots
  useEffect(() => {
    if (!len || pos !== null) return;
    let start = startOffset % len;
    try {
      const s = parseInt(localStorage.getItem(KEY + slotKey) || '-1', 10);
      if (Number.isFinite(s) && s >= 0) start = (s + 1 + startOffset) % len;
    } catch {}
    setPos(start);
  }, [len, pos, slotKey, startOffset]);

  useEffect(() => {
    if (pos === null) return;
    try { localStorage.setItem(KEY + slotKey, String(pos)); } catch {}
  }, [pos, slotKey]);

  // Auto slide — images 5s max, videos 10s max
  useEffect(() => {
    if (!len || pos === null || stopped) return;
    const it = itemsRef.current[((pos % len) + len) % len];
    const t = setTimeout(() => setPos((p) => (((p % len) + len) % len + 1) % len), it?.video ? VIDEO_MS : IMAGE_MS);
    return () => clearTimeout(t);
  }, [len, pos, stopped]);

  const step = (d) => {
    setStopped(true);
    setPos((p) => (((p + d) % len) + len) % len);
  };
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
  };

  if (!len) return <Placeholder ratio={ratio} />;
  if (pos === null) return <div className={`${ratio} rounded-2xl bg-gray-100 animate-pulse`} />;

  const cur = itemsRef.current[((pos % len) + len) % len];
  const name = cur.ad.businessName || cur.ad.business_name || 'Business';
  const href = `/business/${cur.ad.id}?item=${cur.idx}`;

  return (
    <div className={`relative ${ratio} rounded-2xl overflow-hidden bg-gray-900 shadow-lg shadow-gray-200 select-none`}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* ===== media — always shown in FULL (never cropped) ===== */}
      <Link href={href} className="absolute inset-0 block" title={`Open ${name}`}>
        {cur.video ? (
          <div key={`${cur.ad.id}-${cur.idx}`} className="ad-slide-media absolute inset-0 flex items-center justify-center bg-black">
            <AdVideo src={cur.src} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div key={`${cur.ad.id}-${cur.idx}`} className="ad-slide-media absolute inset-0">
            <div aria-hidden="true" className="absolute inset-0 scale-125 blur-2xl opacity-60 bg-center bg-cover" style={{ backgroundImage: `url("${cur.src}")` }} />
            <img src={cur.src} alt={name} className="relative w-full h-full object-contain" />
          </div>
        )}
      </Link>

      {/* ===== counter chip ===== */}
      <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
        Ad {((pos % len) + len) % len + 1}/{len}
      </span>

      {/* ===== manual slide — stops this slot's auto play ===== */}
      {len > 1 && (
        <>
          <button type="button" aria-label="Previous ad" onClick={(e) => { e.preventDefault(); e.stopPropagation(); step(-1); }}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 shadow transition-all">
            <HiChevronLeft className="w-4 h-4" /></button>
          <button type="button" aria-label="Next ad" onClick={(e) => { e.preventDefault(); e.stopPropagation(); step(1); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 shadow transition-all">
            <HiChevronRight className="w-4 h-4" /></button>
        </>
      )}

      {/* ===== bottom info bar ===== */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-10 pb-2 px-3 pointer-events-none">
        <p className="text-white font-bold text-xs sm:text-sm leading-tight truncate">{name}</p>
        <div className="mt-0.5 flex items-center gap-2 pointer-events-auto">
          <Link href={href} className="text-[11px] font-semibold text-gold-300 hover:text-gold-200">View Business →</Link>
          {stopped && (
            <button type="button" onClick={() => setStopped(false)}
              className="text-[10px] font-semibold text-white/80 hover:text-white bg-white/15 hover:bg-white/25 px-2 py-0.5 rounded-full transition-all">▶ Resume</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdSlideshow({ ads, className = '' }) {
  const feed = useMediaFeed(ads);

  if (!ads || ads.length === 0) return null;

  // Still measuring media shapes — show matching skeleton boxes so the layout doesn't jump
  if (feed === null) {
    return (
      <div className={`relative ${className}`}>
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <div className="aspect-[3/4] max-h-[32vh] rounded-2xl bg-gray-100 animate-pulse" />
          <div className="aspect-[3/4] max-h-[32vh] rounded-2xl bg-gray-100 animate-pulse" />
        </div>
        <div className="aspect-[16/9] max-h-[30vh] rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  // Auto-select media by shape; if one shape is missing entirely, fill it from whatever exists
  let portrait = interleave(feed.filter((i) => i.portrait));
  let landscape = interleave(feed.filter((i) => !i.portrait));
  if (!portrait.length && landscape.length) portrait = landscape;
  if (!landscape.length && portrait.length) landscape = portrait;

  return (
    <div className={`relative ${className}`}>
      {/* ===== two portrait slots ===== */}
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <AdSlot items={portrait} slotKey="p0" startOffset={0} ratio="aspect-[3/4] max-h-[32vh]" />
        <AdSlot items={portrait} slotKey="p1" startOffset={1} ratio="aspect-[3/4] max-h-[32vh]" />
      </div>
      {/* ===== one landscape slot below ===== */}
      <AdSlot items={landscape} slotKey="land" startOffset={0} ratio="aspect-[16/9] max-h-[30vh]" />
    </div>
  );
}
