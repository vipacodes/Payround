'use client';

// 📱 App-style bottom tab bar — dark, high-contrast, TikTok-style.
//   • Solid dark background so the icons stand out clearly
//   • 6 tabs: Home · Groups · ＋ (smaller) · Alerts (🔔) · Chats · Profile
//   • Icons BOUNCE + pop sound on tap; the ACTIVE tab stays bright green
//   • Chat screens keep the bar — the chat column stops just above it
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

  // 🔴 Badge on the Alerts tab — my unread notifications (personal + my groups + broadcasts)
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
