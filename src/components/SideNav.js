'use client';

// 🖥 WhatsApp-style left icon rail — DESKTOP ONLY (phones keep the bottom tab bar).
// Fixed strip on the left with the main navigation stacked vertically.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { HiHome, HiUserGroup, HiPlus, HiBell, HiChatAlt2, HiUser, HiLogout } from 'react-icons/hi';
import { sounds } from '@/lib/sounds';
import { logoutUser } from '@/lib/data';
import toast from 'react-hot-toast';

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

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pressed, setPressed] = useState(null);
  const [homeHref, setHomeHref] = useState('/');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    const read = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem('payround_user') || 'null');
        setIsLoggedIn(!!parsed?.email);
        setHomeHref(parsed?.email ? '/dashboard' : '/');
      } catch { setHomeHref('/'); }
    };
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  // 🔴 Badges — unread direct messages + my unread notifications
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const parsed = JSON.parse(localStorage.getItem('payround_user') || 'null');
        const email = (parsed?.email || '').toLowerCase();
        if (!email) { if (!cancelled) { setUnreadChats(0); setUnreadAlerts(0); } return; }
        const { supabase } = await import('@/lib/supabase');
        const [{ data: ms }, { data: ns }] = await Promise.all([
          supabase.from('messages').select('id').eq('to_email', email).eq('read', false).limit(50),
          supabase.from('notifications').select('id, user_email, group_id, is_read').eq('is_read', false).limit(100),
        ]);
        if (cancelled) return;
        setUnreadChats((ms || []).length);
        const { getClearedNotifIds, getMyGroupIds } = await import('@/lib/notifications');
        const gids = await getMyGroupIds(supabase, email);
        const cleared = new Set((getClearedNotifIds() || []).map(String));
        setUnreadAlerts((ns || []).filter(x => {
          if (cleared.has(String(x.id))) return false;
          const em = (x.user_email || '').toLowerCase();
          if (em) return em === email;
          if (x.group_id) return gids.includes(x.group_id);
          return true;
        }).length);
      } catch { if (!cancelled) { setUnreadChats(0); setUnreadAlerts(0); } }
    };
    check();
    const t = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, [pathname]);

  // 📐 Push all page content right of the rail on desktop
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => { document.body.style.paddingLeft = mq.matches ? '72px' : ''; };
    apply();
    mq.addEventListener?.('change', apply);
    return () => { mq.removeEventListener?.('change', apply); document.body.style.paddingLeft = ''; };
  }, []);

  const go = (href, id) => {
    try { sounds.pop(); } catch {}
    if (!tabActive(pathname, id)) router.push(href);
  };

  const doLogout = async () => {
    try { const { signOutEverywhere } = await import('@/lib/session'); await signOutEverywhere(); } catch {}
    logoutUser();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const items = [
    { id: 'home',    label: 'Home',    Icon: HiHome,     href: homeHref },
    { id: 'groups',  label: 'Groups',  Icon: HiUserGroup, href: '/groups/search' },
    { id: 'alerts',  label: 'Alerts',  Icon: HiBell,     href: '/notifications', badge: unreadAlerts },
    { id: 'chats',   label: 'Chats',   Icon: HiChatAlt2, href: '/messages', badge: unreadChats },
    { id: 'profile', label: 'Profile', Icon: HiUser,     href: '/profile' },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[72px] z-[60] flex-col items-center bg-white border-r border-gray-200 shadow-sm py-4">
      <button onClick={() => go(homeHref, 'home')} aria-label="Payround home" title="Home" className="mb-5 shrink-0">
        <img src="/images/logo-mark.png" alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
      </button>
      <nav className="flex-1 flex flex-col items-center gap-1.5 w-full overflow-y-auto">
        {items.map((it) => {
          const active = tabActive(pathname, it.id);
          const { Icon } = it;
          return (
            <button key={it.id} onClick={() => go(it.href, it.id)} aria-label={it.label} title={it.label}
              className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shrink-0 ${active ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
              <Icon className="w-6 h-6" />
              {it.badge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {it.badge > 9 ? '9+' : it.badge}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={() => go('/groups/create', 'create')} aria-label="Create group" title="Create group"
          className="mt-2 w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-lg shadow-primary-600/40 hover:scale-105 transition-transform shrink-0">
          <HiPlus className="w-6 h-6" />
        </button>
      </nav>
      {isLoggedIn && (
        <button onClick={doLogout} aria-label="Log out" title="Log out"
          className="mt-3 w-12 h-12 rounded-2xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0">
          <HiLogout className="w-6 h-6" />
        </button>
      )}
    </aside>
  );
}
