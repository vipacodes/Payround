'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_MS = 25000;

// Presence never accepts a client-supplied identity. The RPC resolves the profile
// from the authenticated JWT and the table itself is private from ordinary users.
export default function UserPresenceHeartbeat() {
  useEffect(() => {
    let alive = true;
    let signedIn = false;
    let timer = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const touch = async () => {
      if (!alive || !signedIn || document.visibilityState !== 'visible' || !navigator.onLine) return;
      try { await supabase.rpc('touch_user_presence'); } catch {}
    };

    const start = () => {
      stop();
      if (!signedIn) return;
      touch();
      timer = setInterval(touch, HEARTBEAT_MS);
    };

    const applySession = (session) => {
      signedIn = !!session;
      if (signedIn) start();
      else stop();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && signedIn) start();
    };
    const onOnline = () => {
      if (signedIn) start();
    };

    supabase.auth.getSession()
      .then(({ data }) => { if (alive) applySession(data?.session || null); })
      .catch(() => { if (alive) applySession(null); });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) applySession(session);
    });

    return () => {
      alive = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return null;
}
