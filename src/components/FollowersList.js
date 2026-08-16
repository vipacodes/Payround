'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiBadgeCheck, HiUserGroup, HiX } from 'react-icons/hi';

// Safe public follower projection: UUID/profile fields only, never follower emails.
export default function FollowersList({ userId, userName, onClose, highlight }) {
  const router = useRouter();
  const [people, setPeople] = useState(null);
  const highlightedId = String(highlight || '').toLowerCase();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.rpc('get_public_followers', { p_target_id: userId });
        if (error) throw error;
        if (active) setPeople(data || []);
      } catch (error) {
        console.error('Unable to load followers:', error);
        if (active) setPeople([]);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!people || !highlightedId) return;
    const match = people.find((person) => String(person.id || '').toLowerCase() === highlightedId);
    const el = match ? document.getElementById(`follower-${match.id}`) : null;
    if (el) setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 150);
  }, [people, highlightedId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
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
            people.map((person) => {
              const isHighlighted = Boolean(highlightedId && String(person.id || '').toLowerCase() === highlightedId);
              const profileAvailable = person.profile_available !== false;
              return (
                <button
                  id={`follower-${person.id}`}
                  key={person.id}
                  onClick={profileAvailable ? () => { onClose(); router.push(`/users/${person.id}`); } : undefined}
                  disabled={!profileAvailable}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left disabled:cursor-default ${isHighlighted ? 'bg-primary-50 ring-2 ring-primary-400 rounded-xl my-0.5 hover:bg-primary-100' : profileAvailable ? 'hover:bg-gray-50' : ''}`}
                >
                  {person.profile_pic ? (
                    <img src={person.profile_pic} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-100 shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">{(person.name || 'P').charAt(0).toUpperCase()}</span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                      <span className="truncate">{person.name || 'PayRound member'}</span>
                      {person.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0 badge-emboss" title="Verified by PayRound" />}
                    </span>
                    {isHighlighted && <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold bg-primary-600 text-white px-2 py-0.5 rounded-full">🎉 just followed you</span>}
                  </span>
                  <span className={`text-xs font-medium shrink-0 ${profileAvailable ? 'text-primary-600' : 'text-gray-400'}`}>
                    {profileAvailable ? 'View →' : 'Follower'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
