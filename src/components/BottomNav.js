'use client';

// 📱 App-style bottom tab bar — makes PayRound feel like a real mobile app.
//   • Fixed to the bottom of the screen on PHONES ONLY (desktop stays as it was)
//   • Icons BOUNCE + play a soft pop sound when tapped (reactive)
//   • The tab you are on stays GREEN (icon + pill + label) so users always
//     know where they are — including deep pages like a group page or a chat.
// Pure navigation layer: no existing Payround function is changed.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { HiHome, HiUserGroup, HiPlus, HiChatAlt2, HiUser } from 'react-icons/hi';
import { sounds } from '@/lib/sounds';

// Which tab lights up for the current page?
function tabActive(p, id) {
  p = p || '/';
  switch (id) {
    case 'home':     return p === '/' || p.startsWith('/dashboard');
    case 'groups':   return (p.startsWith('/groups') && !p.startsWith('/groups/create')) || p.startsWith('/group-chat');
    case 'create':   return p.startsWith('/groups/create');
    case 'messages': return p.startsWith('/messages');
    case 'profile':  return p.startsWith('/profile');
    default:         return false;
  }
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pressed, setPressed] = useState(null);
  const [homeHref, setHomeHref] = useState('/');
  const [unread, setUnread] = useState(0);

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

  // Red badge on Messages for unread DMs (same lightweight check the header uses)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const email = stored ? (JSON.parse(stored).email || '').toLowerCase() : '';
        if (!email) { if (!cancelled) setUnread(0); return; }
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.from('messages').select('id').eq('to_email', email).eq('read', false).limit(50);
        if (!cancelled) setUnread((data || []).length);
      } catch { if (!cancelled) setUnread(0); }
    };
    check();
    const t = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, [pathname]);

  const tabs = [
    { id: 'home', label: 'Home', Icon: HiHome, href: homeHref },
    { id: 'groups', label: 'Groups', Icon: HiUserGroup, href: '/groups/search' },
    { id: 'create', label: 'Create', Icon: HiPlus, href: '/groups/create', main: true },
    { id: 'messages', label: 'Messages', Icon: HiChatAlt2, href: '/messages', badge: unread },
    { id: 'profile', label: 'Profile', Icon: HiUser, href: '/profile' },
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
      className="md:hidden fixed bottom-0 inset-x-0 z-[70] bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-5 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = tabActive(pathname, tab.id);
          const { Icon } = tab;

          // ⭐ Big raised green CREATE button (like TikTok's + button)
          if (tab.main) {
            return (
              <button key={tab.id} onClick={() => go(tab)} aria-label="Create group"
                className="flex items-start justify-center pt-1 pb-2 select-none touch-manipulation">
                <span className={`-mt-5 w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-lg shadow-primary-600/40 border-4 border-white transition-transform duration-200 ${pressed === tab.id ? 'scale-90' : active ? 'scale-105' : ''} ${active ? 'ring-4 ring-primary-200' : ''}`}>
                  <Icon className="w-6 h-6" />
                </span>
              </button>
            );
          }

          // Regular tabs: gray when idle, GREEN with a pill when active
          return (
            <button key={tab.id} onClick={() => go(tab)} aria-label={tab.label}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 select-none touch-manipulation ${active ? 'text-primary-600' : 'text-gray-400'}`}>
              <span className={`relative w-12 h-7 rounded-full flex items-center justify-center ${active ? 'bg-primary-100' : ''} ${pressed === tab.id ? 'bottom-nav-pop' : ''}`}>
                <Icon className="w-6 h-6" />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-semibold leading-none ${active ? 'text-primary-600' : 'text-gray-500'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
