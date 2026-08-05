'use client';

import { useEffect, useRef, useState } from 'react';

// 🎬 Video ad with viewer controls:
//  • 🔇 EVERY ad starts MUTED — sound only comes on when the viewer TAPS it
//    (play/pause tap or the 🔊 button), unless they muted ads on purpose (🔇 is remembered)
//  • ⏸/▶ pause & play — the viewer is the boss (taps never reach the ad's link)
//  • 🔊/🔇 sound toggle — remembered for every ad video (localStorage 'payround_ad_sound')
//  • onEnded — parents advance their slideshow only when the clip has COMPLETELY finished
//  • loop — off when a parent drives rotation, so the clip ends exactly once
export default function AdVideo({ src, className, btnClass = 'bottom-2 left-12', loop = true, onEnded, onPlayEv, onPauseEv, showPlayPause = true }) {
  const ref = useRef(null);
  const [sound, setSound] = useState(false);
  const [playing, setPlaying] = useState(true);

  // Every clip starts silent — always. Sound is a tap away.
  useEffect(() => {
    setSound(false);
    setPlaying(true);
  }, [src]);

  // Apply (un)mute live; if a browser blocks unmuted playback, fall back to muted
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !sound;
    if (sound) {
      try { v.volume = 1; } catch {}
      const p = v.play();
      if (p && p.catch) p.catch(() => {
        v.muted = true;
        setSound(false);
        const p2 = v.play(); if (p2 && p2.catch) p2.catch(() => {});
      });
    }
  }, [sound, src]);

  // 👆 First tap on the clip = play WITH sound… unless the viewer muted ads on purpose
  const unmuteKick = () => {
    let off = false;
    try { off = localStorage.getItem('payround_ad_sound') === 'off'; } catch {}
    if (!off) setSound(true);
  };

  const togglePlay = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.ended) { unmuteKick(); const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    else v.pause();
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        muted
        autoPlay
        loop={loop}
        playsInline
        className={className}
        onPlay={() => { setPlaying(true); if (onPlayEv) onPlayEv(); }}
        onPause={() => { setPlaying(false); if (onPauseEv) onPauseEv(); }}
        onEnded={(e) => { setPlaying(false); if (onEnded) onEnded(e); }}
      />
      {showPlayPause && playing && (
        <button
          type="button"
          aria-label="Pause video"
          title="Pause ⏸"
          onClick={togglePlay}
          className="absolute bottom-2 left-2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white text-sm flex items-center justify-center border border-white/25"
        >⏸</button>
      )}
      {showPlayPause && !playing && (
        <>
          {/* Big centre ▶ — unmissable */}
          <button
            type="button"
            aria-label="Play video"
            title="Play ▶"
            onClick={togglePlay}
            className="absolute inset-0 z-20 flex items-center justify-center"
          >
            <span className="w-16 h-16 rounded-full bg-black/70 border-2 border-white/70 text-white text-2xl flex items-center justify-center pl-1 shadow-xl">▶</span>
          </button>
          <button
            type="button"
            aria-label="Play video"
            title="Play ▶"
            onClick={togglePlay}
            className="absolute bottom-2 left-2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/85 text-white text-sm flex items-center justify-center border border-white/25"
          >▶</button>
        </>
      )}
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
