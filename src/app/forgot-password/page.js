'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HiMail, HiCheckCircle, HiClock, HiClipboardCopy } from 'react-icons/hi';
import toast from 'react-hot-toast';

const TEMP_MINUTES = 20;

// Readable temporary password — no confusing chars (0/O, 1/I/L)
function genTempPassword() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return `PR-${out}`;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [tempPwd, setTempPwd] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const secsLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) { toast.error('Please enter your email address'); return; }
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: user, error } = await supabase.from('users').select('id, email, name').eq('email', em).maybeSingle();
      if (error) throw error;
      if (!user) {
        toast.error('No PayRound account uses this email. Check the spelling — or sign up instead.');
        setLoading(false);
        return;
      }
      const code = genTempPassword();
      const exp = new Date(Date.now() + TEMP_MINUTES * 60000);
      const { error: upErr } = await supabase.from('users').update({ reset_code: code, reset_expires: exp.toISOString() }).eq('email', em);
      if (upErr) throw upErr;
      setTempPwd(code);
      setExpiresAt(exp.getTime());
      setUserName(user.name || '');
      toast.success('Temporary password generated! 🔑');
    } catch (err) {
      toast.error(`Could not reset: ${err.message || 'network issue — try again'}`);
    }
    setLoading(false);
  };

  const copyCode = () => {
    try { navigator.clipboard.writeText(tempPwd); toast.success('Copied! 📋'); } catch { toast.error('Long-press the password to copy it'); }
  };

  const emailBackup = () => {
    const subject = encodeURIComponent('Your PayRound temporary password');
    const body = encodeURIComponent(`Hello${userName ? ' ' + userName : ''},\n\nYour PayRound temporary password is: ${tempPwd}\n\nIt works for ${TEMP_MINUTES} minutes only. Log in at https://payround-omega.vercel.app/login — you will be asked to set your own new password immediately.\n\n— PayRound`);
    window.location.href = `mailto:${encodeURIComponent(email.trim().toLowerCase())}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-md mx-auto px-4 py-12 md:py-20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary-200">
            <span className="text-white font-bold text-2xl">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-500 mt-1">{tempPwd ? 'Your temporary password is ready' : `Get a temporary password — works for ${TEMP_MINUTES} minutes`}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
          {!tempPwd ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Enter the exact email on your account. We&apos;ll generate a temporary password for it right here.</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
              >
                {loading ? 'Checking your account…' : '🔑 Generate Temporary Password'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiCheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Temporary Password Ready{userName ? `, ${userName.split(' ')[0]}` : ''}! 🔑</h3>
              <p className="text-xs text-gray-500 mb-4">Use it to log in — you&apos;ll be asked to set your own new password right away.</p>

              <button onClick={copyCode} className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-mono text-2xl font-bold tracking-widest py-4 rounded-2xl mb-2 hover:bg-gray-800 active:scale-[0.99] transition-all" title="Tap to copy">
                {tempPwd} <HiClipboardCopy className="w-5 h-5 text-gray-400" />
              </button>

              {secsLeft > 0 ? (
                <p className="text-xs font-semibold text-amber-600 flex items-center justify-center gap-1 mb-4">
                  <HiClock className="w-4 h-4" /> Expires in {mm}:{ss} — {TEMP_MINUTES}-minute limit, one use
                </p>
              ) : (
                <p className="text-xs font-semibold text-red-500 mb-4">⏰ This password just expired — tap below to generate a fresh one.</p>
              )}

              <button
                onClick={() => router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`)}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 mb-3"
              >
                Go to Login →
              </button>

              <div className="flex items-center justify-center gap-4 text-xs">
                <button onClick={emailBackup} className="text-primary-600 font-semibold hover:text-primary-700">📧 Email it to me (backup)</button>
                {secsLeft > 0 ? (
                  <button onClick={() => { setTempPwd(''); setExpiresAt(null); }} className="text-gray-500 hover:text-gray-700">Use a different email</button>
                ) : (
                  <button onClick={handleSubmit} disabled={loading} className="text-primary-600 font-semibold hover:text-primary-700">🔁 Generate a new one</button>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-4">💡 &quot;Email it to me&quot; opens your mail app with the password typed out — send it to yourself as a backup.</p>
            </div>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            Remember your password?{' '}
            <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">
              Log in
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
