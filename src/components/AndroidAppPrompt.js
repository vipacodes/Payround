'use client';

import { useState, useEffect } from 'react';
import { useAndroidApp } from '@/lib/androidApp';

const SNOOZE_KEY = 'payround_apk_prompt_snooze';
const SNOOZE_DAYS = 7;

// 📱 Bottom-sheet popup shown to Android visitors in the BROWSER, inviting
// them to install the Payround app. Never shows inside the installed app,
// when the APK is already on the phone, or during the 7-day snooze after
// "Not now".
export default function AndroidAppPrompt() {
  const { isAndroid, isInApp, installed, ready } = useAndroidApp();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !isAndroid || isInApp || installed) return;
    let snoozedUntil = 0;
    try { snoozedUntil = parseInt(localStorage.getItem(SNOOZE_KEY) || '0', 10) || 0; } catch {}
    if (Date.now() < snoozedUntil) return;
    const t = setTimeout(() => setOpen(true), 2500); // let the page settle first
    return () => clearTimeout(t);
  }, [ready, isAndroid, isInApp, installed]);

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)); } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={snooze} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl animate-slide-up">
        <button onClick={snooze} aria-label="Close" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 font-bold">✕</button>
        <div className="flex items-center gap-3 mb-3">
          <img src="/images/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow" />
          <div>
            <p className="font-extrabold text-gray-900 text-lg leading-tight">Get the Payround app</p>
            <p className="text-xs text-gray-500">Free · 2 MB · Android</p>
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
          onClick={snooze}
          className="block w-full text-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary-200"
        >📱 Download the app (APK)</a>
        <button onClick={snooze} className="block w-full text-center text-xs font-semibold text-gray-400 mt-3 py-1">Not now</button>
        <p className="text-[10px] text-gray-400 mt-3 text-center">Android may ask you to allow installs from your browser — that's normal for apps downloaded outside the Play Store.</p>
      </div>
    </div>
  );
}
