'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { persistProfileFromAuth } from '@/lib/session';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let done = false;
    const go = async (path) => {
      if (done) return;
      done = true;
      try { await persistProfileFromAuth(); } catch {}
      router.replace(path);
    };

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
        const type = hash.get('type') || url.searchParams.get('type');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hash.get('access_token')) {
          const { error } = await supabase.auth.setSession({
            access_token: hash.get('access_token'),
            refresh_token: hash.get('refresh_token') || '',
          });
          if (error) throw error;
        } else {
          await supabase.auth.getSession();
        }

        if (type === 'recovery' || url.searchParams.get('next') === '/reset-password') {
          await go('/reset-password');
          return;
        }
        const next = url.searchParams.get('next') || '/dashboard';
        await go(next.startsWith('/') ? next : '/dashboard');
      } catch {
        router.replace('/forgot-password?expired=1');
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') go('/reset-password');
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Opening password reset…</p>
    </div>
  );
}
