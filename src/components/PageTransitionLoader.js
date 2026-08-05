'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const MIN_SHOW = 380;   // ms — never just a flash
const MAX_SHOW = 9000;  // ms — NEVER trap the user, whatever happens

// 🔄 Branded full-screen loader shown while SWITCHING pages.
// Catches every client-side navigation: <Link> taps, router.push buttons (the App Router
// uses history.pushState/replaceState), browser Back/Forward, and plain internal <a> taps.
export default function PageTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(0); // remount key → the animation restarts on every trip
  const busyRef = useRef(false);
  const shownAt = useRef(0);

  const start = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    shownAt.current = Date.now();
    setPulse((p) => p + 1);
    setBusy(true);
  };

  const stop = () => {
    if (!busyRef.current) return;
    const wait = Math.max(0, MIN_SHOW - (Date.now() - shownAt.current));
    setTimeout(() => { busyRef.current = false; setBusy(false); }, wait);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    // Same-URL guard: don't show the loader when nothing will actually change
    const willNavigate = (url) => {
      try {
        if (typeof url !== 'string' && !(url instanceof URL)) return true;
        const dest = new URL(url.toString(), window.location.origin);
        return dest.pathname + dest.search !== window.location.pathname + window.location.search;
      } catch { return true; }
    };

    const wrap = (orig) => function wrapped(...args) {
      try {
        const url = args[2];
        if (url && willNavigate(url)) start();
      } catch {}
      return orig.apply(this, args);
    };

    const ps = window.history.pushState;
    const rs = window.history.replaceState;
    window.history.pushState = wrap(ps);
    window.history.replaceState = wrap(rs);

    // Browser Back/Forward buttons
    const onPop = () => start();
    window.addEventListener('popstate', onPop);

    // Plain internal <a> taps (full-page reloads) — show until the page unloads
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || a.target === '_blank' || a.hasAttribute('download')) return;
      if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) return; // external link
      if (!willNavigate(href)) return; // link to this very page
      start();
    };
    document.addEventListener('click', onClick, true);

    return () => {
      window.history.pushState = ps;
      window.history.replaceState = rs;
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the URL actually lands (path or query changed), hide — after the minimum show time
  const spKey = searchParams ? searchParams.toString() : '';
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // never flash on the very first load
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, spKey]);

  // 🛟 Absolute safety: the overlay can never get stuck on screen
  useEffect(() => {
    if (!busy) return undefined;
    const t = setTimeout(() => { busyRef.current = false; setBusy(false); }, MAX_SHOW);
    return () => clearTimeout(t);
  }, [busy, pulse]);

  if (!busy) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center cursor-wait transition-opacity"
      role="status"
      aria-label="Loading page"
      style={{ background: 'rgba(8,15,28,0.92)' }}
    >
      {/* key = pulse → the GIF restarts on every page switch */}
      <img
        key={pulse}
        src="/loading.gif"
        alt="PayRound loading…"
        draggable={false}
        className="w-56 h-auto rounded-2xl shadow-2xl select-none animate-pulse-slow"
        style={{ background: '#ffffff' }}
      />
    </div>
  );
}
