'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { persistProfileFromAuth } from '@/lib/session';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
        await persistProfileFromAuth();
        const next = url.searchParams.get('next') || '/settings';
        router.replace(next.startsWith('/') ? next : '/settings');
      } catch {
        router.replace('/login');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Signing you in…</p>
    </div>
  );
}
