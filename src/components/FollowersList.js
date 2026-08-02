'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HiBadgeCheck, HiX, HiUserGroup } from 'react-icons/hi';

// Tappable followers list popup — every follower resolves to their real PayRound profile when possible
export default function FollowersList({ userId, userEmail, userName, onClose }) {
  const router = useRouter();
  const [people, setPeople] = useState(null); // null = still loading

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        let q = supabase.from('follows').select('follower_email, created_at').order('created_at', { ascending: false });
        q = userEmail ? q.eq('following_email', userEmail.toLowerCase()) : q.eq('following_id', String(userId));
        const { data: rows } = await q;
        const emails = [...new Set((rows || []).map(r => (r.follower_email || '').toLowerCase()).filter(Boolean))];
        let byEmail = {};
        if (emails.length > 0) {
          const { data: us } = await supabase.from('users').select('id, name, email, profile_pic, is_verified').in('email', emails);
          (us || []).forEach(u => { byEmail[(u.email || '').toLowerCase()] = u; });
        }
        if (mounted) setPeople(emails.map(email => ({ email, u: byEmail[email] })));
      } catch { if (mounted) setPeople([]); }
    })();
    return () => { mounted = false; };
  }, [userId, userEmail]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <p className="font-bold text-gray-900 text-sm">Followers{userName ? ` · ${userName}` : ''}</p>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto">
          {people === null ? (
            <p className="text-center text-sm text-gray-400 py-8">Loading followers…</p>
          ) : people.length === 0 ? (
            <div className="text-center py-10 px-6">
              <HiUserGroup className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No followers yet — share this profile to get some! 🚀</p>
            </div>
          ) : (
            people.map(({ email, u }) => (
              <button
                key={email}
                onClick={() => { if (u?.id) { onClose(); router.push(`/users/${u.id}`); } }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                {u?.profile_pic ? (
                  <img src={u.profile_pic} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-100 shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">{(u?.name || 'P').charAt(0).toUpperCase()}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                    <span className="truncate">{u?.name || 'PayRound member'}</span>
                    {u?.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0 badge-emboss" title="Verified by PayRound" />}
                  </span>
                </span>
                {u?.id && <span className="text-xs font-medium text-primary-600 shrink-0">View →</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
