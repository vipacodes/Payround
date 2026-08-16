'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  HiBell, HiCheckCircle, HiUser, HiUserGroup,
  HiChevronRight, HiBadgeCheck, HiRefresh, HiTrash, HiLockClosed
} from 'react-icons/hi';
import { HiMegaphone } from 'react-icons/hi2';

const typeStyle = (type = '') => {
  if (type.includes('unfrozen')) return 'bg-emerald-50 border-emerald-100 text-emerald-700';
  if (type.includes('frozen')) return 'bg-sky-50 border-sky-100 text-sky-700';
  if (type.includes('declin') || type.includes('reject')) return 'bg-red-50 border-red-100 text-red-700';
  if (type.includes('approve') || type.includes('verif') || type.includes('join_approved') || type.includes('group_full')) return 'bg-emerald-50 border-emerald-100 text-emerald-700';
  if (type.includes('referral') || type.includes('payment') || type.includes('payout')) return 'bg-yellow-50 border-yellow-100 text-yellow-700';
  if (type.includes('announce')) return 'bg-blue-50 border-blue-100 text-blue-700';
  return 'bg-primary-50 border-primary-100 text-primary-700';
};

const typeIcon = (type = '') => {
  if (type.includes('account_frozen') || type.includes('account_unfrozen')) return <HiLockClosed className="w-5 h-5" />;
  if (type.includes('join') || type.includes('group_full')) return <HiUserGroup className="w-5 h-5" />;
  if (type.includes('verif')) return <HiBadgeCheck className="w-5 h-5" />;
  if (type.includes('user')) return <HiUser className="w-5 h-5" />;
  if (type.includes('announce')) return <HiMegaphone className="w-5 h-5" />;
  return <HiBell className="w-5 h-5" />;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myEmail, setMyEmail] = useState('');

  const load = async () => {
    try {
      const stored = localStorage.getItem('payround_user');
      let email = '';
      if (stored) { try { email = (JSON.parse(stored).email || '').toLowerCase(); } catch {} }
      if (email) setMyEmail(email);
      const { supabase } = await import('@/lib/supabase');
      const { isVisibleTo, getMyGroupIds, purgeOldNotifications, getClearedNotifIds } = await import('@/lib/notifications');
      // Auto-cleanup: notifications older than 60 days are deleted to save storage space
      await purgeOldNotifications(supabase);
      // Groups I belong to (admin or approved member) — for group-shared notifications
      const gids = await getMyGroupIds(supabase, email);
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
      const cleared = new Set(getClearedNotifIds());
      setNotifications((data || []).filter(n => isVisibleTo(n, email, gids) && !cleared.has(String(n.id))));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // keep in sync with the bell
    return () => clearInterval(t);
  }, []);

  // Follower notifications carry the follower in a hidden [[FOL:email]] token — strip it for display, use it for deep links
  const parseFol = (msg = '') => {
    const m = String(msg).match(/\[\[FOL:([^\]]*)\]\]\s*$/);
    return { text: m ? String(msg).slice(0, String(msg).length - m[0].length) : String(msg), fol: m ? m[1].toLowerCase() : '' };
  };

  // Where should tapping a notification take you? Every notification type has a sensible home.
  const destinationFor = (n) => {
    const t = n?.type || '';
    const gid = n?.group_id;
    const g = gid ? `/groups/${gid}` : null;
    switch (t) {
      // ADMIN-side: act on requests/reviews
      case 'join_request':       // 🔔 someone requested to join → approve / offer spots in the Members tab
      case 'offer_lapsed':
      case 'offer_accepted':
      case 'offer_declined':
        return gid ? `/dashboard/admin/${gid}/members` : '/dashboard';
      case 'payment_submitted':  // 🧾 a member uploaded a receipt → approve/decline in the Payments tab
        return gid ? `/dashboard/admin/${gid}/payments` : '/dashboard';
      // MEMBER-side: your group page has offers, trackers & payment history
      case 'payment_approved':
      case 'payment_declined':
      case 'payout_collected':
      case 'join_approved':
      case 'join_declined':
      case 'spot_offer':
      case 'group_full':         // 🎉 your group filled up — the group page shows the board + pay card
        return g || '/dashboard';
      case 'renewal_reminder':   // ⏰ your group plan renews soon → dashboard shows the renewal date on your group
        return '/dashboard';
      case 'group_approved':
        return g || '/dashboard';
      case 'group_rejected':
        return '/dashboard';
      // Account-side
      case 'photo_approved':
      case 'photo_declined':     // message itself says "upload from Settings"
        return '/settings';
      case 'verification_approved':
      case 'verification_declined':
        return g || '/profile'; // group verifications → the group; personal blue badge → profile (re-apply there)
      case 'new_follower': {
        const f = parseFol(n.message).fol; // who followed → open MY followers list with them highlighted
        return f ? `/profile?followers=1&hl=${encodeURIComponent(f)}` : '/profile';
      }
      case 'referral_bonus':
        return '/profile';
      case 'ad_review':
        return '/ads';
      case 'user_approved':
      case 'user_declined':
        return '/dashboard';
      case 'account_frozen':
      case 'account_unfrozen':
        return '/settings';
      default:
        return g || null; // group-related → the group; otherwise just mark it read
    }
  };

  // Tap a notification: mark it read, then jump straight to where the action is
  const openNotification = (n) => {
    markRead(n.id);
    const dest = destinationFor(n);
    if (dest) router.push(dest);
  };

  // Delete ONLY my personal notifications — shared/broadcast ones belong to everyone
  const deleteOne = async (id) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (!error) setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  const clearAllMine = async () => {
    const ids = notifications.map(n => n.id);
    if (ids.length === 0) return;
    try {
      const { rememberClearedNotifIds } = await import('@/lib/notifications');
      rememberClearedNotifIds(ids);
      const { supabase } = await import('@/lib/supabase');
      const mine = notifications.filter(n => myEmail && n.user_email && n.user_email.toLowerCase() === myEmail);
      if (mine.length) {
        await supabase.from('notifications').delete().in('id', mine.map(n => n.id));
      }
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length) {
        await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      }
    } catch {}
    setNotifications([]);
  };

  // Only marks MY visible notifications as read — never other users' notifications
  const markAllRead = async () => {
    try {
      const ids = notifications.filter(n => !n.is_read).map(n => n.id);
      if (ids.length === 0) return;
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('notifications').update({ is_read: true }).in('id', ids);
      load();
    } catch {}
  };

  const markRead = async (id) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">
              {loading ? 'Loading…' : unread > 0 ? `${unread} unread` : 'All caught up 🎉'}
              <span className="block text-[11px] text-gray-400 mt-0.5">Tap any notification to jump straight to the right place — approve joins, review receipts, answer spot offers…</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50" title="Refresh">
              <HiRefresh className="w-5 h-5" />
            </button>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm font-medium text-primary-600 border border-primary-200 bg-primary-50 px-3.5 py-2 rounded-xl hover:bg-primary-100">
                <HiCheckCircle className="w-4 h-4" /> Mark all read
              </button>
            )}
            <button onClick={clearAllMine} className="flex items-center gap-1.5 text-sm font-medium text-red-500 border border-red-200 bg-red-50 px-3.5 py-2 rounded-xl hover:bg-red-100" title="Delete all my personal notifications">
              <HiTrash className="w-4 h-4" /> Clear
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white border border-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map(n => {
              const personal = myEmail && n.user_email && n.user_email.toLowerCase() === myEmail;
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  title="Tap to open"
                  className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-colors ${typeStyle(n.type)} ${n.is_read ? 'opacity-60' : ''} bg-white hover:shadow-sm`}
                >
                  <span className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeStyle(n.type)}`}>
                    {typeIcon(n.type)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-900 leading-snug">{parseFol(n.message).text}</span>
                    <span className="block text-xs text-gray-400 mt-1">
                      {personal ? 'For you • ' : ''}{n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                      {n.group_id ? ` • Group ${n.group_id}` : ''}
                    </span>
                  </span>
                  <HiChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-2.5" />
                  {!n.is_read && <span className="w-2.5 h-2.5 bg-primary-600 rounded-full shrink-0 mt-2" />}
                  {personal && (
                    <span
                      role="button"
                      title="Delete this notification"
                      onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }}
                      className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <HiTrash className="w-4 h-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiBell className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No notifications yet</h3>
            <p className="text-sm text-gray-500 mb-6">Approvals, verifications, payouts and announcements will show here.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-primary-700"
            >
              Go to Dashboard <HiChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
