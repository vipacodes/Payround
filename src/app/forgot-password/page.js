'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HiMail, HiCheckCircle, HiClipboardCopy } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentVia, setSentVia] = useState('');
  const [fallbackCode, setFallbackCode] = useState(''); // ONLY when no email service is connected yet

  const handleSubmit = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) { toast.error('Please enter your email address'); return; }
    setLoading(true);
    setFallbackCode('');
    try {
      const res = await fetch('/api/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      const data = await res.json();
      if (res.status === 404) { toast.error('No PayRound account uses this email. Check the spelling — or sign up instead.'); setLoading(false); return; }
      if (res.status === 429) { toast.error('A code was just sent moments ago — check your inbox (and spam), or wait 2 minutes.'); setLoading(false); return; }
      if (!data.ok) throw new Error(data.error || 'unknown');
      if (data.sent) {
        setSent(true);
        setSentVia(data.via || 'email');
        toast.success('📧 Temporary password emailed to you!');
      } else if (data.dev_fallback) {
        // Email service isn't wired yet — show the code on screen as a bridge (never shown once email is live)
        setFallbackCode(data.code);
        toast('Email service not connected yet — your code is shown on screen instead.', { icon: '⚠️' });
      }
    } catch (err) {
      toast.error(`Could not reset: ${err.message || 'network issue — try again'}`);
    }
    setLoading(false);
  };

  const copyCode = () => {
    try { navigator.clipboard.writeText(fallbackCode); toast.success('Copied! 📋'); } catch { toast.error('Long-press the code to copy it'); }
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
          <p className="text-gray-500 mt-1">
            {sent ? 'Check your email 📧' : `We'll email you a temporary password (works 20 minutes)`}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiMail className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Temporary password sent! 🔑</h3>
              <p className="text-sm text-gray-500 mb-1">
                We emailed a temporary password to <strong>{email.trim().toLowerCase()}</strong>
              </p>
              <p className="text-xs text-gray-400 mb-4">It works for <b>20 minutes</b>, one time. Log in with it and you'll set your own new password immediately. <b>Check your Spam/Junk folder</b> if you don't see it.</p>
              <Link
                href={`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                className="block w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 mb-3"
              >
                Go to Login →
              </Link>
              <button onClick={() => { setSent(false); setSentVia(''); }} className="text-sm text-primary-600 font-medium hover:text-primary-700">
                Send again
              </button>
              <p className="text-[10px] text-gray-300 mt-4">via {sentVia === 'gmail' ? 'Gmail' : 'Resend'}</p>
            </div>
          ) : fallbackCode ? (
            /* ⚠️ BRIDGE ONLY — appears solely while no email provider is connected (code is never on-screen once email is live) */
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiCheckCircle className="w-10 h-10 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Temporary password 🔑</h3>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">⚠️ Email delivery isn't connected yet, so your one-time password is shown here instead.</p>
              <button onClick={copyCode} className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-mono text-2xl font-bold tracking-widest py-4 rounded-2xl mb-4 hover:bg-gray-800 active:scale-[0.99] transition-all" title="Tap to copy">
                {fallbackCode} <HiClipboardCopy className="w-5 h-5 text-gray-400" />
              </button>
              <p className="text-xs text-gray-400 mb-4">Valid for <b>20 minutes</b>, one use — log in and set your new password right away.</p>
              <Link href={`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`} className="block w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200">
                Go to Login →
              </Link>
            </div>
          ) : (
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
                <p className="text-[11px] text-gray-400 mt-1.5">The exact email on your account. The temporary password goes <b>to your inbox</b> — it is never shown on this page.</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
              >
                {loading ? 'Sending to your email…' : '📧 Email Me a Temporary Password'}
              </button>
            </form>
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
