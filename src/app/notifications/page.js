'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { notifications as allNotifications } from '@/lib/data';
import {
  HiBell, HiCheckCircle, HiUser,
  HiCalendar, HiChevronRight
} from 'react-icons/hi';
import { HiMegaphone } from 'react-icons/hi2';
import { HiCurrencyDollar } from 'react-icons/hi';

const iconMap = {
  bell: HiBell,
  check: HiCheckCircle,
  cash: HiCurrencyDollar,
  megaphone: HiMegaphone,
  user: HiUser,
};

const colorMap = {
  payment_reminder: 'bg-yellow-50 border-yellow-100 text-yellow-700',
  payment_approved: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  payout: 'bg-purple-50 border-purple-100 text-purple-700',
  announcement: 'bg-blue-50 border-blue-100 text-blue-700',
  join_request: 'bg-primary-50 border-primary-100 text-primary-700',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // all | unread

  useEffect(() => {
    try {
      const stored = localStorage.getItem('payround_user');
      if (stored) {
        const user = JSON.parse(stored);
        // Each user's notification should not be about another account e.g finding James notification in Margaret's notification is wrong - per-user filtering
        const userGroups = [...(user.memberGroups||[]), ...(user.adminGroups||[])];
        const filteredForUser = allNotifications.filter(n => {
          // Only show notifications for groups user is member of, or personal notifications
          if (!n.groupId) return true; // general notifications
          return userGroups.includes(n.groupId) || n.message?.toLowerCase().includes(user.name?.toLowerCase()) || n.message?.toLowerCase().includes(user.email?.split('@')[0]);
        });
        // If no user-specific notifications, show only general, not other users' notifications
        setNotifications(filteredForUser.length > 0 ? filteredForUser : allNotifications.filter(n => n.type === 'payment_reminder' || n.type === 'announcement').slice(0,2));
      } else {
        setNotifications(allNotifications.slice(0,2));
      }
    } catch {
      setNotifications(allNotifications.slice(0,2));
    }
  }, []);

  const filtered = filter === 'unread' 
    ? notifications.filter(n => !n.read) 
    : notifications;

  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const IconComponent = ({ icon, className }) => {
    const Icon = iconMap[icon] || HiBell;
    return <Icon className={className} />;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-gray-500 text-sm">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-primary-600 font-medium hover:text-primary-700"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'all' 
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' 
                : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'unread' 
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' 
                : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-200'
            }`}
          >
            Unread
          </button>
        </div>

        {/* Notifications list */}
        <div className="space-y-3">
          {filtered.length > 0 ? (
            filtered.map(notification => (
              <div
                key={notification.id}
                onClick={() => markAsRead(notification.id)}
                className={`bg-white rounded-2xl border p-5 card-hover cursor-pointer ${
                  notification.read ? 'border-gray-100' : 'border-primary-100 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    colorMap[notification.type] || 'bg-gray-50 text-gray-600'
                  }`}>
                    <IconComponent icon={notification.icon} className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`text-sm ${notification.read ? 'font-medium text-gray-900' : 'font-semibold text-gray-900'}`}>
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1.5"></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <HiCalendar className="w-3.5 h-3.5" />
                        {notification.date}
                      </span>
                      {notification.groupId && (
                        <Link
                          href={`/groups/${notification.groupId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-primary-600 font-medium hover:text-primary-700"
                        >
                          View Group <HiChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <HiBell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up! 🎉</h3>
              <p className="text-sm text-gray-500">
                {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
