'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { supabase } from '@/lib/supabase';
import { persistProfileFromAuth } from '@/lib/session';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) {
        toast.error('That reset link is missing or expired. Request a new one.');
        router.replace('/forgot-password');
        return;
      }
      await persistProfileFromAuth();
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router]);

  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { toast.error('Use at least 6 characters.'); return; }
    if (pw !== pw2) { toast.error('The two passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      toast.error(error.message || 'Could not save password');
      setBusy(false);
      return;
    }
    await persistProfileFromAuth();
    toast.success('New password saved. You are signed in.');
    router.replace('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-md mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Set a new password</h1>
        <p className="text-sm text-gray-500 text-center mt-1 mb-6">Choose a password you will remember. You will be signed in after this.</p>
        {!ready ? (
          <p className="text-center text-sm text-gray-400">Checking your reset link…</p>
        ) : (
          <form onSubmit={save} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Repeat new password</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <button type="submit" disabled={busy} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50">
              {busy ? 'Saving…' : 'Save password and continue'}
            </button>
          </form>
        )}
      </div>
      <Footer />
    </div>
  );
}
