'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { HiMenu, HiX, HiSearch, HiBell, HiHome, HiUserGroup, HiCurrencyDollar, HiUser, HiLogout, HiChartBar } from 'react-icons/hi';
import { logoutUser, notifications as allNotifications } from '@/lib/data';
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
    // Count unread notifications
    const unread = allNotifications.filter(n => !n.read).length;
    setUnreadCount(unread);
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

          {/* Mobile Menu Button + Notification Bell directly beside hamburger at top right */}
          <div className="flex items-center gap-2 md:hidden">
            {isLoggedIn && (
              <button
                onClick={() => router.push('/notifications')}
                className="relative p-2 text-gray-600 hover:text-gray-900"
              >
                <HiBell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-gray-600 hover:text-gray-900"
            >
              {isMenuOpen ? <HiX className="w-6 h-6" /> : <HiMenu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop: Notification bell directly beside hamburger - hidden on mobile because we have separate mobile bell+hamburger above, visible on desktop as well beside profile */}
      {isLoggedIn && (
        <div className="hidden md:flex fixed top-4 right-20 z-50">
          <button
            onClick={() => router.push('/notifications')}
            className="relative p-2 bg-white rounded-full shadow-lg border text-gray-600 hover:text-primary-600"
          >
            <HiBell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

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
                  <MobileNavItem icon={<HiUser className="w-5 h-5" />} label="Profile" onClick={() => { router.push('/profile'); setIsMenuOpen(false); }} active={isActive('/profile')} />
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
