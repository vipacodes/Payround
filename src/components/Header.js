'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { HiMenu, HiX, HiSearch, HiBell, HiHome, HiUserGroup, HiCurrencyDollar, HiUser, HiLogout, HiChartBar, HiCog, HiChatAlt2 } from 'react-icons/hi';
import { logoutUser } from '@/lib/data';
import toast from 'react-hot-toast';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const pathname = usePathname();

  // Simple auth check from localStorage
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setIsLoggedIn(true);
        setUserName(parsed.name || '');
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
      try {
        const { supabase } = await import('@/lib/supabase');
        const { isVisibleTo, getMyGroupIds } = await import('@/lib/notifications');
        const gids = await getMyGroupIds(supabase, email);
        const { data, error } = await supabase.from('notifications').select('id, user_email, group_id, is_read').eq('is_read', false).order('created_at', { ascending: false }).limit(100);
        if (!error && data && mounted) {
          setUnreadCount(data.filter(n => isVisibleTo(n, email, gids)).length);
          return;
        }
      } catch {}
      if (mounted) setUnreadCount(0);
    };
    loadUnread();
    const t = setInterval(loadUnread, 15000);
    return () => { mounted = false; clearInterval(t); };
  }, [pathname]);

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

  const handleLogout = () => {
    logoutUser();
    localStorage.removeItem('payround_user');
    setIsLoggedIn(false);
    setUserName('');
    setUserRole('');
    toast.success('Logged out successfully');
    router.push('/');
  };

  const isActive = (path) => pathname === path;

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-primary-600 to-primary-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-200">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="text-xl font-bold text-gray-900">
              Pay<span className="text-primary-600">round</span>
            </span>
          </button>

          {/* Search Bar (Desktop) */}
          <form onSubmit={handleSearch} className="hidden md:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search by Group Name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            </div>
          </form>

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
                  onClick={() => router.push('/notifications')}
                  className="relative p-2 text-gray-500 hover:text-primary-600 transition-colors"
                >
                  <HiBell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-200">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
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
                  onClick={() => router.push('/login')}
                  className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => router.push('/signup')}
                  className="bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
                >
                  Sign Up Free
                </button>
              </>
            )}
          </nav>

          {/* Mobile: 🔔 bell sits directly beside the ☰ hamburger */}
          <div className="md:hidden flex items-center gap-1">
            {isLoggedIn && (
              <button
                onClick={() => router.push('/notifications')}
                aria-label="Notifications"
                className="relative p-2 text-gray-600 hover:text-primary-600 transition-colors"
              >
                <HiBell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-200">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
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
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Menu"
              className="p-2 text-gray-600 hover:text-gray-900"
            >
              {isMenuOpen ? <HiX className="w-6 h-6" /> : <HiMenu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 animate-fade-in">
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
                  <MobileNavItem icon={<HiBell className="w-5 h-5" />} label={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} onClick={() => { router.push('/notifications'); setIsMenuOpen(false); }} active={isActive('/notifications')} />
                  <MobileNavItem icon={<HiChatAlt2 className="w-5 h-5" />} label={`Messages${unreadMsgs > 0 ? ` (${unreadMsgs})` : ''}`} onClick={() => { router.push('/messages'); setIsMenuOpen(false); }} active={isActive('/messages')} />
                  <MobileNavItem icon={<HiUser className="w-5 h-5" />} label="Profile" onClick={() => { router.push('/profile'); setIsMenuOpen(false); }} active={isActive('/profile')} />
                  <MobileNavItem icon={<HiCog className="w-5 h-5" />} label="Settings" onClick={() => { router.push('/settings'); setIsMenuOpen(false); }} active={isActive('/settings')} />
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
