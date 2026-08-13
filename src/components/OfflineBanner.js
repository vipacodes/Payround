'use client';

import { useEffect, useState } from 'react';
import { pendingCount, flushOutbox, startOutboxWatcher } from '@/lib/offlineQueue';

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [sending, setSending] = useState(false);

  const refresh = async () => {
    try { setWaiting(await pendingCount()); } catch { setWaiting(0); }
  };

  useEffect(() => {
    startOutboxWatcher();
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    refresh();
    const on = () => { setOnline(true); refresh(); };
    const off = () => { setOnline(false); refresh(); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('payround-outbox', refresh);
    const t = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('payround-outbox', refresh);
      clearInterval(t);
    };
  }, []);

  if (online && waiting === 0) return null;

  return (
    <div className={`sticky top-16 z-40 px-3 py-2 text-center text-xs font-semibold ${online ? 'bg-amber-100 text-amber-900' : 'bg-gray-800 text-white'}`}>
      {!online && (
        <span>📴 You are offline. Messages, photos and receipts you send now are saved on this phone and will go out when you are back online.</span>
      )}
      {online && waiting > 0 && (
        <span className="inline-flex items-center gap-2">
          📤 {waiting} item{waiting === 1 ? '' : 's'} waiting to send…
          <button
            type="button"
            disabled={sending}
            onClick={async () => { setSending(true); await flushOutbox(); await refresh(); setSending(false); }}
            className="underline"
          >{sending ? 'Sending…' : 'Send now'}</button>
        </span>
      )}
    </div>
  );
}
