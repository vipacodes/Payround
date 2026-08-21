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
  const [noAccount, setNoAccount] = useState(false); // ❌ email not tied to any account → suggest sign up
  const [fallbackCode, setFallbackCode] = useState(''); // ONLY when no email service is connected yet

  const handleSubmit = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) { toast.error('Please enter your email address'); return; }
    setLoading(true);
    setFallbackCode('');
    setNoAccount(false);
    try {
      const res = await fetch('/api/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      const data = await res.json();
      if (res.status === 404) {
        setNoAccount(true);
        toast.error('This email is not assigned to any PayRound account.');
        setLoading(false);
        return;
      }
      if (res.status === 429) { toast.error('A code was just sent moments ago — check your inbox (and spam), or wait 2 minutes.'); setLoading(false); return; }
      if (!data.ok) throw new Error(data.error || 'unknown');
      if (data.sent) {
        setSent(true);
        setSentVia(data.via || 'email');
                toast.success('📧 Reset link emailed to you!');
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
            {sent ? 'Check your email 📧' : 'We’ll email you a link to set a new password'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiMail className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Check your email 📧</h3>
              <p className="text-sm text-gray-500 mb-1">
                We sent a reset link to <strong>{email.trim().toLowerCase()}</strong>
              </p>
              <p className="text-xs text-gray-400 mb-4">Open the email and tap the link. It opens a page to type your <b>new password</b>. Check Spam if you don’t see it.</p>
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
              {noAccount && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <p className="text-sm font-bold text-red-800">❌ Email not assigned to any account</p>
                  <p className="text-xs text-red-700 mt-1"><strong>{email.trim().toLowerCase()}</strong> is not tied to any PayRound account, so no reset link was sent. Check the spelling — or create a free account instead.</p>
                  <Link
                    href={`/signup?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                    className="mt-2.5 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    ✨ Try Sign Up →
                  </Link>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (noAccount) setNoAccount(false); }}
                    placeholder="you@example.com"
                    className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${noAccount ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">The exact email on your account. The reset link goes <b>to your inbox</b> — it is never shown on this page.</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
              >
                {loading ? 'Checking your email…' : '📧 Email Me a Reset Link'}
              </button>
              <a
                href={`https://wa.me/2349151723199?text=${encodeURIComponent(`Hello PayRound, I can't access the inbox of my account email${email.trim() ? ` (${email.trim().toLowerCase()})` : ''}. Please help me reset my password. My WhatsApp number is this one I'm chatting with.`)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-semibold py-3 rounded-xl hover:bg-emerald-100 transition-colors"
              >
                💬 Can&apos;t open that inbox? Get help on WhatsApp
              </a>
              <p className="text-[10px] text-gray-400 text-center">The WhatsApp option connects you to PayRound support, who verify it&apos;s really you before helping with the reset — the link itself can only be emailed to the account&apos;s address.</p>
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
