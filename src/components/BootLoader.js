'use client';

import { useEffect } from 'react';

// Rendered by the SERVER into the page HTML, so it is visible immediately
// when the installed app launches (right after the phone's own splash icon),
// while the app bundles download. Removed as soon as the app is ready.
export default function BootLoader() {
  useEffect(() => {
    // App hydrated fine — clear the one-shot stale-chunk reload guard (see global-error.js)
    try { sessionStorage.removeItem('pr_chunk_reload'); } catch (e) {}
    const el = document.getElementById('boot-loader');
    if (el) {
      // App has hydrated — fade the boot animation out
      const t1 = setTimeout(() => { el.style.opacity = '0'; }, 250);
      const t2 = setTimeout(() => { el.remove(); }, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, []);

  return (
    <div id="boot-loader" aria-hidden="true">
      <div className="boot-logo">P</div>
      <div className="boot-dots"><span /><span /><span /></div>
      <p className="boot-text">PayRound</p>
    </div>
  );
}
