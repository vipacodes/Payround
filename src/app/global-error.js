'use client';

import { useEffect } from 'react';

// Safety net for stale phone caches: after a site update, a device may hold OLD
// page pieces that point at files which no longer exist (ChunkLoadError). Instead
// of the scary default crash screen, reload once silently to grab the fresh
// version — and if that still fails, show a friendly one-tap refresh card.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    const msg = String(error && (error.message || error));
    const stale = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(msg);
    if (stale) {
      try {
        if (!sessionStorage.getItem('pr_chunk_reload')) {
          sessionStorage.setItem('pr_chunk_reload', String(Date.now()));
          window.location.reload();
          return;
        }
      } catch { /* storage blocked — fall through to the manual card */ }
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 20, background: '#16a34a', color: '#fff', fontSize: 32, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>PayRound just freshened up 🔄</h1>
          <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.5, margin: '0 0 20px' }}>
            The site updated a moment ago and your phone still has the old copy. One tap loads the fresh version — your account, groups and chats are safe.
          </p>
          <button
            onClick={() => { try { sessionStorage.removeItem('pr_chunk_reload'); } catch (e) {} window.location.reload(); }}
            style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            ⟳ Load fresh version
          </button>
        </div>
      </body>
    </html>
  );
}
