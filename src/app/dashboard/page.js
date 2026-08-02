'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BroadcastAlert from '@/components/BroadcastAlert';
import {
  HiUserGroup, HiCurrencyDollar, HiCalendar, HiClipboardList,
  HiCheckCircle, HiClock, HiBadgeCheck, HiArrowRight, HiShieldCheck,
  HiGift, HiSearch, HiPlusCircle, HiExclamation, HiCash
} from 'react-icons/hi';
import {
  parseSpots, currentPeriod, cycleLength, periodLabel,
  buildSpotMap, nextDueForMember, nextCashOutForMember, nextPayoutForGroup
} from '@/lib/payments';

const badgeEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState([]);   // [{ group, member, payments, payouts }]
  const [managed, setManaged] = useState([]); // [{ group, members, payments, payouts }]

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    let parsed;
    try { parsed = JSON.parse(stored); } catch { router.push('/login'); return; }
    setUser(parsed);
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const email = (parsed.email || '').toLowerCase();

        const { data: acc } = await supabase
          .from('users').select('name, is_verified, is_approved, approval_status, profile_pic')
          .eq('email', email).single();
        if (acc) setAccount(acc);

        // --- Groups I JOINED (approved membership rows) ---
        const { data: mine } = await supabase
          .from('members').select('*')
          .eq('member_email', email).eq('status', 'approved');
        const joinedOut = [];
        for (const m of mine || []) {
          const { data: g } = await supabase.from('groups').select('*').eq('id', m.group_id).single();
          if (!g) continue;
          const { data: pays } = await supabase.from('payments').select('*').eq('group_id', m.group_id);
          const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', m.group_id);
          joinedOut.push({ group: g, member: m, payments: pays || [], payouts: outs || [] });
        }
        setJoined(joinedOut);

        // --- Groups I MANAGE (I am the admin) ---
        const { data: myGroups } = await supabase
          .from('groups').select('*').eq('admin_email', email).order('created_at', { ascending: false });
        const managedOut = [];
        for (const g of myGroups || []) {
          const { data: mems } = await supabase.from('members').select('*').eq('group_id', g.id).eq('status', 'approved');
          const { data: pays } = await supabase.from('payments').select('spots, weeks, status').eq('group_id', g.id);
          const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', g.id);
          managedOut.push({ group: g, members: mems || [], payments: pays || [], payouts: outs || [] });
        }
        setManaged(managedOut);
      } catch (e) { console.log('Dashboard load:', e.message); }
      setLoading(false);
    })();
  }, [router]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const isAdmin = managed.length > 0;

  // Next payment due — earliest across my joined groups (own contributions),
  // or across managed groups when the user only manages
  const dues = joined
    .map(({ group, payments, member }) => {
      const spots = parseSpots(member.spots);
      const d = nextDueForMember(group, payments, spots);
      return d ? { ...d, groupName: group.name } : null;
    })
    .filter(Boolean);
  if (dues.length === 0 && isAdmin) {
    managed.forEach(({ group, payments, members }) => {
      const period = currentPeriod(group);
      const anyOwed = members.some(m => parseSpots(m.spots).length > 0);
      if (!anyOwed) return;
      const start = new Date(group.start_date || group.created_at || Date.now()).getTime();
      const pms = (String(group.frequency || 'weekly').toLowerCase().includes('month') ? 30 : String(group.frequency || '').toLowerCase().includes('bi') ? 14 : 7) * 86400000;
      dues.push({ date: new Date(start + period * pms), dueNow: false, groupName: group.name });
    });
  }
  dues.sort((a, b) => a.date - b.date);
  const nextDue = dues[0] || null;

  // Next cash out (member) / next payout (admin)
  const cashOuts = joined
    .map(({ group, payouts, member }) => {
      const d = nextCashOutForMember(group, payouts, parseSpots(member.spots));
      return d ? { ...d, groupName: group.name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.dueNow === b.dueNow ? a.date - b.date : a.dueNow ? -1 : 1));
  const payoutsNext = managed
    .map(({ group, payouts, members }) => {
      const d = nextPayoutForGroup(group, payouts, buildSpotMap(members));
      return d ? { ...d, groupName: group.name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.dueNow === b.dueNow ? a.date - b.date : a.dueNow ? -1 : 1));
  const cashOrPayout = isAdmin ? (payoutsNext[0] || cashOuts[0] || null) : (cashOuts[0] || null);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <BroadcastAlert />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Welcome */}
        <div className="flex items-center gap-4 mb-6">
          {account?.profile_pic
            ? <img src={account.profile_pic} alt="" className="w-14 h-14 rounded-2xl object-cover border border-gray-100 shrink-0" />
            : <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-xl">{(account?.name || user.name || 'U').charAt(0).toUpperCase()}</span></div>}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2 truncate">
              Welcome back, {(account?.name || user.name || 'there').split(' ')[0]} 👋
              {account?.is_verified && <HiBadgeCheck className="w-7 h-7 text-blue-500 drop-shadow shrink-0" title="Verified by PayRound" />}
            </h1>
            <p className="text-sm text-gray-500">Here&apos;s what&apos;s happening with your savings groups.</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <HiUserGroup className="w-5 h-5 text-primary-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{joined.length}</p>
            <p className="text-xs text-gray-500">Groups I Joined</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <HiShieldCheck className="w-5 h-5 text-purple-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{managed.length}</p>
            <p className="text-xs text-gray-500">Groups I Manage</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <HiCalendar className="w-5 h-5 text-amber-500 mb-2" />
            <p className="text-sm font-bold text-gray-900 leading-tight min-h-[2rem]">
              {nextDue ? (nextDue.dueNow ? `Due now` : fmtDate(nextDue.date)) : '—'}
            </p>
            <p className="text-xs text-gray-500">Next Payment Due{nextDue ? ` • ${nextDue.groupName}` : ''}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <HiCash className="w-5 h-5 text-emerald-600 mb-2" />
            <p className="text-sm font-bold text-gray-900 leading-tight min-h-[2rem]">
              {cashOrPayout ? (cashOrPayout.dueNow ? `Now (spot #${cashOrPayout.spot})` : `${fmtDate(cashOrPayout.date)} (spot #${cashOrPayout.spot})`) : '—'}
            </p>
            <p className="text-xs text-gray-500">{isAdmin ? 'Next Payout' : 'Next Cash Out'}{cashOrPayout ? ` • ${cashOrPayout.groupName}` : ''}</p>
          </div>
        </div>

        {/* ============ GROUPS I JOINED (members AND admins) ============ */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><HiUserGroup className="w-5 h-5 text-primary-600" /> Groups I Joined</h2>
          <button onClick={() => router.push('/groups/search')} className="text-xs font-medium text-primary-600 flex items-center gap-1 hover:text-primary-700"><HiSearch className="w-4 h-4" /> Find groups</button>
        </div>
        {joined.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center mb-8">
            <HiUserGroup className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-4">You haven&apos;t joined any group yet. Real, approved groups only.</p>
            <button onClick={() => router.push('/groups/search')} className="bg-primary-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-primary-700">Browse Groups</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {joined.map(({ group: g, member, payments, payouts }) => {
              const mySpots = parseSpots(member.spots);
              const due = nextDueForMember(g, payments, mySpots);
              const cash = nextCashOutForMember(g, payouts, mySpots);
              return (
                <button key={g.id} onClick={() => router.push(`/groups/${g.id}`)} className="bg-white rounded-2xl border border-gray-100 p-5 text-left card-hover">
                  <div className="flex items-center gap-3 mb-3">
                    {g.avatar_url
                      ? <img src={g.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />
                      : <div className="w-11 h-11 bg-primary-100 rounded-xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold">{g.name?.charAt(0)}</span></div>}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{g.name}</span>
                        {g.is_verified && <HiBadgeCheck className="w-5 h-5 text-blue-500 shrink-0" />}
                        {g.badge_tier && <span className="text-[11px]">{badgeEmoji[g.badge_tier]}</span>}
                      </p>
                      <p className="text-xs text-gray-500">₦{Number(g.amount || 0).toLocaleString()} {g.frequency || 'weekly'}{mySpots.length ? ` • My spot${mySpots.length > 1 ? 's' : ''}: #${mySpots.join(', #')}` : ''}</p>
                    </div>
                    <HiArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-400 mb-0.5">Next payment due</p>
                      <p className={`font-semibold ${due?.dueNow ? 'text-amber-600' : 'text-gray-800'}`}>{due ? (due.dueNow ? 'Due now ⚠️' : fmtDate(due.date)) : 'No spot yet'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-400 mb-0.5">Next cash out</p>
                      <p className={`font-semibold ${cash?.dueNow ? 'text-emerald-600' : 'text-gray-800'}`}>{cash ? (cash.dueNow ? `Now — spot #${cash.spot} 💰` : `${fmtDate(cash.date)} — #${cash.spot}`) : 'All collected 🎉'}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ============ GROUPS I MANAGE (group admins only) ============ */}
        {isAdmin && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><HiShieldCheck className="w-5 h-5 text-purple-600" /> Groups I Manage</h2>
              <button onClick={() => router.push('/dashboard/admin')} className="text-xs font-medium text-primary-600 flex items-center gap-1 hover:text-primary-700"><HiClipboardList className="w-4 h-4" /> Admin dashboard</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {managed.map(({ group: g, members, payments, payouts }) => {
                const N = cycleLength(g);
                const filled = members.reduce((sum, m) => sum + parseSpots(m.spots).length, 0);
                const nextPay = nextPayoutForGroup(g, payouts, buildSpotMap(members));
                const renewal = g.expiry_at ? new Date(g.expiry_at) : null;
                const renewalSoon = renewal && (renewal - Date.now()) < 7 * 86400000;
                return (
                  <div key={g.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      {g.avatar_url
                        ? <img src={g.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />
                        : <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center shrink-0"><span className="text-purple-700 font-bold">{g.name?.charAt(0)}</span></div>}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{g.name}</span>
                          {g.is_verified && <HiBadgeCheck className="w-5 h-5 text-blue-500 shrink-0" />}
                        </p>
                        <p className="text-xs text-gray-500">{members.length} member{members.length === 1 ? '' : 's'} • {filled}/{N} spots filled</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs mb-4">
                      <div className="flex justify-between bg-gray-50 rounded-lg p-2.5">
                        <span className="text-gray-400">Next payout</span>
                        <span className={`font-semibold ${nextPay?.dueNow ? 'text-amber-600' : 'text-gray-800'}`}>{nextPay ? (nextPay.dueNow ? `Now — spot #${nextPay.spot}` : `${fmtDate(nextPay.date)} — #${nextPay.spot}`) : 'All collected 🎉'}</span>
                      </div>
                      <div className={`flex justify-between rounded-lg p-2.5 ${renewalSoon ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                        <span className="text-gray-400 flex items-center gap-1">{renewalSoon && <HiExclamation className="w-3.5 h-3.5 text-amber-500" />} Group plan renewal</span>
                        <span className={`font-semibold ${renewalSoon ? 'text-amber-700' : 'text-gray-800'}`}>{renewal ? fmtDate(renewal) : '—'}{renewalSoon ? ' — renew soon!' : ''}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => router.push(`/dashboard/admin/${g.id}/payments`)} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all">Review Payments</button>
                      <button onClick={() => router.push(`/groups/${g.id}`)} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-all">Open Group</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => router.push('/groups/search')} className="bg-white rounded-2xl border border-gray-100 p-4 card-hover flex flex-col items-center gap-1.5 text-center">
            <HiSearch className="w-5 h-5 text-primary-600" /><span className="text-xs font-medium text-gray-700">Find Groups</span>
          </button>
          <button onClick={() => router.push('/groups/create')} className="bg-white rounded-2xl border border-gray-100 p-4 card-hover flex flex-col items-center gap-1.5 text-center">
            <HiPlusCircle className="w-5 h-5 text-primary-600" /><span className="text-xs font-medium text-gray-700">Create Group</span>
          </button>
          <button onClick={() => router.push('/notifications')} className="bg-white rounded-2xl border border-gray-100 p-4 card-hover flex flex-col items-center gap-1.5 text-center">
            <HiClock className="w-5 h-5 text-primary-600" /><span className="text-xs font-medium text-gray-700">Notifications</span>
          </button>
          <button onClick={() => router.push('/profile')} className="bg-white rounded-2xl border border-gray-100 p-4 card-hover flex flex-col items-center gap-1.5 text-center">
            <HiGift className="w-5 h-5 text-primary-600" /><span className="text-xs font-medium text-gray-700">My Profile</span>
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
