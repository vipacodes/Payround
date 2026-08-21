'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAndroidApp } from '@/lib/androidApp';

const LAST_SHOWN_KEY = 'payround_apk_prompt_last';   // when the monthly prompt last showed
const SIGNUP_FLAG_KEY = 'payround_apk_prompt_signup'; // set by signup — show once right away
const MONTH_MS = 30 * 86400000;

// 📱 Payround app invitation for Android users WITHOUT the app installed:
//   1. Right after SIGN UP — every new user sees it once, with a clear
//      choice: download the app, or continue using the web (optional).
//   2. Once every 30 days for REGISTERED (logged-in) users who still have
//      not installed the app. Choosing either option resets the month.
// It never shows inside the installed app, when the APK is detected on the
// phone, on iPhone/desktop, or to logged-out visitors.
export default function AndroidAppPrompt() {
  const { isAndroid, isInApp, installed, ready } = useAndroidApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [fromSignup, setFromSignup] = useState(false);

  useEffect(() => {
    if (!ready || !isAndroid || isInApp || installed) return;

    let signupFlag = false;
    try { signupFlag = localStorage.getItem(SIGNUP_FLAG_KEY) === '1'; } catch {}

    // Monthly prompts are only for registered users (logged in on this device).
    let loggedIn = false;
    try { loggedIn = !!localStorage.getItem('payround_user'); } catch {}

    if (!signupFlag && !loggedIn) return;

    if (!signupFlag) {
      let last = 0;
      try { last = parseInt(localStorage.getItem(LAST_SHOWN_KEY) || '0', 10) || 0; } catch {}
      if (Date.now() - last < MONTH_MS) return; // shown less than a month ago
    }

    setFromSignup(signupFlag);
    const t = setTimeout(() => {
      setOpen(true);
      try {
        localStorage.removeItem(SIGNUP_FLAG_KEY);
        localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
      } catch {}
    }, signupFlag ? 800 : 2500);
    return () => clearTimeout(t);
  }, [ready, isAndroid, isInApp, installed, pathname]);

  const close = () => setOpen(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl animate-slide-up">
        <button onClick={close} aria-label="Close" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 font-bold">✕</button>
        <div className="flex items-center gap-3 mb-3">
          <img src="/images/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow" />
          <div>
            <p className="font-extrabold text-gray-900 text-lg leading-tight">{fromSignup ? 'Welcome! Get the Payround app 🎉' : 'Get the Payround app'}</p>
            <p className="text-xs text-gray-500">Free · 2 MB · Android · optional</p>
          </div>
        </div>
        <ul className="text-sm text-gray-600 space-y-1.5 mb-5">
          <li>⚡ Opens full-screen — no browser bars</li>
          <li>🏠 Payround icon on your home screen</li>
          <li>🔔 Never miss payments, payouts or messages</li>
        </ul>
        <a
          href="/payround.apk"
          download="payround.apk"
          onClick={close}
          className="block w-full text-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary-200"
        >📱 Download the app (APK)</a>
        <button onClick={close} className="block w-full text-center text-sm font-semibold text-gray-600 mt-3 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50">🌐 Continue using on the web</button>
        <p className="text-[10px] text-gray-400 mt-3 text-center">Totally optional — the website works fully either way. Android may ask you to allow installs from your browser; that's normal for apps outside the Play Store.</p>
      </div>
    </div>
  );
}
