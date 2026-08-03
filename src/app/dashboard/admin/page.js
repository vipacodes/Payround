'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import {
  HiUserGroup, HiCurrencyDollar, HiCheckCircle,
  HiExclamation, HiClock, HiShieldCheck, HiBadgeCheck
} from 'react-icons/hi';
import { parseSpots, currentPeriod, cycleLength, paidWeeksForSpot , withRotationClock, buildSpotMap, adminAutoSpots, paidWeeksEffective } from '@/lib/payments';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminGroups, setAdminGroups] = useState([]); // [{ group, members, pendingJoins, pendingPayments, payments }]

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const email = (u.email || '').toLowerCase();
        const { data: gs } = await supabase.from('groups').select('*').eq('admin_email', email).order('created_at', { ascending: false });
        const enriched = [];
        for (const g of gs || []) {
          const { data: mems } = await supabase.from('members').select('*').eq('group_id', g.id).eq('status', 'approved');
          const { data: joins } = await supabase.from('members').select('id').eq('group_id', g.id).eq('status', 'pending');
          const { data: pays } = await supabase.from('payments').select('spots, weeks, status, amount').eq('group_id', g.id);
          const { data: pendPays } = await supabase.from('payments').select('id').eq('group_id', g.id).eq('status', 'pending');
          enriched.push({ group: g, members: mems || [], pendingJoins: (joins || []).length, pendingPayments: (pendPays || []).length, payments: pays || [] });
        }
        setAdminGroups(enriched);
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  if (!user || loading) {
    return <LoadingScreen label="Loading admin dashboard…" />;
  }

  if (adminGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiShieldCheck className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Admin Groups</h2>
          <p className="text-gray-500 mb-6">You don&apos;t have any groups where you are the admin.</p>
          <button
            onClick={() => router.push('/groups/create')}
            className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
          >
            Create a Group
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center shrink-0">
            <HiShieldCheck className="w-8 h-8 text-primary-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm">You admin {adminGroups.length} group{adminGroups.length > 1 ? 's' : ''} — approve members, review payment receipts and mark payouts.</p>
          </div>
        </div>

        {adminGroups.map(({ group: g, members, pendingJoins, pendingPayments, payments }) => {
          const N = cycleLength(g);
          const clockG = withRotationClock(g, members);
          const period = clockG ? Math.min(currentPeriod(clockG), N) : 0; // 0 = starts when the group is full
          const filledSpots = members.reduce((sum, m) => sum + parseSpots(m.spots).length, 0);
          const approvedPays = payments.filter(p => p.status === 'approved');
          const totalCollected = approvedPays.reduce((sum, p) => sum + Number(p.amount || 0), 0);
          const spotMapHere = buildSpotMap(members);
          const autoSpotsHere = adminAutoSpots(g, spotMapHere);
          const spotsCurrent = clockG ? Array.from({ length: N }, (_, i) => i + 1)
            .filter(spot => paidWeeksEffective(approvedPays, spot, autoSpotsHere, period) >= period).length : 0;
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  {g.avatar_url
                    ? <img src={g.avatar_url} alt={g.name} className="w-12 h-12 rounded-xl object-cover border shrink-0" />
                    : <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-lg">{g.name?.charAt(0)}</span></div>}
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                      <span className="truncate">{g.name}</span>
                      {g.is_verified && <HiBadgeCheck className="w-5 h-5 text-blue-500 shrink-0 badge-emboss" />}
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono">ID: {g.id}</p>
                    <p className="text-xs text-gray-500 mt-0.5">₦{Number(g.amount || 0).toLocaleString()} {g.frequency || 'weekly'} • {clockG ? `Period ${period} of ${N}` : '⏳ savings start when the group is full'} • Status: {g.status}</p>
                  </div>
                </div>
                {pendingPayments > 0 && (
                  <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full">🧾 {pendingPayments} receipt{pendingPayments > 1 ? 's' : ''} to review</span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <HiUserGroup className="w-4 h-4 text-primary-600 mb-1" />
                  <p className="text-lg font-bold text-gray-900">{members.length} <span className="text-xs font-normal text-gray-400">({filledSpots}/{N} spots)</span></p>
                  <p className="text-[11px] text-gray-500">Members</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <HiCheckCircle className="w-4 h-4 text-emerald-600 mb-1" />
                  <p className="text-lg font-bold text-emerald-700">{spotsCurrent}/{N}</p>
                  <p className="text-[11px] text-gray-500">Spots paid this period</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <HiExclamation className="w-4 h-4 text-red-500 mb-1" />
                  <p className="text-lg font-bold text-red-600">{pendingJoins}</p>
                  <p className="text-[11px] text-gray-500">Join requests</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <HiCurrencyDollar className="w-4 h-4 text-gold-600 mb-1" />
                  <p className="text-lg font-bold text-gray-900">₦{totalCollected.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-500">Approved contributions</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => router.push(`/dashboard/admin/${g.id}/members`)} className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all">
                  Members{pendingJoins > 0 ? ` (${pendingJoins})` : ''}
                </button>
                <button onClick={() => router.push(`/dashboard/admin/${g.id}/payments`)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-all">
                  Payments{pendingPayments > 0 ? ` (${pendingPayments})` : ''}
                </button>
                <button onClick={() => router.push(`/groups/${g.id}`)} className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold py-2.5 rounded-xl transition-all">
                  Group Page
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Footer />
    </div>
  );
}
