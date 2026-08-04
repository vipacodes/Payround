'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';

// 💬 Floating "Chat with PayRound Support" bubble — bottom-right corner,
// the usual spot it appears on regular sites. Tapping it jumps straight
// into the pinned PayRound Support conversation. A little green dot shows
// when support has replied and you haven't read it yet.

const SUPPORT_THREAD = 'payround-support';

export default function SupportChatFab() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [unread, setUnread] = useState(false);
  const [ready, setReady] = useState(false); // avoid hydration flash

  // Who is logged in? (re-read on mount + when another tab/page changes it)
  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const parsed = stored ? JSON.parse(stored) : null;
        setEmail((parsed?.email || '').toLowerCase());
      } catch { setEmail(''); }
    };
    read();
    setReady(true);
    window.addEventListener('storage', read);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('focus', read);
    };
  }, []);

  // Poll for an unread support reply (lightweight: one column, one row)
  useEffect(() => {
    if (!email) { setUnread(false); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('support_threads')
          .select('user_read')
          .eq('user_email', email)
          .maybeSingle();
        if (!cancelled) setUnread(!!data && data.user_read === false);
      } catch { /* stay quiet — dot just won't show */ }
    };
    check();
    const t = setInterval(check, 8000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [email, pathname]); // re-check after navigation too (cheap query)

  // Already inside the Messages area — the bubble would be redundant there
  const hidden = !ready || pathname?.startsWith('/messages');

  const open = () => {
    if (!email) {
      toast('Log in first to chat with PayRound Support 💬', { icon: '💬' });
      router.push('/login');
      return;
    }
    setUnread(false); // dot clears as soon as you head over to read it
    router.push(`/messages?to=${SUPPORT_THREAD}`);
  };

  if (hidden) return null;

  return (
    <button
      onClick={open}
      aria-label="Chat with PayRound Support"
      title="Chat with PayRound Support"
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[75] w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-600/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    >
      {/* chat bubble icon */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
        <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
        <circle cx="8.5" cy="9.7" r="1.05" fill="#dcfce7" />
        <circle cx="12" cy="9.7" r="1.05" fill="#dcfce7" />
        <circle cx="15.5" cy="9.7" r="1.05" fill="#dcfce7" />
      </svg>
      {/* green dot = support replied, unread */}
      {unread && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-400 ring-2 ring-white animate-pulse" aria-hidden="true" />
      )}
    </button>
  );
}
