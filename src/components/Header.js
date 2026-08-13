'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { HiMenu, HiX, HiSearch, HiBell, HiHome, HiUserGroup, HiCurrencyDollar, HiUser, HiLogout, HiChartBar, HiCog, HiChatAlt2, HiCalculator, HiSpeakerphone } from 'react-icons/hi';
import QuickCalc from '@/components/QuickCalc';
import GlobalSearch from '@/components/GlobalSearch';
import ShareButton, { payroundInviteUrl } from '@/components/ShareSheet';
import { logoutUser } from '@/lib/data';
import { sounds } from '@/lib/sounds';
import toast from 'react-hot-toast';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false); // 🔍 search-anything overlay
  const router = useRouter();
  const pathname = usePathname();

  // Simple auth check from localStorage
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userIdShort, setUserIdShort] = useState('');
  const [userRole, setUserRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [gchatShow, setGchatShow] = useState(false);
  const [showCalc, setShowCalc] = useState(false);   // 👥 icon appears ONLY for group admins & members
  const [gchatUnread, setGchatUnread] = useState(0);
  const [frozen, setFrozen] = useState(false);       // ❄️ owner froze this account — app is covered with a notice

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setIsLoggedIn(true);
        setUserName(parsed.name || '');
        setUserIdShort(String(parsed.id || '').slice(0, 8));
        setUserRole(parsed.role || 'member');
      } catch (e) {}
    }
    // Real unread count — ONLY notifications meant for this user (personal, their groups, or broadcasts)
    let mounted = true;
    const loadUnread = async () => {
      let email = '';
      if (stored) { try { email = (JSON.parse(stored).email || '').toLowerCase(); } catch {} }
      // Unread direct messages (🟢 dot on the 💬 icon) — checked FIRST so it can never be skipped
      try {
        if (email) {
          const { supabase } = await import('@/lib/supabase');
          const { data: ms } = await supabase.from('messages').select('id').eq('to_email', email).eq('read', false).limit(100);
          if (mounted) setUnreadMsgs((ms || []).length);
        }
      } catch { if (mounted) setUnreadMsgs(0); }
      // Group chats (👥 icon) — visible ONLY to group admins and approved members
      try {
        if (email) {
          const { supabase } = await import('@/lib/supabase');
          const { getMyGroupIds } = await import('@/lib/notifications');
          const gids = await getMyGroupIds(supabase, email);
          if (mounted) setGchatShow(gids.length > 0);
          if (gids.length) {
            const { data: gm } = await supabase.from('group_messages').select('group_id, from_email, created_at').in('group_id', gids).order('created_at', { ascending: false }).limit(300);
            let n = 0;
            (gm || []).forEach(x => {
              if ((x.from_email || '').toLowerCase() === email) return;
              const cur = localStorage.getItem(`payround_gchat_read_${x.group_id}`) || '';
              if (!cur || x.created_at > cur) n += 1;
            });
            if (mounted) setGchatUnread(n);
          } else if (mounted) setGchatUnread(0);
        }
      } catch { if (mounted) setGchatUnread(0); } // group chat table missing? hide dot, never break the header
      // Unread notifications (🟢 dot on the bell) — simple rules, no silent failures
      try {
        const { supabase } = await import('@/lib/supabase');
        let gids = [];
        try { const { getMyGroupIds } = await import('@/lib/notifications'); gids = await getMyGroupIds(supabase, email); } catch { gids = []; }
        const { data } = await supabase.from('notifications').select('id, user_email, group_id, is_read').eq('is_read', false).limit(100);
        if (data && mounted) {
          let cleared = [];
          try { const { getClearedNotifIds } = await import('@/lib/notifications'); cleared = getClearedNotifIds(); } catch {}
          const hide = new Set(cleared.map(String));
          setUnreadCount(data.filter(n => {
            if (hide.has(String(n.id))) return false;
            const rowEm = (n.user_email || '').toLowerCase();
            if (rowEm) return !!email && rowEm === email;
            if (n.group_id) return gids.includes(n.group_id);
            return true; // broadcast to everyone
          }).length);
        }
      } catch { if (mounted) setUnreadCount(0); }
    };
    loadUnread();
    const t = setInterval(loadUnread, 15000);
    return () => { mounted = false; clearInterval(t); };
  }, [pathname]);

  // ❄️ Frozen-account watch — if PayRound freezes this account, the whole app is covered
  useEffect(() => {
    let mounted = true;
    let channel = null;
    const kickOff = async (reason) => {
      try { const { signOutEverywhere } = await import('@/lib/session'); await signOutEverywhere(); } catch {}
      try { localStorage.removeItem('payround_user'); } catch {}
      if (!mounted) return;
      setIsLoggedIn(false);
      setFrozen(false);
      const q = new URLSearchParams();
      q.set('takedown', '1');
      if (reason) q.set('reason', reason);
      toast.error('Your account was taken down by PayRound.');
      router.replace(`/login?${q.toString()}`);
    };
    const check = async () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const email = stored ? (JSON.parse(stored).email || '').toLowerCase() : '';
        if (!email) { if (mounted) setFrozen(false); return; }
        const { supabase } = await import('@/lib/supabase');
        const { data: td } = await supabase.rpc('account_takedown', { p_email: email });
        if (td?.taken_down) { await kickOff(td.reason); return; }
        const { data: acc } = await supabase.from('users').select('is_frozen').eq('email', email).maybeSingle();
        if (!acc) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { await kickOff('PayRound removed this account.'); return; }
        }
        if (mounted) setFrozen(!!acc?.is_frozen);
      } catch {}
    };
    check();
    const t = setInterval(check, 8000);
    (async () => {
      try {
        const stored = localStorage.getItem('payround_user');
        const email = stored ? (JSON.parse(stored).email || '').toLowerCase() : '';
        if (!email) return;
        const { supabase } = await import('@/lib/supabase');
        channel = supabase.channel(`takedown-${email}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'account_takedowns', filter: `email=eq.${email}` }, (payload) => {
            kickOff(payload?.new?.reason);
          })
          .subscribe();
      } catch {}
    })();
    return () => {
      mounted = false;
      clearInterval(t);
      try { if (channel) channel.unsubscribe(); } catch {}
    };
  }, [pathname]);

  // 📛 App icon badge — the installed app shows the total unread count on its home-screen icon
  useEffect(() => {
    try {
      const total = (unreadCount || 0) + (unreadMsgs || 0) + (gchatUnread || 0);
      if ('setAppBadge' in navigator) {
        if (total > 0) navigator.setAppBadge(total).catch(() => {});
        else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
      }
    } catch {}
  }, [unreadCount, unreadMsgs, gchatUnread]);

  // 🔊 Gentle sounds when something NEW lands while the app is open
  // (pop = message, ding = notification — first count is silent so pages never chirp on load)
  const prevCounts = useRef({ n: null, m: null, g: null });
  useEffect(() => {
    const prev = prevCounts.current;
    if (prev.n !== null) {
      if ((unreadMsgs || 0) > prev.m || (gchatUnread || 0) > prev.g) sounds.pop();
      else if ((unreadCount || 0) > prev.n) sounds.ding();
    }
    prevCounts.current = { n: unreadCount || 0, m: unreadMsgs || 0, g: gchatUnread || 0 };
  }, [unreadCount, unreadMsgs, gchatUnread]);

  // Restore saved light/dark theme on every page load
  useEffect(() => {
    if (localStorage.getItem('payround_theme') === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [pathname]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/groups/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    try { const { signOutEverywhere } = await import('@/lib/session'); await signOutEverywhere(); } catch {}
    logoutUser();
    setIsLoggedIn(false);
    setUserName('');
    setUserRole('');
    toast.success('Logged out successfully');
    router.push('/');
  };

  const isActive = (path) => pathname === path;

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      {frozen && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 bg-sky-50 border border-sky-200 rounded-full flex items-center justify-center text-4xl mb-5">❄️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account frozen</h1>
          <p className="text-sm text-gray-600 max-w-md mb-1">Your PayRound account has been frozen — you can&apos;t use the app right now.</p>
          <p className="text-xs text-gray-400 max-w-md mb-6">Think this is a mistake? Contact PayRound support on WhatsApp: <b className="text-gray-600">+234 915 1723 199</b></p>
          <button
            onClick={() => { try { localStorage.removeItem('payround_user'); } catch {} router.push('/login'); }}
            className="bg-primary-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-primary-700"
          >Log out</button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 min-w-0"
            aria-label="Payround home"
          >
            <img src="/images/logo-mark.png" alt="" className="w-8 h-8 rounded-lg shadow-sm object-cover shrink-0" />
            <img src="/images/logo-wordmark.png" alt="Payround" className="h-6 sm:h-7 w-auto max-w-[120px] sm:max-w-[150px] object-contain object-left" />
          </button>

          {/* Search Bar (Desktop) */}
          {/* 🔍 Desktop search trigger — opens the search-anything overlay (groups, people, businesses, pages) */}
          <button
            onClick={() => setShowSearch(true)}
            aria-label="Search PayRound"
            className="hidden md:flex items-center flex-1 max-w-md mx-8"
          >
            <span className="relative w-full text-left">
              <span className="w-full block pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 hover:bg-gray-100 hover:border-gray-300 transition-all">Search anything on PayRound…</span>
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            </span>
          </button>

          {/* Nav Items (Desktop) */}
          <nav className="hidden md:flex items-center gap-6">
            {isLoggedIn ? (
              <>
                <button
                  onClick={() => router.push('/dashboard')}
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                    isActive('/dashboard') ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <HiHome className="w-5 h-5" />
                  Dashboard
                </button>

                <button
                  onClick={() => router.push('/groups/search')}
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                    isActive('/groups/search') ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <HiUserGroup className="w-5 h-5" />
                  Join Group
                </button>

                <button
                  onClick={() => router.push('/groups/create')}
                  className="flex items-center gap-1.5 bg-primary-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
                >
                  <HiCurrencyDollar className="w-5 h-5" />
                  Create Group
                </button>

                <button
                  onClick={() => router.push('/ads?tab=mine')}
                  title="My Ads — live, pending, saved & declined ads"
                  className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                    isActive('/ads') ? 'text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <HiSpeakerphone className="w-5 h-5" />
                  My Ads
                </button>
                <ShareButton
                  compact
                  label="Share PayRound"
                  title="PayRound"
                  text="Join me on PayRound — save together with people you can see. Sign up free."
                  url={payroundInviteUrl()}
                />

                <button
                  onClick={() => setShowCalc(true)}
                  aria-label="Quick calculator"
                  title="Quick calculator"
                  className="relative p-2 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <HiCalculator className="w-6 h-6" />
                </button>

                <button
                  onClick={() => router.push('/notifications')}
                  aria-label="Notifications"
                  title="Notifications"
                  className="relative p-2 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <HiBell className="w-6 h-6" />
                  {unreadCount > 0 && <span className="msg-dot absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full" title="You have new notifications" />}
                </button>

                <button
                  onClick={() => router.push('/messages')}
                  aria-label="Messages"
                  title="Messages"
                  className="relative p-2 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <HiChatAlt2 className="w-6 h-6" />
                  {unreadMsgs > 0 && <span className="msg-dot absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full" title="You have new messages" />}
                </button>

                {gchatShow && (
                  <button
                    onClick={() => router.push('/group-chat')}
                    aria-label="Group chats"
                    title="Group chats"
                    className="relative p-2 text-gray-500 hover:text-primary-600 transition-colors"
                  >
                    <HiUserGroup className="w-6 h-6" />
                    {gchatUnread > 0 && <span className="msg-dot absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full" title="You have new group messages" />}
                  </button>
                )}

                <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{userName}</p>
                    <p className="text-xs text-gray-500 capitalize">{userRole}</p>
                  </div>
                  <button
                    onClick={() => router.push('/profile')}
                    className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center"
                  >
                    <span className="text-primary-700 font-semibold text-sm">
                      {userName.charAt(0)}
                    </span>
                  </button>
                  <button
                    onClick={() => router.push('/settings')}
                    title="Settings"
                    className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
                  >
                    <HiCog className="w-6 h-6" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowCalc(true)}
                  aria-label="Quick calculator"
                  title="Quick calculator"
                  className="relative p-2 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <HiCalculator className="w-6 h-6" />
                </button>
                <button
                  onClick={() => router.push('/login')}
                  className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors"
                >
                  Login
                </button>
                <ShareButton
                  compact
                  label="Share PayRound"
                  title="PayRound"
                  text="Join PayRound — save together with people you can see. Sign up free."
                  url={payroundInviteUrl()}
                />
                <button
                  onClick={() => router.push('/signup')}
                  className="bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
                >
                  Sign Up Free
                </button>
              </>
            )}
          </nav>

          {/* Mobile: 🔍 search, 🔔 bell & the rest sit beside the ☰ hamburger */}
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={() => setShowSearch(true)}
              aria-label="Search PayRound"
              title="Search PayRound"
              className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors"
            >
              <HiSearch className="w-6 h-6" />
            </button>
            <button
              onClick={() => setShowCalc(true)}
              aria-label="Quick calculator"
              className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors"
            >
              <HiCalculator className="w-6 h-6" />
            </button>
            {isLoggedIn && (
              <button
                onClick={() => router.push('/notifications')}
                aria-label="Notifications"
                className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors"
              >
                <HiBell className="w-6 h-6" />
                {unreadCount > 0 && <span className="msg-dot absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full" title="You have new notifications" />}
              </button>
            )}
            {isLoggedIn && (
              <button
                onClick={() => router.push('/messages')}
                aria-label="Messages"
                className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors"
              >
                <HiChatAlt2 className="w-6 h-6" />
                {unreadMsgs > 0 && <span className="msg-dot absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full" title="You have new messages" />}
              </button>
            )}
            {isLoggedIn && gchatShow && (
              <button
                onClick={() => router.push('/group-chat')}
                aria-label="Group chats"
                className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors"
              >
                <HiUserGroup className="w-6 h-6" />
                {gchatUnread > 0 && <span className="msg-dot absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full" title="You have new group messages" />}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Menu"
            title="Menu"
            className="ml-1 p-2 text-gray-800 hover:text-gray-900 border border-gray-200 rounded-xl bg-white shrink-0"
          >
            {isMenuOpen ? <HiX className="w-6 h-6" /> : <HiMenu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="bg-white border-t border-gray-100 animate-fade-in">
          <div className="px-4 py-4 space-y-4">
            {/* Mobile Search */}
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search groups by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>
            </form>

            <nav className="space-y-2">
              {isLoggedIn ? (
                <>
                  <MobileNavItem icon={<HiHome className="w-5 h-5" />} label="Dashboard" onClick={() => { router.push('/dashboard'); setIsMenuOpen(false); }} active={isActive('/dashboard')} />
                  <MobileNavItem icon={<HiUserGroup className="w-5 h-5" />} label="Join Group" onClick={() => { router.push('/groups/search'); setIsMenuOpen(false); }} active={isActive('/groups/search')} />
                  <MobileNavItem icon={<HiChartBar className="w-5 h-5" />} label="Create Group" onClick={() => { router.push('/groups/create'); setIsMenuOpen(false); }} active={isActive('/groups/create')} />
                  <MobileNavItem icon={<HiSpeakerphone className="w-5 h-5" />} label="My Ads" onClick={() => { router.push('/ads?tab=mine'); setIsMenuOpen(false); }} active={isActive('/ads')} />
                  <MobileNavItem icon={<HiBell className="w-5 h-5" />} label={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} onClick={() => { router.push('/notifications'); setIsMenuOpen(false); }} active={isActive('/notifications')} />
                  <MobileNavItem icon={<HiChatAlt2 className="w-5 h-5" />} label={`Messages${unreadMsgs > 0 ? ` (${unreadMsgs})` : ''}`} onClick={() => { router.push('/messages'); setIsMenuOpen(false); }} active={isActive('/messages')} />
                  {gchatShow && (
                    <MobileNavItem icon={<HiUserGroup className="w-5 h-5" />} label={`Group chats${gchatUnread > 0 ? ` (${gchatUnread})` : ''}`} onClick={() => { router.push('/group-chat'); setIsMenuOpen(false); }} active={isActive('/group-chat')} />
                  )}
                  <MobileNavItem icon={<HiUser className="w-5 h-5" />} label="Profile" onClick={() => { router.push('/profile'); setIsMenuOpen(false); }} active={isActive('/profile')} />
                  <MobileNavItem icon={<HiCog className="w-5 h-5" />} label="Settings" onClick={() => { router.push('/settings'); setIsMenuOpen(false); }} active={isActive('/settings')} />
                  <div className="px-1 pt-1">
                    <ShareButton
                      label="Share PayRound with friends"
                      title="PayRound"
                      text="Join me on PayRound — save together with people you can see. Sign up free."
                      url={payroundInviteUrl()}
                      className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary-800 bg-primary-50 border border-primary-200 px-4 py-3 rounded-xl"
                    />
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 text-red-600 bg-red-50 rounded-xl text-sm font-medium"
                  >
                    <HiLogout className="w-5 h-5" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <MobileNavItem icon={<HiUser className="w-5 h-5" />} label="Login" onClick={() => { router.push('/login'); setIsMenuOpen(false); }} />
                  <MobileNavItem icon={<HiUserGroup className="w-5 h-5" />} label="Sign Up" onClick={() => { router.push('/signup'); setIsMenuOpen(false); }} />
                </>
              )}
            </nav>
          </div>
        </div>
      )}
      <QuickCalc open={showCalc} onClose={() => setShowCalc(false)} />
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </header>
  );
}

function MobileNavItem({ icon, label, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
