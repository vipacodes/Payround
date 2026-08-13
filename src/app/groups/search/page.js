'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HiSearch, HiUserGroup, HiCalendar, HiCurrencyDollar, HiBadgeCheck } from 'react-icons/hi';
import GroupBadge from '@/components/GroupBadge';
import { frequencyLabel } from '@/lib/payments';



function RealGroupCard({ group, memberCount }) {
  return (
    <a
      href={`/groups/${group.id}`}
      className="bg-white rounded-2xl border border-gray-100 p-6 text-left card-hover w-full block"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {group.avatar_url
            ? <img src={group.avatar_url} alt={group.name} className="w-12 h-12 rounded-xl object-cover border border-gray-100 shrink-0" />
            : <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-50 rounded-xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-lg">{group.name.charAt(0)}</span></div>}
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
              <span className="truncate">{group.name}</span>
              <GroupBadge verified={group.is_verified} className="w-5 h-5 shrink-0" />
            </h3>
            <p className="text-xs text-gray-500 font-mono">ID: {group.id}</p>
          </div>
        </div>
        {/* tier check sits where the old badge pill used to be — embossed, owner-given only */}
        {group.badge_tier && <GroupBadge tier={group.badge_tier} className="w-8 h-8 shrink-0" />}
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">{group.description || 'Ajo savings group on PayRound.'}</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <HiCurrencyDollar className="w-4 h-4 text-primary-500 shrink-0" />
          <span>₦{Number(group.amount || 0).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <HiCalendar className="w-4 h-4 text-primary-500 shrink-0" />
          <span>{frequencyLabel(group)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 col-span-2">
          <HiUserGroup className="w-4 h-4 text-primary-500 shrink-0" />
          <span>{memberCount}/{group.max_members || '—'} members</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-50">
        <span className="text-xs text-gray-400">Admin: {group.admin_name || '—'}</span>
        <span className="text-sm font-medium text-primary-600">View & Join →</span>
      </div>
    </a>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [tab, setTabState] = useState(searchParams.get('tab') === 'users' ? 'users' : 'groups');

  // Keep the active tab (and query) in the URL so pressing "back" from a
  // profile/group returns to the SAME tab instead of resetting to Groups.
  const setTab = (t) => {
    setTabState(t);
    try { router.replace(`/groups/search?tab=${t}`, { scroll: false }); } catch {}
  };
  const [query, setQuery] = useState(initialQuery);
  const [groupsList, setGroupsList] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(!!initialQuery);
  const [loading, setLoading] = useState(true);
  // Users search
  const [usersList, setUsersList] = useState([]);
  const [userResults, setUserResults] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Search by group name, unique group ID, or group admin name
  const verifiedFirst = (list) => [...(list || [])].sort((a, b) => (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0));
  const applySearch = (gs, q) => {
    const needle = q.trim().toLowerCase();
    const base = !needle ? gs : gs.filter(g =>
      (g.name || '').toLowerCase().includes(needle) ||
      (g.id || '').toLowerCase() === needle ||
      (g.admin_name || '').toLowerCase().includes(needle) ||
      (g.admin_email || '').toLowerCase() === needle
    );
    return verifiedFirst(base);
  };

  // Load ONLY live (owner-approved) groups from the database
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        let gs = [];
        const full = await supabase
          .from('groups')
          .select('id, name, description, amount, frequency, frequency_days, max_members, admin_name, admin_email, is_verified, badge_tier, avatar_url, created_at, is_frozen')
          .in('status', ['active', 'approved'])
          .order('created_at', { ascending: false });
        if (!full.error) gs = full.data || [];
        else {
          const pub = await supabase.from('public_groups').select('*');
          gs = pub.data || [];
        }
        if (!mounted) return;
        const list = (gs || []).filter(g => !g.is_frozen); // ❄️ frozen groups are hidden from search
        setGroupsList(list);
        setResults(applySearch(list, initialQuery));
        // Real approved-member counts per group
        if (list.length > 0) {
          const { data: mems } = await supabase.from('members').select('group_id').in('status', ['active', 'approved']).in('group_id', list.map(g => g.id));
          if (!mounted) return;
          const counts = {};
          (mems || []).forEach(m => { counts[m.group_id] = (counts[m.group_id] || 0) + 1; });
          setMemberCounts(counts);
        }
      } catch (e) {
        console.log('Search load:', e.message);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Search users by name, unique user ID, or email prefix
  const applyUserSearch = (us, q) => {
    const needle = q.trim().toLowerCase();
    const base = !needle ? us : us.filter(u =>
      (u.name || '').toLowerCase().includes(needle) ||
      (u.id || '').toLowerCase().startsWith(needle) ||
      (u.email || '').toLowerCase().startsWith(needle)
    );
    return verifiedFirst(base);
  };

  // Load approved users when the Users tab opens (once)
  useEffect(() => {
    if (tab !== 'users' || usersList.length > 0 || usersLoading) return;
    let mounted = true;
    (async () => {
      setUsersLoading(true);
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('users')
          .select('id, name, email, profile_pic, is_verified, role, created_at')
          .or('is_approved.eq.true,approval_status.eq.approved')
          .order('created_at', { ascending: false })
          .limit(200);
        if (!mounted) return;
        const list = data || [];
        setUsersList(list);
        setUserResults(applyUserSearch(list, query));
      } catch (e) {
        console.log('Users search load:', e.message);
      }
      if (mounted) setUsersLoading(false);
    })();
    return () => { mounted = false; };
  }, [tab]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (tab === 'users') setUserResults(applyUserSearch(usersList, query));
    else setResults(applySearch(groupsList, query));
    setSearched(!!query.trim());
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{tab === 'users' ? 'Find People' : 'Find an Ajo Group'}</h1>
          <p className="text-gray-500">{tab === 'users' ? 'Search users by name or unique ID — view their profiles and badges' : 'Search by group name, unique Group ID or group admin — only live, approved groups are shown'}</p>
        </div>

        {/* Groups / People tabs */}
        <div className="flex gap-1.5 bg-white p-1.5 rounded-2xl border border-gray-200 w-fit shadow-sm mb-6">
          <button
            onClick={() => { setTab('groups'); setSearched(false); setQuery(''); setResults(groupsList); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'groups' ? 'bg-primary-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            👥 Groups
          </button>
          <button
            onClick={() => { setTab('users'); setSearched(false); setQuery(''); setUserResults(usersList); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'users' ? 'bg-primary-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            👤 People
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="max-w-2xl mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) { if (tab === 'users') setUserResults(usersList); else setResults(groupsList); setSearched(false); } }}
                placeholder={tab === 'users' ? 'Search users by name, ID, or email' : 'Search by group name, ID, or admin name'}
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
            <button
              type="submit"
              className="bg-primary-600 text-white font-medium px-6 py-3.5 rounded-2xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
            >
              Search
            </button>
          </div>
        </form>

        {tab === 'users' ? (
          usersLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-500">
                  {searched ? `${userResults.length} user${userResults.length !== 1 ? 's' : ''} found for "${query}"` : `${userResults.length} registered user${userResults.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              {userResults.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {userResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => router.push(`/users/${u.id}`)}
                      className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 text-left card-hover"
                    >
                      {u.profile_pic
                        ? <img src={u.profile_pic} alt={u.name} className="w-14 h-14 rounded-2xl object-cover border border-gray-100 shrink-0" />
                        : <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-xl">{(u.name || 'U').charAt(0).toUpperCase()}</span></div>}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{u.name || '—'}</span>
                          {u.is_verified && <HiBadgeCheck className="w-5 h-5 text-blue-500 shrink-0 badge-emboss" />}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">ID: {String(u.id || '').slice(0, 8)}</p>
                      </div>
                      <span className="text-sm font-medium text-primary-600 shrink-0">View →</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <HiSearch className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Users Found</h3>
                  <p className="text-gray-500">{searched ? 'No users match that search — try the exact name or ID.' : 'No approved users yet.'}</p>
                </div>
              )}
            </>
          )
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {/* Results */}
            <div className="mb-4">
              <p className="text-sm text-gray-500">
                {searched
                  ? `${results.length} group${results.length !== 1 ? 's' : ''} found for "${query}"`
                  : `${results.length} live group${results.length !== 1 ? 's' : ''} available`
                }
              </p>
            </div>

            {results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.map(group => (
                  <RealGroupCard key={group.id} group={group} memberCount={memberCounts[group.id] || 0} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <HiSearch className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Groups Found</h3>
                <p className="text-gray-500 mb-4">
                  {searched
                    ? 'No live groups match that search — check the name or Group ID and try again.'
                    : 'No groups are live yet. Once PayRound approves a group it appears here — or create your own!'}
                </p>
                <button
                  onClick={() => router.push('/groups/create')}
                  className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
                >
                  Create a New Group
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default function SearchGroupsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
