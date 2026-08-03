'use client';

import { useEffect, useRef, useState } from 'react';

// 🎬 Video ad with a real 🔊/🔇 button. Browsers only allow autoplay when muted,
// so every ad starts silent — tapping 🔊 unmutes it and that choice is remembered
// for every video ad on the site (localStorage 'payround_ad_sound').
// Place inside a `relative` container; the button floats over the video.
export default function AdVideo({ src, className, btnClass = 'bottom-2 left-2' }) {
  const ref = useRef(null);
  const [sound, setSound] = useState(false);

  // Restore the viewer's sound choice whenever the clip changes
  useEffect(() => {
    let on = false;
    try { on = localStorage.getItem('payround_ad_sound') === 'on'; } catch {}
    setSound(on);
  }, [src]);

  // Apply (un)mute live; if a browser blocks unmuted playback, fall back to muted
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !sound;
    if (sound) {
      try { v.volume = 1; } catch {}
      if (v.paused) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {
          v.muted = true;
          setSound(false);
          try { localStorage.setItem('payround_ad_sound', 'off'); } catch {}
          const p2 = v.play(); if (p2 && p2.catch) p2.catch(() => {});
        });
      }
    }
  }, [sound, src]);

  return (
    <>
      <video ref={ref} src={src} muted autoPlay loop playsInline className={className} />
      <button
        type="button"
        aria-label={sound ? 'Mute ad sound' : 'Unmute ad sound'}
        title={sound ? 'Mute sound' : 'Tap for sound 🔊'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const n = !sound;
          setSound(n);
          try { localStorage.setItem('payround_ad_sound', n ? 'on' : 'off'); } catch {}
        }}
        className={`absolute ${btnClass} z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white text-sm flex items-center justify-center border border-white/25`}
      >
        {sound ? '🔊' : '🔇'}
      </button>
    </>
  );
}
