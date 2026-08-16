'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import GroupBadge from '@/components/GroupBadge';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import BroadcastAlert from '@/components/BroadcastAlert';
import AdSlideshow from '@/components/AdSlideshow';
import {
  HiUserGroup, HiUsers, HiCalendar, HiBadgeCheck, HiArrowRight, HiShieldCheck,
  HiSearch, HiPlusCircle, HiExclamation, HiCash, HiPhotograph, HiUser
} from 'react-icons/hi';
import {
  parseSpots, currentPeriod, cycleLength,
  buildSpotMap, nextDueForMember, nextCashOutForMember, nextPayoutForGroup, withRotationClock, frequencyLabel, adminAutoSpots
} from '@/lib/payments';
import { remindRenewalIfSoon } from '@/lib/renewal';
import toast from 'react-hot-toast';


const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState([]);   // [{ group, member, payments, payouts }]
  const [pendingReqs, setPendingReqs] = useState([]); // join / extra-spot requests I sent
  const [managed, setManaged] = useState([]); // [{ group, members, payments, payouts }]
  const [ads, setAds] = useState([]);
  const [activeTab, setActiveTab] = useState(null); // joined | manage | due | cash | browse | people
  // browse + people panels
  const [liveGroups, setLiveGroups] = useState([]);
  const [groupCounts, setGroupCounts] = useState({});
  const [groupQ, setGroupQ] = useState('');
  const [peopleQ, setPeopleQ] = useState('');
  const [people, setPeople] = useState([]);
  const [peopleSearched, setPeopleSearched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { supabase, getAdsFromSupabase } = await import('@/lib/supabase');
        const authResult = await supabase.auth.getUser();
        if (authResult.error || !authResult.data?.user) {
          setLoading(false);
          router.replace('/login');
          return;
        }
        const { data: profile, error: profileError } = await supabase.rpc('get_my_profile');
        if (profileError) throw profileError;
        if (!profile?.id || !profile?.email) {
          setLoading(false);
          router.replace('/login');
          return;
        }
        setUser(profile);
        setAccount(profile);
        try { localStorage.setItem('payround_user', JSON.stringify(profile)); } catch {}
        const email = profile.email.toLowerCase();

        getAdsFromSupabase().then(setAds).catch(() => {});

        const { data: mine } = await supabase.from('members').select('*')
          .eq('member_email', email).eq('status', 'approved');
        const joinedOut = [];
        for (const m of mine || []) {
          const { data: g } = await supabase.from('groups').select('*').eq('id', m.group_id).single();
          if (!g) continue;
          const { data: pays } = await supabase.from('payments').select('*').eq('group_id', m.group_id);
          const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', m.group_id);
          const { data: memsAll } = await supabase.from('members').select('spots, status, approved_at').eq('group_id', m.group_id).eq('status', 'approved');
          joinedOut.push({ group: g, member: m, members: memsAll || [], payments: pays || [], payouts: outs || [] });
        }
        setJoined(joinedOut);

        const { data: pendingMine } = await supabase.from('members').select('*')
          .eq('member_email', email).in('status', ['pending', 'spot_offered']);
        const reqOut = [];
        for (const m of pendingMine || []) {
          const { data: g } = await supabase.from('groups').select('id, name, avatar_url, admin_email').eq('id', m.group_id).maybeSingle();
          reqOut.push({ member: m, group: g });
        }
        // extra-spot requests on groups I already joined
        for (const row of joinedOut) {
          if (row.member?.extra_spots_request) reqOut.push({ member: row.member, group: row.group, extra: true });
        }
        setPendingReqs(reqOut);

        const { data: myGroups } = await supabase.from('groups').select('*')
          .eq('admin_email', email).order('created_at', { ascending: false });
        const managedOut = [];
        for (const g of myGroups || []) {
          const { data: mems } = await supabase.from('members').select('*').eq('group_id', g.id).eq('status', 'approved');
          const { data: pays } = await supabase.from('payments').select('spots, weeks, status').eq('group_id', g.id);
          const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', g.id);
          remindRenewalIfSoon(supabase, g); // 🔔 admin gets a bell notification 7 days before the group plan renews
          managedOut.push({ group: g, members: mems || [], payments: pays || [], payouts: outs || [] });
        }
        setManaged(managedOut);
        setActiveTab(joinedOut.length > 0 ? 'joined' : 'browse');
      } catch (e) { console.log('Dashboard load:', e.message); }
      setLoading(false);
    })();
  }, [router]);

  // Lazy-load the browse-groups + people panels the first time they open
  useEffect(() => {
    if (activeTab !== 'browse' || liveGroups.length > 0) return;
    (async () => {
      try {
        const { supabase, getGroupAdminBadgeMap } = await import('@/lib/supabase');
        const [{ data: gs }, adminBadges] = await Promise.all([
          supabase.from('groups')
            .select('id, name, avatar_url, amount, frequency, frequency_days, max_members, admin_name, is_verified, badge_tier, created_at, is_frozen')
            .in('status', ['active', 'approved']).order('created_at', { ascending: false }).limit(30),
          getGroupAdminBadgeMap(),
        ]);
        setLiveGroups((gs || [])
          .filter(g => !g.is_frozen) // ❄️ frozen groups stay out of the browse list
          .map(g => ({ ...g, admin_is_verified: !!adminBadges[String(g.id)]?.admin_is_verified })));
        const counts = {};
        for (const g of gs || []) {
          const { data: mems } = await supabase.from('members').select('id').eq('group_id', g.id).eq('status', 'approved');
          counts[g.id] = (mems || []).length;
        }
        setGroupCounts(counts);
      } catch {}
    })();
  }, [activeTab, liveGroups.length]);

  if (!user) return null;
  if (loading) {
    return <LoadingScreen label="Loading your dashboard…" />;
  }

  const cancelMyRequest = async (item) => {
    if (!window.confirm(item.extra ? 'Cancel your extra-spot request?' : item.member?.status === 'spot_offered' ? 'Decline this spot offer?' : 'Cancel this join request?')) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const m = item.member;
      if (item.extra) {
        const { error } = await supabase.from('members').update({ extra_spots_request: null }).eq('id', m.id);
        if (error) throw error;
      } else if (m.status === 'spot_offered') {
        const { error } = await supabase.from('members').update({ status: 'declined', spots: '' }).eq('id', m.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('members').update({ status: 'cancelled' }).eq('id', m.id).eq('status', 'pending');
        if (error) throw error;
      }
      setPendingReqs(prev => prev.filter(x => !(x.member.id === m.id && !!x.extra === !!item.extra)));
      toast.success('Request cancelled.');
      try {
        await supabase.from('notifications').insert({
          id: `reqcancel-${Date.now()}`, type: 'request_cancelled', group_id: m.group_id, is_read: false,
          user_email: (item.group?.admin_email || '').toLowerCase() || null,
          message: `↩ ${(user.name || user.email)} cancelled a request on "${item.group?.name || m.group_id}".`,
        });
      } catch {}
    } catch (e) { toast.error(`Could not cancel: ${e.message || 'try again'}`); }
  };

  const isAdmin = managed.length > 0;

  // ---- derived rows for the due / cash panels ----
  const FAR_FUTURE = new Date(8640000000000000); // sorts pending rows to the bottom
  const dueRows = joined.map(({ group, payments, member, members }) => {
    if (!parseSpots(member.spots).length) return null;
    const cg = withRotationClock(group, members);
    if (!cg) return { groupName: group.name, pending: true, date: FAR_FUTURE }; // ⏳ starts when the group is full
    const d = nextDueForMember(cg, payments, parseSpots(member.spots), adminAutoSpots(cg, buildSpotMap(members)));
    return d ? { groupName: group.name, ...d } : null;
  }).filter(Boolean).sort((a, b) => a.date - b.date);
  const cashRows = joined.map(({ group, payouts, member, members }) => {
    if (!parseSpots(member.spots).length) return null;
    const cg = withRotationClock(group, members);
    if (!cg) return { groupName: group.name, pending: true, date: FAR_FUTURE };
    const d = nextCashOutForMember(cg, payouts, parseSpots(member.spots));
    return d ? { groupName: group.name, ...d } : null;
  }).filter(Boolean).sort((a, b) => (a.dueNow === b.dueNow ? a.date - b.date : a.dueNow ? -1 : 1));
  const payoutRows = managed.map(({ group, payouts, members }) => {
    const cg = withRotationClock(group, members);
    const d = cg ? nextPayoutForGroup(cg, payouts, buildSpotMap(members)) : null;
    return d ? { groupName: group.name, ...d } : null;
  }).filter(Boolean).sort((a, b) => (a.dueNow === b.dueNow ? a.date - b.date : a.dueNow ? -1 : 1));

  const searchPeople = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase.rpc('get_public_user_directory');
      if (error) throw error;
      const q = peopleQ.trim().toLowerCase();
      setPeople((data || []).filter(u => !q || (u.name || '').toLowerCase().includes(q) || String(u.id).toLowerCase().startsWith(q)));
      setPeopleSearched(true);
    } catch {}
  };

  const filteredGroups = liveGroups.filter(g => {
    const q = groupQ.trim().toLowerCase();
    if (!q) return true;
    return (g.name || '').toLowerCase().includes(q) || String(g.id).toLowerCase() === q || (g.admin_name || '').toLowerCase().includes(q);
  }).sort((a, b) => (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0));

  const Tab = ({ id, icon, label, badge }) => (
    <button
      onClick={() => setActiveTab(activeTab === id ? null : id)}
      className={`shrink-0 flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold border transition-all ${activeTab === id ? 'bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-200' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}
    >
      {icon}{label}{badge !== undefined && <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === id ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>{badge}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <BroadcastAlert />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-7">
        {/* Compact welcome */}
        <div className="flex items-center gap-3 mb-4">
          {account?.profile_pic
            ? <img src={account.profile_pic} alt="" className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />
            : <div className="w-11 h-11 bg-primary-100 rounded-xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold">{(account?.name || user.name || 'U').charAt(0).toUpperCase()}</span></div>}
          <h1 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-1.5 truncate">
            Welcome back, {(account?.name || user.name || 'there').split(' ')[0]} 👋
            {account?.is_verified && <HiBadgeCheck className="w-6 h-6 text-blue-500 shrink-0 badge-emboss" title="Verified by PayRound" />}
          </h1>
        </div>

        {/* ===== small clickable tabs (keep everything above the fold) ===== */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-1 -mx-1 px-1">
          <Tab id="joined" icon={<HiUserGroup className="w-4 h-4" />} label="Groups I Joined" badge={joined.length} />
          {isAdmin && <Tab id="manage" icon={<HiShieldCheck className="w-4 h-4" />} label="Groups I Manage" badge={managed.length} />}
          <Tab id="due" icon={<HiCalendar className="w-4 h-4" />} label="Next Payment Due" badge={dueRows[0] ? (dueRows[0].dueNow ? 'now' : fmtDate(dueRows[0].date)) : '—'} />
          <Tab id="cash" icon={<HiCash className="w-4 h-4" />} label={isAdmin ? 'Next Payout' : 'Next Cash Out'} badge={(isAdmin ? payoutRows : cashRows)[0] ? ((isAdmin ? payoutRows : cashRows)[0].dueNow ? 'now' : fmtDate((isAdmin ? payoutRows : cashRows)[0].date)) : '—'} />
          <Tab id="browse" icon={<HiSearch className="w-4 h-4" />} label="Browse Groups" />
          <Tab id="people" icon={<HiUsers className="w-4 h-4" />} label="Search Users" />
        </div>

        {/* ===== expandable tab panels ===== */}
        {activeTab === 'joined' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 max-h-[65vh] overflow-y-auto">
            {joined.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-3">You haven&apos;t joined any group yet.</p>
                <button onClick={() => setActiveTab('browse')} className="bg-primary-600 text-white text-xs font-semibold px-5 py-2 rounded-xl">Browse Groups</button>
              </div>
            ) : joined.map(({ group: g, member, members, payments, payouts }) => {
              const mySpots = parseSpots(member.spots);
              const cg = withRotationClock(g, members);
              const due = cg ? nextDueForMember(cg, payments, mySpots, adminAutoSpots(cg, buildSpotMap(members))) : null;
              const cash = cg ? nextCashOutForMember(cg, payouts, mySpots) : null;
              return (
                <button key={g.id} onClick={() => router.push(`/group-chat?group=${g.id}`)} className="w-full flex items-center gap-3 py-4 min-h-[136px] border-b border-gray-50 last:border-0 text-left hover:bg-gray-50/60 rounded-xl px-2 transition-colors">
                  {g.avatar_url
                    ? <img src={g.avatar_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-100 shrink-0" />
                    : <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-lg">{g.name?.charAt(0)}</span></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-gray-900 flex items-center gap-1 min-w-0">
                      <span className="truncate">{g.name}</span>
                      <GroupBadge verified={g.is_verified} tier={g.badge_tier} />
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{mySpots.length ? `My spot${mySpots.length > 1 ? 's' : ''}: #${mySpots.join(', #')} • ` : ''}₦{Number(g.amount || 0).toLocaleString()} {g.frequency || 'weekly'}</p>
                    <p className="text-xs mt-1">{!cg && mySpots.length > 0
                      ? <span className="text-gray-400">⏳ Savings start when the group is full — nothing due yet</span>
                      : <><span className={due?.dueNow ? 'text-amber-600 font-semibold' : 'text-gray-500'}>{due ? (due.dueNow ? 'Payment due now ⚠️' : `Next due ${fmtDate(due.date)}`) : 'No spot yet'}</span>{cash ? <span className={cash.dueNow ? 'text-emerald-600 font-semibold' : 'text-gray-500'}> • Cash out {cash.dueNow ? 'NOW 💰' : `${fmtDate(cash.date)} (#${cash.spot})`}</span> : null}</>}</p>
                  </div>
                  <span className="shrink-0 text-xl" title="Opens this group's chat">💬</span>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'manage' && isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 max-h-[65vh] overflow-y-auto">
            {managed.map(({ group: g, members, payments, payouts }) => {
              const N = cycleLength(g);
              const filled = members.reduce((sum, m) => sum + parseSpots(m.spots).length, 0);
              const cg = withRotationClock(g, members);
              const nextPay = cg ? nextPayoutForGroup(cg, payouts, buildSpotMap(members)) : null;
              const renewal = g.expiry_at ? new Date(g.expiry_at) : null;
              const renewalSoon = renewal && (renewal - Date.now()) < 7 * 86400000;
              return (
                <div key={g.id} className="py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    {g.avatar_url
                      ? <img src={g.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-gray-100 shrink-0" />
                      : <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0"><span className="text-purple-700 font-bold text-sm">{g.name?.charAt(0)}</span></div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1 min-w-0">
                        <span className="truncate">{g.name}</span>
                        <GroupBadge verified={g.is_verified} tier={g.badge_tier} />
                      </p>
                      <p className="text-[11px] text-gray-500">{members.length} members • {filled}/{N} spots{cg ? (nextPay ? ` • Payout ${nextPay.dueNow ? 'due now' : fmtDate(nextPay.date)} (#${nextPay.spot})` : '') : ' • ⏳ savings start when full'}</p>
                      <p className={`text-[11px] flex items-center gap-1 ${renewalSoon ? 'text-amber-600 font-semibold' : 'text-gray-500'}`}>
                        {renewalSoon && <HiExclamation className="w-3.5 h-3.5" />} Plan renewal: {renewal ? renewal.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => router.push(`/dashboard/admin/${g.id}/payments`)} className="bg-primary-600 text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg">Payments</button>
                      <button onClick={() => router.push(`/groups/${g.id}`)} className="border border-gray-200 text-gray-600 text-[10px] font-semibold px-3 py-1.5 rounded-lg">Open</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'due' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
            {dueRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No upcoming contributions — join a group first.</p>
              : dueRows.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-700 font-medium">{r.groupName}</span>
                  <span className={`text-xs font-semibold ${r.pending ? 'text-gray-400' : r.dueNow ? 'text-amber-600' : 'text-gray-600'}`}>{r.pending ? '⏳ starts when the group is full' : r.dueNow ? 'Due now ⚠️' : fmtDate(r.date)}</span>
                </div>
              ))}
          </div>
        )}

        {activeTab === 'cash' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
            {isAdmin && payoutRows.length > 0 && (
              <p className="text-[11px] font-semibold text-purple-600 mb-1 uppercase">Next payouts in my groups</p>
            )}
            {isAdmin && payoutRows.map((r, i) => (
              <div key={`p${i}`} className="flex items-center justify-between py-2.5 border-b border-gray-50 text-sm">
                <span className="text-gray-700 font-medium">{r.groupName} — spot #{r.spot}</span>
                <span className={`text-xs font-semibold ${r.dueNow ? 'text-amber-600' : 'text-gray-600'}`}>{r.dueNow ? 'Due now' : fmtDate(r.date)}</span>
              </div>
            ))}
            {cashRows.length > 0 && <p className={`text-[11px] font-semibold text-emerald-600 mb-1 uppercase ${isAdmin ? 'mt-3' : ''}`}>My next cash outs</p>}
            {cashRows.map((r, i) => (
              <div key={`c${i}`} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 text-sm">
                <span className="text-gray-700 font-medium">{r.groupName} — my spot #{r.spot}</span>
                <span className={`text-xs font-semibold ${r.pending ? 'text-gray-400' : r.dueNow ? 'text-emerald-600' : 'text-gray-600'}`}>{r.pending ? '⏳ starts when the group is full' : r.dueNow ? 'NOW 💰' : fmtDate(r.date)}</span>
              </div>
            ))}
            {payoutRows.length === 0 && cashRows.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nothing scheduled yet — payouts appear here once spots are assigned.</p>}
          </div>
        )}

        {activeTab === 'browse' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 max-h-[65vh] overflow-y-auto">
            <div className="relative mb-3">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={groupQ} onChange={e => setGroupQ(e.target.value)} placeholder="Search by group name, ID or admin…" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            {filteredGroups.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No live groups match.</p>
              : filteredGroups.map(g => (
                <button key={g.id} onClick={() => router.push(`/groups/${g.id}`)} className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50/60 rounded-xl px-2">
                  {g.avatar_url
                    ? <img src={g.avatar_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                    : <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-xs">{g.name?.charAt(0)}</span></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-1 min-w-0"><span className="truncate">{g.name}</span><GroupBadge verified={g.is_verified} tier={g.badge_tier} /></p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1 min-w-0">
                      <span className="truncate">₦{Number(g.amount || 0).toLocaleString()} {frequencyLabel(g).toLowerCase()} • {groupCounts[g.id] ?? '…'}{g.max_members ? `/${g.max_members}` : ''} members • by {g.admin_name || '—'}</span>
                      {g.admin_is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0" title="Verified account" />}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-primary-600 shrink-0">View & Join →</span>
                </button>
              ))}
          </div>
        )}

        {activeTab === 'people' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 max-h-[65vh] overflow-y-auto">
            <form onSubmit={e => { e.preventDefault(); searchPeople(); }} className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={peopleQ} onChange={e => setPeopleQ(e.target.value)} placeholder="Search users by name or unique ID…" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <button type="submit" className="bg-primary-600 text-white text-xs font-semibold px-4 rounded-xl">Search</button>
            </form>
            {!peopleSearched ? (
              <p className="text-sm text-gray-400 text-center py-4">Find any user — including group admins — and view their public profile.</p>
            ) : people.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No approved users match.</p>
            ) : people.map(u => (
              <button key={u.id} onClick={() => router.push(`/users/${u.id}`)} className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50/60 rounded-xl px-2">
                {u.profile_pic
                  ? <img src={u.profile_pic} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                  : <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-xs">{(u.name || 'U').charAt(0)}</span></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1 min-w-0"><span className="truncate">{u.name || '—'}</span>{u.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0 badge-emboss" />}</p>
                  <p className="text-[11px] text-gray-400 font-mono">ID: {String(u.id).slice(0, 8)}</p>
                </div>
                <span className="text-[11px] font-semibold text-primary-600 shrink-0">View →</span>
              </button>
            ))}
          </div>
        )}

        {/* ===== ADS — real approved ads, straight after the tabs ===== */}
        <div className="flex items-center justify-between mb-2 mt-1">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><HiPhotograph className="w-5 h-5 text-gold-500" /> Sponsored</h2>
          <button onClick={() => router.push('/ads')} className="text-[11px] font-medium text-primary-600">Advertise →</button>
        </div>
        {ads.length > 0 ? (
          <AdSlideshow ads={ads} className="mb-5" />
        ) : (
          <button onClick={() => router.push('/ads')} className="w-full bg-white rounded-2xl border border-dashed border-gray-200 p-5 text-center mb-5 hover:border-primary-300 transition-colors">
            <p className="text-xs font-semibold text-gray-500">Your business could be here 📣</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Tap to advertise to thousands of savers</p>
          </button>
        )}

        {/* ===== the only two actions below the ads ===== */}
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => router.push('/groups/create')} className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl px-3 py-2.5 flex items-center justify-center gap-1.5 shadow-md shadow-primary-200 transition-all">
            <HiPlusCircle className="w-5 h-5" /><span className="text-xs font-semibold">Create Group</span>
          </button>
          <button onClick={() => router.push('/groups/search')} className="bg-white hover:bg-primary-50 border-2 border-primary-300 text-primary-700 rounded-xl px-3 py-2.5 flex items-center justify-center gap-1.5 transition-all">
            <HiSearch className="w-5 h-5" /><span className="text-xs font-semibold">Join a Group</span>
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
