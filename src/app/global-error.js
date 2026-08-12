'use client';

import { useEffect } from 'react';

async function hardRefresh() {
  try { sessionStorage.clear(); } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  window.location.replace(`https://payround-omega.vercel.app/login?fresh=${Date.now()}`);
}

export default function GlobalError({ error }) {
  useEffect(() => {
    const msg = String(error && (error.message || error));
    const stale = /ChunkLoadError|Loading chunk [0-9]+ failed|dynamically imported module/i.test(msg);
    if (!stale) return;
    try {
      if (!sessionStorage.getItem('pr_chunk_reload')) {
        sessionStorage.setItem('pr_chunk_reload', '1');
        hardRefresh();
      }
    } catch {}
  }, [error]);

  const detail = String((error && error.message) || '');

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 20, background: '#16a34a', color: '#fff', fontSize: 32, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Load the new Payround</h1>
          <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.5, margin: '0 0 20px' }}>
            Your phone saved an old copy of the site. Tap the green button. If nothing changes, close this window and open payround-omega.vercel.app in Chrome (not the home-screen icon).
          </p>
          <button
            onClick={() => { hardRefresh(); }}
            style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' }}
          >
            Open latest login page
          </button>
          {detail ? (
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 16, wordBreak: 'break-word' }}>{detail}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
