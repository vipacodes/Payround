'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HiSearch, HiX, HiBadgeCheck } from 'react-icons/hi';

// 🔍 Search ANYTHING on PayRound — groups, people, businesses and even app pages.
// Opens from the magnifier in the header (mobile + desktop).

const PAGES = [
  { name: 'Home', path: '/', k: 'home main landing page' },
  { name: 'Dashboard', path: '/dashboard', k: 'dashboard my groups overview tracker money' },
  { name: 'Join a Group', path: '/groups/search', k: 'join find group ajo savings' },
  { name: 'Create a Group', path: '/groups/create', k: 'create start new group admin' },
  { name: 'Group Chats', path: '/group-chat', k: 'group chats rooms talk members admin' },
  { name: 'Messages', path: '/messages', k: 'messages dm inbox chat support help' },
  { name: 'Advertise', path: '/ads', k: 'ads advertise promote business marketing media' },
  { name: 'Notifications', path: '/notifications', k: 'notifications alerts bell updates' },
  { name: 'My Profile', path: '/profile', k: 'profile me account photo badge verification' },
  { name: 'Settings', path: '/settings', k: 'settings password email bank security sounds theme' },
  { name: 'Login', path: '/login', k: 'login sign in forgot password' },
  { name: 'Sign Up Free', path: '/signup', k: 'signup register new account join payround' },
];

function Row({ onClick, children }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary-50 text-left transition-colors">
      {children}
    </button>
  );
}

const money = (n) => `₦${Number(n || 0).toLocaleString()}`;

export default function GlobalSearch({ onClose }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ groups: [], users: [], biz: [] });
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) { setRes({ groups: [], users: [], biz: [] }); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const like = `%${query.replace(/[%_,]/g, ' ').trim()}%`;
        const [g, u, b] = await Promise.all([
          supabase.from('groups').select('id, name, amount, frequency, avatar_url, is_verified, badge_tier').ilike('name', like).limit(6),
          supabase.from('users').select('id, name, profile_pic, is_verified').ilike('name', like).limit(6),
          supabase.from('ads').select('id, business_name').eq('biz_status', 'approved').ilike('business_name', like).limit(6),
        ]);
        const vf = (a, b) => (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0);
        setRes({
          groups: [...(g.data || [])].sort(vf),
          users: [...(u.data || [])].sort(vf),
          biz: b.data || [],
        });
      } catch { /* keep previous */ }
      setSearching(false);
    }, 280);
    return () => clearTimeout(timer.current);
  }, [q]);

  const go = (path) => { onClose(); router.push(path); };
  const ql = q.trim().toLowerCase();
  const pages = ql.length >= 2 ? PAGES.filter(p => p.name.toLowerCase().includes(ql) || p.k.includes(ql)).slice(0, 4) : [];
  const nothing = ql.length >= 2 && !searching && res.groups.length + res.users.length + res.biz.length + pages.length === 0;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="Search PayRound">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative max-w-2xl mx-3 sm:mx-auto mt-[76px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <HiSearch className="w-5 h-5 text-primary-600 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search anything on PayRound…"
            maxLength={60}
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <button onClick={onClose} aria-label="Close search" className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto">
          {ql.length < 2 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm font-semibold text-gray-700 mb-1">Search literally anything 🔍</p>
              <p className="text-xs text-gray-400 mb-3">Type at least 2 letters — find <b>groups</b>, <b>people</b>, <b>businesses</b> & <b>pages</b></p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {['groups', 'settings', 'ads', 'bank', 'messages'].map(s => (
                  <button key={s} onClick={() => setQ(s)} className="text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-100 px-2.5 py-1 rounded-full hover:bg-primary-100">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-2">
              {searching && <p className="px-5 py-2 text-[11px] text-gray-400 animate-pulse font-semibold">Searching…</p>}

              {res.groups.length > 0 && (
                <div className="px-2">
                  <p className="px-3 pb-1 text-[10px] font-bold text-gray-400">👥 GROUPS</p>
                  {res.groups.map(gr => (
                    <Row key={gr.id} onClick={() => go(`/groups/${gr.id}`)}>
                      {gr.avatar_url ? (
                        <img src={gr.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover border border-gray-100 shrink-0" />
                      ) : (
                        <span className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-sm shrink-0">{(gr.name || 'G').charAt(0).toUpperCase()}</span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 truncate">{gr.name}</span>
                        <span className="block text-[11px] text-gray-400">{money(gr.amount)} • {gr.frequency || ''}{gr.is_verified ? ' • ✅ verified' : ''}{gr.badge_tier ? ` • ${gr.badge_tier}` : ''}</span>
                      </span>
                      <span className="text-xs font-medium text-primary-600 shrink-0">Open →</span>
                    </Row>
                  ))}
                </div>
              )}

              {res.users.length > 0 && (
                <div className="px-2 mt-1">
                  <p className="px-3 pb-1 text-[10px] font-bold text-gray-400">🧑 PEOPLE</p>
                  {res.users.map(u => (
                    <Row key={u.id} onClick={() => go(`/users/${u.id}`)}>
                      {u.profile_pic ? (
                        <img src={u.profile_pic} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-100 shrink-0" />
                      ) : (
                        <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-sm shrink-0">{(u.name || 'P').charAt(0).toUpperCase()}</span>
                      )}
                      <span className="flex-1 min-w-0 flex items-center gap-1 text-sm font-semibold text-gray-900">
                        <span className="truncate">{u.name || 'PayRound member'}</span>
                        {u.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />}
                      </span>
                      <span className="text-xs font-medium text-primary-600 shrink-0">View →</span>
                    </Row>
                  ))}
                </div>
              )}

              {res.biz.length > 0 && (
                <div className="px-2 mt-1">
                  <p className="px-3 pb-1 text-[10px] font-bold text-gray-400">🏪 BUSINESSES</p>
                  {res.biz.map(b => (
                    <Row key={b.id} onClick={() => go(`/business/${b.id}`)}>
                      <span className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-sm shrink-0">{(b.business_name || 'B').charAt(0).toUpperCase()}</span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">{b.business_name}</span>
                      <span className="text-xs font-medium text-primary-600 shrink-0">Visit →</span>
                    </Row>
                  ))}
                </div>
              )}

              {pages.length > 0 && (
                <div className="px-2 mt-1">
                  <p className="px-3 pb-1 text-[10px] font-bold text-gray-400">📄 PAGES</p>
                  {pages.map(p => (
                    <Row key={p.path} onClick={() => go(p.path)}>
                      <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0">📄</span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">{p.name}</span>
                      <span className="text-xs font-medium text-primary-600 shrink-0">Go →</span>
                    </Row>
                  ))}
                </div>
              )}

              {nothing && (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm font-semibold text-gray-600">Nothing found for “{q.trim()}”</p>
                  <p className="text-xs text-gray-400 mt-1">Try another spelling — group names, people's names, business names or page names.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
