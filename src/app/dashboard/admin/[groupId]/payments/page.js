'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import ImageLightbox from '@/components/ImageLightbox';
import {
  HiArrowLeft, HiCheckCircle, HiClock, HiExclamation,
  HiCheck, HiPhotograph, HiCurrencyDollar, HiRefresh
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  parseSpots, currentPeriod, cycleLength, periodLabel, withRotationClock,
  paidWeeksForSpot, isSpotCurrent, buildSpotMap, payoutForSpot
} from '@/lib/payments';

export default function AdminPaymentsPage() {
  const router = useRouter();
  const params = useParams();
  const [me, setMe] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [zoomImg, setZoomImg] = useState(null);
  const [declineId, setDeclineId] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: g } = await supabase.from('groups').select('*').eq('id', params.groupId).single();
      if (!g) { setNotFound(true); setLoading(false); return; }
      setGroup(g);
      const { data: mems } = await supabase.from('members').select('*').eq('group_id', params.groupId).eq('status', 'approved');
      setMembers(mems || []);
      const { data: pays } = await supabase.from('payments').select('*').eq('group_id', params.groupId).order('created_at', { ascending: false });
      setPayments(pays || []);
      const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', params.groupId).order('created_at', { ascending: false });
      setPayouts(outs || []);
    } catch { setNotFound(true); }
    setLoading(false);
  };

  useEffect(() => {
    const s = localStorage.getItem('payround_user');
    let u = null;
    if (s) { try { u = JSON.parse(s); } catch {} }
    setMe(u);
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.groupId]);

  const isAdmin = me?.email && group?.admin_email && me.email.toLowerCase() === group.admin_email.toLowerCase();

  const notify = async ({ user_email, type, message }) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('notifications').insert({
        id: `${type}-${Date.now()}`, type, group_id: params.groupId, is_read: false, user_email, message,
      });
    } catch {}
  };

  // APPROVE — marks the member paid for the selected spots x weeks
  const handleApprove = async (p) => {
    setBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('payments').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', p.id);
      if (error) throw error;
      await notify({
        user_email: p.user_email, type: 'payment_approved',
        message: `✅ Your payment of ₦${Number(p.amount || 0).toLocaleString()} in "${group.name}" was approved — spot${parseSpots(p.spots).length > 1 ? 's' : ''} #${parseSpots(p.spots).join(', #')} marked paid for ${p.weeks} ${periodLabel(group.frequency)}${p.weeks > 1 ? 's' : ''}. 🎉`,
      });
      toast.success(`${p.member_name || p.user_email} marked paid (spot(s) ${p.spots}, ${p.weeks} week(s)).`);
      await loadAll();
    } catch (e) { toast.error('Could not approve payment.'); }
    setBusy(false);
  };

  // DECLINE — does NOT mark paid; member gets notified, with the admin's reason if given
  const handleDecline = async (p) => {
    setBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const reason = declineReason.trim();
      const { error } = await supabase.from('payments').update({
        status: 'declined', decline_reason: reason || null, reviewed_at: new Date().toISOString(),
      }).eq('id', p.id);
      if (error) throw error;
      await notify({
        user_email: p.user_email, type: 'payment_declined',
        message: `⚠️ Your payment of ₦${Number(p.amount || 0).toLocaleString()} in "${group.name}" was declined — it has NOT been marked paid.${reason ? ` Reason from admin: "${reason}".` : ''} Please upload a clearer/valid receipt.`,
      });
      toast.success('Payment declined — the member has been notified.');
      setDeclineId(null); setDeclineReason('');
      await loadAll();
    } catch (e) { toast.error('Could not decline payment.'); }
    setBusy(false);
  };

  // Mark a spot's payout as COLLECTED — visible to everyone in the group
  const handleMarkCollected = async (spot, holder) => {
    setBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const activeSpots = members.reduce((sum, m) => sum + parseSpots(m.spots).length, 0);
      const potAmount = (group.amount || 0) * Math.max(1, activeSpots);
      const { error } = await supabase.from('payouts').insert({
        id: `po-${Date.now()}`, group_id: params.groupId, spot,
        user_email: holder?.member_email || '', member_name: holder?.member_name || '',
        amount: potAmount, week: spot, status: 'collected',
      });
      if (error) throw error;
      if (holder?.member_email) {
        await notify({
          user_email: holder.member_email, type: 'payout_collected',
          message: `💰 Your payout for spot #${spot} in "${group.name}" (₦${potAmount.toLocaleString()}) is marked COLLECTED — it now shows on the group board for all members. 🎉`,
        });
      }
      toast.success(`Spot #${spot} payout marked collected — visible to all members.`);
      await loadAll();
    } catch (e) { toast.error('Could not mark payout.'); }
    setBusy(false);
  };

  if (loading) {
    return <LoadingScreen label="Loading payments…" />;
  }

  if (notFound || !group) {
    return (
      <div className="min-h-screen bg-gray-50"><Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Group not found.</div>
        <Footer />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50"><Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <HiExclamation className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Admin Only</h2>
          <p className="text-sm text-gray-500 mb-4">Only the admin of "{group.name}" can review payments and mark payouts.</p>
          <button onClick={() => router.push(`/groups/${params.groupId}`)} className="bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl">Back to Group</button>
        </div>
        <Footer />
      </div>
    );
  }

  const clockGroup = withRotationClock(group, members);
  const period = clockGroup ? currentPeriod(clockGroup) : 0; // 0 = savings haven't started (group not full yet)
  const N = cycleLength(group);
  const spotMap = buildSpotMap(members);
  const label = periodLabel(group.frequency);
  const pending = payments.filter(p => p.status === 'pending');
  const history = payments.filter(p => p.status !== 'pending');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      {zoomImg && <ImageLightbox src={zoomImg} alt="Receipt" onClose={() => setZoomImg(null)} />}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button onClick={() => router.push('/dashboard/admin')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back to Admin Dashboard
        </button>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payments — {group.name}</h1>
            <p className="text-sm text-gray-500">
              ₦{Number(group.amount || 0).toLocaleString()} per {label} per spot • Cycle: {N} {label}s • {clockGroup ? <>Current {label}: <strong>{Math.min(period, N)} of {N}</strong></> : <span className="text-amber-600 font-semibold">⏳ savings start when the group is full</span>}
            </p>
          </div>
          <button onClick={() => { setLoading(true); loadAll(); }} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 border rounded-lg px-3 py-2 hover:bg-gray-50">
            <HiRefresh className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* ===== 1. PENDING RECEIPTS ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            Receipts Waiting for Review
            {pending.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{pending.length}</span>}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Approving marks the member paid for the chosen spots and week(s). Declining does NOT mark them paid — add a reason so they know what to fix.
          </p>
          {pending.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-xl">No receipts waiting — all caught up ✅</div>
          ) : pending.map(p => (
            <div key={p.id} className="border border-gray-100 rounded-xl p-4 mb-3 last:mb-0">
              <div className="flex gap-4">
                <button onClick={() => setZoomImg(p.receipt_url)} className="shrink-0 group relative" title="Tap to expand receipt">
                  {p.receipt_url
                    ? <img src={p.receipt_url} alt="receipt" className="w-20 h-20 rounded-xl object-cover border" />
                    : <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center"><HiPhotograph className="w-8 h-8 text-gray-300" /></div>}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-xl transition-all flex items-center justify-center text-white text-[10px] opacity-0 group-hover:opacity-100">Expand</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{p.member_name || '—'}</div>
                  <div className="text-xs text-gray-500 mb-1">{p.user_email}</div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">Spot{parseSpots(p.spots).length > 1 ? 's' : ''} #{parseSpots(p.spots).join(', #')}</span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{p.weeks} {label}{p.weeks > 1 ? 's' : ''}{p.weeks > 1 ? ' (paid upfront)' : ''}</span>
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">₦{Number(p.amount || 0).toLocaleString()}</span>
                    <span className="text-gray-400 px-1 py-0.5">{p.created_at ? new Date(p.created_at).toLocaleString() : ''}</span>
                  </div>
                  {declineId === p.id ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        value={declineReason}
                        onChange={e => setDeclineReason(e.target.value)}
                        placeholder="Reason shown to the member (optional) e.g. receipt blurry / wrong amount"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
                      />
                      <div className="flex gap-2">
                        <button disabled={busy} onClick={() => handleDecline(p)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">Confirm Decline</button>
                        <button disabled={busy} onClick={() => { setDeclineId(null); setDeclineReason(''); }} className="border px-3 py-1.5 rounded-lg text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button disabled={busy} onClick={() => handleApprove(p)} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                        <HiCheck className="w-3.5 h-3.5" /> Approve — Mark Paid
                      </button>
                      <button disabled={busy} onClick={() => { setDeclineId(p.id); setDeclineReason(''); }} className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== 2. ROTATION & PAYOUT BOARD ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><HiCurrencyDollar className="w-5 h-5 text-primary-600" /> Rotation & Payout Board</h2>
          <p className="text-xs text-gray-500 mb-4">
            Spot #k collects the pot at {label} k. When a payout is sent, mark it collected — it becomes visible to everyone in the group.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 border-b">
                  <th className="py-2 pr-3 font-semibold">Spot</th>
                  <th className="py-2 pr-3 font-semibold">Holder</th>
                  <th className="py-2 pr-3 font-semibold">Paid {label}s</th>
                  <th className="py-2 pr-3 font-semibold">This {label}</th>
                  <th className="py-2 font-semibold">Payout (due {label} #spot)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: N }, (_, i) => i + 1).map(spot => {
                  const holder = spotMap[spot];
                  const paid = paidWeeksForSpot(payments, spot);
                  const collected = payoutForSpot(payouts, spot);
                  const dueNow = !collected && period >= spot;
                  return (
                    <tr key={spot} className={`border-b border-gray-50 ${dueNow ? 'bg-amber-50/50' : ''}`}>
                      <td className="py-2.5 pr-3 font-bold text-gray-900">#{spot}</td>
                      <td className="py-2.5 pr-3">
                        {holder ? (
                          <span className="text-gray-800">{holder.member_name || holder.member_email}</span>
                        ) : <span className="text-gray-300">Open spot</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600">{paid}/{N}</td>
                      <td className="py-2.5 pr-3">
                        {holder
                          ? (!clockGroup
                              ? <span className="text-gray-400 text-xs">⏳ soon</span>
                              : isSpotCurrent(paid, Math.min(period, N))
                                ? <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><HiCheckCircle className="w-4 h-4" /> Paid</span>
                                : <span className="text-amber-600 text-xs font-semibold flex items-center gap-1"><HiClock className="w-4 h-4" /> Due</span>)
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2.5">
                        {collected ? (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-semibold">💰 Collected {new Date(collected.created_at).toLocaleDateString()}</span>
                        ) : dueNow && holder ? (
                          <button disabled={busy} onClick={() => handleMarkCollected(spot, holder)} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50">
                            Mark ₦{((group.amount || 0) * Math.max(1, members.reduce((sum, m) => sum + parseSpots(m.spots).length, 0))).toLocaleString()} Collected
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">Upcoming</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== 3. HISTORY ===== */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-3">Payment History</h2>
          {history.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-xl">Nothing reviewed yet.</div>
          ) : history.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{p.member_name || p.user_email} — spot(s) #{parseSpots(p.spots).join(', #')}, {p.weeks} {label}{p.weeks > 1 ? 's' : ''}</div>
                <div className="text-[11px] text-gray-400">
                  ₦{Number(p.amount || 0).toLocaleString()} • reviewed {p.reviewed_at ? new Date(p.reviewed_at).toLocaleString() : ''}
                  {p.status === 'declined' && p.decline_reason ? ` • Reason: ${p.decline_reason}` : ''}
                </div>
              </div>
              {p.status === 'approved'
                ? <span className="shrink-0 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><HiCheckCircle className="w-3.5 h-3.5" /> Approved</span>
                : <span className="shrink-0 text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"><HiExclamation className="w-3.5 h-3.5" /> Declined</span>}
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}
