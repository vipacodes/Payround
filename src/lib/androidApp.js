'use client';

import { useState, useEffect } from 'react';

// 📱 One shared truth about the Payround Android app for popup + footer:
//   isAndroid – Android phone browser
//   isInApp   – ALREADY inside the installed app (TWA/PWA standalone) → never advertise
//   installed – the APK is installed on this phone (getInstalledRelatedApps)
export function useAndroidApp() {
  const [state, setState] = useState({ isAndroid: false, isInApp: false, installed: false, ready: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ua = navigator.userAgent || '';
        const isAndroid = /android/i.test(ua);
        // Inside the TWA the referrer is android-app://… and display-mode is standalone.
        const isInApp =
          window.matchMedia?.('(display-mode: standalone)')?.matches ||
          window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
          document.referrer.startsWith('android-app://') ||
          window.navigator.standalone === true;
        let installed = false;
        // Chrome on Android reports our APK when manifest.related_applications
        // + assetlinks.json match the installed package.
        if (isAndroid && !isInApp && 'getInstalledRelatedApps' in navigator) {
          try {
            const apps = await navigator.getInstalledRelatedApps();
            installed = (apps || []).some(a => (a.id || '').includes('app.vercel.payround.twa'));
          } catch {}
        }
        if (alive) setState({ isAndroid, isInApp, installed, ready: true });
      } catch {
        if (alive) setState(s => ({ ...s, ready: true }));
      }
    })();
    return () => { alive = false; };
  }, []);

  return state;
}
