'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const MIN_SHOW = 380;   // ms — never just a flash
const MAX_SHOW = 9000;  // ms — NEVER trap the user, whatever happens

// 🔄 The PayRound GREEN SPINNING ARC — shows full-screen while switching pages.
// Pure SVG (no white background, razor-sharp at every size, zero download).
// Catches every client-side navigation: <Link> taps, router.push buttons, Back/Forward.
export default function PageTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const shownAt = useRef(0);

  const start = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    shownAt.current = Date.now();
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
  }, [busy]);

  if (!busy) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 cursor-wait"
      role="status"
      aria-label="Loading page"
      style={{ background: 'rgba(8,15,28,0.85)' }}
    >
      {/* ⭕ The green spinning arc — transparent background, nothing else */}
      <svg width="84" height="84" viewBox="0 0 72 72" aria-hidden="true" className="pr-loader-spin">
        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(34,197,94,0.15)" strokeWidth="7" />
        <circle
          cx="36" cy="36" r="30" fill="none"
          stroke="#22c55e" strokeWidth="7" strokeLinecap="round"
          pathLength="100" strokeDasharray="72 28"
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className="text-green-500 text-xs font-bold tracking-[0.3em] select-none">LOADING</span>
    </div>
  );
}
