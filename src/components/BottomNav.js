'use client';

// 📱 App-style bottom tab bar — dark, high-contrast, TikTok-style.
//   • Solid dark background so the icons stand out clearly
//   • 6 tabs: Home · Groups · ＋ (smaller) · Alerts (🔔) · Chats · Profile
//   • Icons BOUNCE + pop sound on tap; the ACTIVE tab stays bright green
//   • Chat screens (/messages, /group-chat) go full-screen — bar steps aside
// Pure navigation layer: no existing Payround function is changed.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { HiHome, HiUserGroup, HiPlus, HiBell, HiChatAlt2, HiUser } from 'react-icons/hi';
import { sounds } from '@/lib/sounds';

// Which tab lights up for the current page?
function tabActive(p, id) {
  p = p || '/';
  switch (id) {
    case 'home':     return p === '/' || p.startsWith('/dashboard');
    case 'groups':   return (p.startsWith('/groups') && !p.startsWith('/groups/create')) || p.startsWith('/group-chat');
    case 'create':   return p.startsWith('/groups/create');
    case 'alerts':   return p.startsWith('/notifications');
    case 'chats':    return p.startsWith('/messages');
    case 'profile':  return p.startsWith('/profile');
    default:         return false;
  }
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pressed, setPressed] = useState(null);
  const [homeHref, setHomeHref] = useState('/');
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Home → dashboard when logged in, landing page for visitors
  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const parsed = stored ? JSON.parse(stored) : null;
        setHomeHref(parsed?.email ? '/dashboard' : '/');
      } catch { setHomeHref('/'); }
    };
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  // 🔴 Badge on the Chats tab — unread direct messages (same check the header uses)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const email = stored ? (JSON.parse(stored).email || '').toLowerCase() : '';
        if (!email) { if (!cancelled) setUnreadChats(0); return; }
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.from('messages').select('id').eq('to_email', email).eq('read', false).limit(50);
        if (!cancelled) setUnreadChats((data || []).length);
      } catch { if (!cancelled) setUnreadChats(0); }
    };
    check();
    const t = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, [pathname]);

  // 🔴 Badge on the Alerts tab — my unread notifications (personal + my groups +
  // broadcasts), honouring the same "cleared" list as the notifications page.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const email = stored ? (JSON.parse(stored).email || '').toLowerCase() : '';
        const { supabase } = await import('@/lib/supabase');
        const { getClearedNotifIds, getMyGroupIds } = await import('@/lib/notifications');
        const gids = email ? await getMyGroupIds(supabase, email) : [];
        const { data } = await supabase.from('notifications').select('id, user_email, group_id, is_read').eq('is_read', false).limit(100);
        const cleared = new Set((getClearedNotifIds() || []).map(String));
        const n = (data || []).filter(x => {
          if (cleared.has(String(x.id))) return false;
          const em = (x.user_email || '').toLowerCase();
          if (em) return !!email && em === email;
          if (x.group_id) return gids.includes(x.group_id);
          return true; // broadcast
        }).length;
        if (!cancelled) setUnreadAlerts(n);
      } catch { if (!cancelled) setUnreadAlerts(0); }
    };
    check();
    const t = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, [pathname]);

  // 💬 Chat screens run full-screen — no tab bar there (the composer needs the space)
  const chatScreen = pathname === '/messages' || pathname === '/group-chat';

  // 📐 Keep the bottom of every page above the bar — phones only, never on chat screens
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => {
      document.body.style.paddingBottom = (mq.matches && !chatScreen)
        ? 'calc(64px + env(safe-area-inset-bottom, 0px))'
        : '';
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => {
      mq.removeEventListener?.('change', apply);
      document.body.style.paddingBottom = '';
    };
  }, [chatScreen]);

  if (chatScreen) return null;

  const tabs = [
    { id: 'home',    label: 'Home',    Icon: HiHome,      href: homeHref },
    { id: 'groups',  label: 'Groups',  Icon: HiUserGroup, href: '/groups/search' },
    { id: 'create',  label: 'Create',  Icon: HiPlus,      href: '/groups/create', main: true },
    { id: 'alerts',  label: 'Alerts',  Icon: HiBell,      href: '/notifications', badge: unreadAlerts },
    { id: 'chats',   label: 'Chats',   Icon: HiChatAlt2,  href: '/messages', badge: unreadChats },
    { id: 'profile', label: 'Profile', Icon: HiUser,      href: '/profile' },
  ];

  // Tap = bounce + soft pop sound + navigate (tapping the tab you're on just bounces)
  const go = (tab) => {
    setPressed(tab.id);
    setTimeout(() => setPressed((p) => (p === tab.id ? null : p)), 340);
    try { sounds.pop(); } catch {}
    if (!tabActive(pathname, tab.id)) router.push(tab.href);
  };

  return (
    <nav
      aria-label="Main navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-[70] bg-gray-900 border-t border-black/60 shadow-[0_-6px_24px_rgba(0,0,0,0.5)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-6 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = tabActive(pathname, tab.id);
          const { Icon } = tab;

          // ⭐ Compact green CREATE button (smaller, sits proud of the bar)
          if (tab.main) {
            return (
              <button key={tab.id} onClick={() => go(tab)} aria-label="Create group"
                className="flex items-start justify-center pt-1 pb-2 select-none touch-manipulation">
                <span className={`-mt-4 w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-lg shadow-black/50 border-4 border-gray-900 transition-transform duration-200 ${pressed === tab.id ? 'scale-90' : active ? 'scale-105' : ''} ${active ? 'ring-2 ring-primary-400/60' : ''}`}>
                  <Icon className="w-5 h-5" />
                </span>
              </button>
            );
          }

          // Regular tabs: light gray on dark when idle, BRIGHT GREEN with a pill when active
          return (
            <button key={tab.id} onClick={() => go(tab)} aria-label={tab.label}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 select-none touch-manipulation ${active ? 'text-primary-400' : 'text-gray-400'}`}>
