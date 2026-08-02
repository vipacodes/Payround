'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  HiUserGroup, HiCalendar, HiCurrencyDollar,
  HiUser, HiCheckCircle, HiClock, HiBadgeCheck, HiArrowLeft,
  HiPhotograph, HiUpload, HiExclamation
} from 'react-icons/hi';
import ImageLightbox from '@/components/ImageLightbox';
import { parseSpots, formatSpots, currentPeriod, cycleLength, periodLabel, paidWeeksForSpot, isSpotCurrent, buildSpotMap, payoutForSpot } from '@/lib/payments';
import { compressImage } from '@/lib/image';
import toast from 'react-hot-toast';

const badgeEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇' };

export default function GroupDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  const [adminProfile, setAdminProfile] = useState(null); // the admin's public user profile (for follow button)
  const [myStatus, setMyStatus] = useState(null); // null | 'pending' | 'approved'
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [myMember, setMyMember] = useState(null);
  const [paySpots, setPaySpots] = useState([]);     // selected spots for the receipt
  const [payWeeks, setPayWeeks] = useState(1);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptName, setReceiptName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [zoomImg, setZoomImg] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = localStorage.getItem('payround_user');
      let user = null;
      if (stored) { try { user = JSON.parse(stored); } catch {} }
      if (user?.email && mounted) setMe(user);
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: g, error } = await supabase.from('groups').select('*').eq('id', params.id).single();
        if (!mounted) return;
        if (error || !g) { setNotFound(true); setLoading(false); return; }
        setGroup(g);

        const { data: mems } = await supabase.from('members').select('*').eq('group_id', params.id).eq('status', 'approved');
        if (mounted) { setMemberCount((mems || []).length); setMembers(mems || []); }

        const { data: pays } = await supabase.from('payments').select('*').eq('group_id', params.id).order('created_at', { ascending: false });
        if (mounted) setPayments(pays || []);
        const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', params.id);
        if (mounted) setPayouts(outs || []);

        // Group admin's public profile — so members can open it and tap Follow
        if (g.admin_email) {
          const { data: adm } = await supabase.from('users').select('id').eq('email', g.admin_email.toLowerCase()).single();
          if (mounted && adm) setAdminProfile(adm);
        }

        if (user?.email) {
          const email = user.email.toLowerCase();
          const mine = (mems || []).find(m => (m.member_email || '').toLowerCase() === email);
          const { data: pendingMine } = await supabase
            .from('members').select('status')
            .eq('group_id', params.id).eq('member_email', email)
            .eq('status', 'pending');
          if (mounted) {
            if (mine) {
              setMyStatus('approved');
              setMyMember(mine);
              setPaySpots(parseSpots(mine.spots)); // pre-select all my spots
            } else if (pendingMine && pendingMine.length > 0) setMyStatus('pending');
          }
        }
      } catch (e) {
        if (mounted) setNotFound(true);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (notFound || !group) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiUserGroup className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Group Not Found</h2>
            <p className="text-gray-500 mb-4">The group you&apos;re looking for doesn&apos;t exist.</p>
            <button
              onClick={() => router.push('/groups/search')}
              className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
            >
              Browse Groups
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const isLive = ['active', 'approved'].includes(group.status);
  const joinPath = `/groups/${group.id}/join`;

  const handleJoin = () => {
    if (!me) {
      // Never force account creation — offer login (existing users) or signup (new users)
      router.push(`/login?redirect=${encodeURIComponent(joinPath)}`);
      return;
    }
    router.push(joinPath);
  };

  const isAdmin = me?.email && group.admin_email && me.email.toLowerCase() === group.admin_email.toLowerCase();
  const renewal = group.expiry_at ? new Date(group.expiry_at) : null;
  const renewalSoon = renewal && (renewal.getTime() - Date.now()) < 7 * 86400000;
  const renewalPassed = renewal && renewal.getTime() <= Date.now();
  const isMember = myStatus === 'approved' || isAdmin;
  const period = currentPeriod(group);
  const N = cycleLength(group);
  const label = periodLabel(group.frequency);
  const spotMap = buildSpotMap(members);
  const mySpots = myMember ? parseSpots(myMember.spots) : [];
  const myPayments = me?.email ? payments.filter(p => (p.user_email || '').toLowerCase() === me.email.toLowerCase()) : [];
  const receiptAmount = (group.amount || 0) * Math.max(1, paySpots.length) * payWeeks;

  const onReceiptPicked = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 800, 0.82);
      setReceiptData(dataUrl);
      setReceiptName(file.name);
    } catch { toast.error('Could not read that image — try another.'); }
  };

  const submitReceipt = async () => {
    if (paySpots.length === 0) { toast.error('Select at least one spot you are paying for.'); return; }
    if (!receiptData) { toast.error('Please upload your payment receipt image.'); return; }
    setUploading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const row = {
        id: `pay-${Date.now()}`,
        group_id: params.id,
        member_id: myMember?.id || null,
        user_email: me.email.toLowerCase(),
        member_name: myMember?.member_name || me.name || '',
        spots: formatSpots(paySpots),
        weeks: payWeeks,
        amount: receiptAmount,
        receipt_url: receiptData,
        status: 'pending',
      };
      const { error } = await supabase.from('payments').insert(row);
      if (error) throw error;
      await supabase.from('notifications').insert({
        id: `paynew-${Date.now()}`, type: 'payment_submitted', group_id: params.id, is_read: false,
        user_email: (group.admin_email || '').toLowerCase(),
        message: `🧾 ${row.member_name || row.user_email} uploaded a receipt for spot${paySpots.length > 1 ? 's' : ''} #${paySpots.join(', #')} (${payWeeks} ${label}${payWeeks > 1 ? 's' : ''}, ₦${receiptAmount.toLocaleString()}) in "${group.name}" — review and approve/decline in Payments.`,
      });
      setPayments([row, ...payments]);
      setReceiptData(null); setReceiptName(''); setPayWeeks(1);
      toast.success('Receipt sent! The admin will review it shortly — you will be notified.');
    } catch (e) { toast.error(`Upload failed: ${e.message || 'try again'}`); }
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <div className="flex items-start gap-4">
            {group.avatar_url
              ? <img src={group.avatar_url} alt={group.name} className="w-16 h-16 rounded-2xl object-cover border border-gray-100 shrink-0" />
              : <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-50 rounded-2xl flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold text-2xl">{group.name.charAt(0)}</span></div>}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                {group.name}
                {group.is_verified && <HiBadgeCheck className="w-6 h-6 text-blue-500 drop-shadow-md shrink-0" title="Verified by PayRound" />}
                {group.badge_tier && <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{badgeEmoji[group.badge_tier] || ''} {group.badge_tier}</span>}
              </h1>
              <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {group.id}</p>
              <p className="text-sm text-gray-600 mt-2">{group.description || 'Ajo savings group on PayRound.'}</p>
            </div>
          </div>

          {!isLive && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
              <HiClock className="w-4 h-4 shrink-0" /> This group is still under PayRound review — joining opens once it goes live.
            </div>
          )}
        </div>

        {/* Real stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiCurrencyDollar className="w-4 h-4 text-primary-500" /> Contribution</div>
            <p className="text-lg font-bold text-gray-900">₦{Number(group.amount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiCalendar className="w-4 h-4 text-primary-500" /> Frequency</div>
            <p className="text-lg font-bold text-gray-900">{group.frequency || 'Weekly'}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiUserGroup className="w-4 h-4 text-primary-500" /> Members</div>
            <p className="text-lg font-bold text-gray-900">{memberCount}{group.max_members ? ` / ${group.max_members}` : ''}</p>
          </div>
          <button
            onClick={() => adminProfile && router.push(`/users/${adminProfile.id}`)}
            title={adminProfile ? 'View admin profile — tap Follow there' : 'Group admin'}
            className={`bg-white rounded-2xl border border-gray-100 p-4 text-left ${adminProfile ? 'card-hover cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiUser className="w-4 h-4 text-primary-500" /> Group Admin {adminProfile && <span className="text-[10px] text-primary-600 font-semibold">• View profile</span>}</div>
            <p className="text-lg font-bold text-gray-900 truncate">{group.admin_name || '—'}</p>
          </button>
        </div>

        {/* Group plan renewal — admins need to see when their group subscription renews */}
        {isAdmin && renewal && (
          <div className={`rounded-2xl border p-4 mb-6 flex items-center gap-3 ${renewalPassed ? 'bg-red-50 border-red-200' : renewalSoon ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <HiCalendar className={`w-5 h-5 shrink-0 ${renewalPassed ? 'text-red-500' : renewalSoon ? 'text-amber-500' : 'text-emerald-600'}`} />
            <p className="text-xs">
              <span className={`font-semibold ${renewalPassed ? 'text-red-700' : renewalSoon ? 'text-amber-700' : 'text-emerald-700'}`}>
                {renewalPassed ? 'Group plan has expired' : `Next group payment (plan renewal) due ${renewal.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`}
              </span>
              <span className="text-gray-500"> — pay via Palmpay 9151723199 (Basikoro James Okeroghene) and create a renewal receipt through PayRound to extend your plan.</span>
            </p>
          </div>
        )}

        {/* Join CTA — respects account & membership state */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          {myStatus === 'approved' ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-emerald-700 flex items-center gap-2"><HiCheckCircle className="w-5 h-5" /> You&apos;re a member of this group</p>
              <button onClick={() => router.push('/dashboard')} className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all">Open Dashboard</button>
            </div>
          ) : myStatus === 'pending' ? (
            <p className="text-sm font-medium text-amber-700 flex items-center gap-2"><HiClock className="w-5 h-5" /> Your join request is awaiting the admin&apos;s approval — you&apos;ll get a notification.</p>
          ) : (
            <div>
              <button
                onClick={handleJoin}
                disabled={!isLive}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLive ? (me ? 'Join This Group' : 'Log In to Join') : 'Not Open for Joins Yet'}
              </button>
              <p className="text-xs text-gray-400 mt-3 text-center">
                {me
                  ? 'Your account details are used automatically — no new account needed.'
                  : 'Already have an account? Just log in. New to PayRound? You can create one in under a minute.'}
              </p>
            </div>
          )}
        </div>

        {/* ===== MEMBER AREA: rotation board + receipt upload + history (visible to everyone in the group) ===== */}
        {isMember && (
          <>
            {/* Rotation & payout board */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-6">
              <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><HiCurrencyDollar className="w-5 h-5 text-primary-600" /> Rotation & Payout Board</h2>
              <p className="text-xs text-gray-500 mb-4">
                All members can see this board. Spot #k collects the pot at {label} k • Current {label}: <strong>{Math.min(period, N)} of {N}</strong>.
                A member holding several spots collects several payouts.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-400 border-b">
                      <th className="py-2 pr-3 font-semibold">Spot</th>
                      <th className="py-2 pr-3 font-semibold">Holder</th>
                      <th className="py-2 pr-3 font-semibold">Paid</th>
                      <th className="py-2 pr-3 font-semibold">This {label}</th>
                      <th className="py-2 font-semibold">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: N }, (_, i) => i + 1).map(spot => {
                      const holder = spotMap[spot];
                      const paid = paidWeeksForSpot(payments, spot);
                      const collected = payoutForSpot(payouts, spot);
                      const mine = mySpots.includes(spot);
                      return (
                        <tr key={spot} className={`border-b border-gray-50 ${mine ? 'bg-primary-50/40' : ''}`}>
                          <td className="py-2.5 pr-3 font-bold text-gray-900">#{spot}{mine && <span className="ml-1 text-[10px] text-primary-600 font-semibold">YOU</span>}</td>
                          <td className="py-2.5 pr-3 text-gray-800">{holder ? (holder.member_name || 'Member') : <span className="text-gray-300">Open spot</span>}</td>
                          <td className="py-2.5 pr-3 text-gray-600">{paid}/{N}</td>
                          <td className="py-2.5 pr-3">
                            {holder
                              ? (isSpotCurrent(paid, Math.min(period, N))
                                  ? <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1"><HiCheckCircle className="w-4 h-4" /> Paid</span>
                                  : <span className="text-amber-600 text-xs font-semibold flex items-center gap-1"><HiClock className="w-4 h-4" /> Due</span>)
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="py-2.5">
                            {collected
                              ? <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-semibold">💰 Collected {new Date(collected.created_at).toLocaleDateString()}</span>
                              : period >= spot && holder
                                ? <span className="text-amber-600 text-xs font-semibold">Due now</span>
                                : <span className="text-gray-300 text-xs">Week #{spot}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upload receipt */}
            {myMember && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-6">
                <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><HiUpload className="w-5 h-5 text-primary-600" /> Pay Your Contribution</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Choose the spot(s) you are paying for and how many {label}s the payment covers — paying for several {label}s upfront is allowed.
                  The admin reviews your receipt and marks you paid.
                </p>
                {mySpots.length === 0 ? (
                  <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex items-center gap-2">
                    <HiExclamation className="w-4 h-4 shrink-0" /> No spot assigned to you yet — please ask your group admin to assign your spot before paying.
                  </p>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Which spot(s) are you paying for? *</label>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {mySpots.map(spot => {
                        const on = paySpots.includes(spot);
                        return (
                          <button
                            key={spot}
                            type="button"
                            onClick={() => setPaySpots(on ? paySpots.filter(x => x !== spot) : [...paySpots, spot])}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
                          >
                            #{spot}
                          </button>
                        );
                      })}
                    </div>

                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">How many {label}s does this payment cover? *</label>
                    <select
                      value={payWeeks}
                      onChange={e => setPayWeeks(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 mb-1"
                    >
                      {Array.from({ length: Math.max(2, N) }, (_, i) => i + 1).map(w => (
                        <option key={w} value={w}>{w} {label}{w > 1 ? `s${w > 1 ? ' (paying upfront)' : ''}` : ''}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mb-4">Expected amount: <strong className="text-gray-700">₦{receiptAmount.toLocaleString()}</strong> ({paySpots.length || 1} spot{(paySpots.length || 1) > 1 ? 's' : ''} × {payWeeks} {label}{payWeeks > 1 ? 's' : ''} × ₦{Number(group.amount || 0).toLocaleString()})</p>

                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Receipt image *</label>
                    <label className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-center gap-2 cursor-pointer hover:border-primary-300 hover:bg-primary-50/40 transition-all mb-4">
                      <input type="file" accept="image/*" className="hidden" onChange={e => onReceiptPicked(e.target.files?.[0])} />
                      <HiPhotograph className="w-5 h-5 text-gray-400" />
                      <span className="text-xs text-gray-500">{receiptName || 'Tap to upload receipt (compressed automatically)'}</span>
                    </label>
                    {receiptData && (
                      <button onClick={() => setZoomImg(receiptData)} className="block mb-4" title="Tap to expand">
                        <img src={receiptData} alt="receipt preview" className="h-24 rounded-xl border object-cover" />
                      </button>
                    )}

                    <button
                      onClick={submitReceipt}
                      disabled={uploading}
                      className="w-full bg-primary-600 text-white font-semibold py-3 rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50"
                    >
                      {uploading ? 'Sending…' : `Send Receipt for Review (₦${receiptAmount.toLocaleString()})`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* My payment history */}
            {myPayments.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-6">
                <h2 className="font-bold text-gray-900 mb-3">My Payments</h2>
                {myPayments.map(pay => (
                  <div key={pay.id} className="flex items-start justify-between gap-3 py-3 border-b border-gray-50 last:border-0">
                    <div className="flex gap-3 min-w-0">
                      {pay.receipt_url && (
                        <button onClick={() => setZoomImg(pay.receipt_url)} className="shrink-0" title="Tap to expand receipt">
                          <img src={pay.receipt_url} alt="receipt" className="w-12 h-12 rounded-lg object-cover border" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800">₦{Number(pay.amount || 0).toLocaleString()} — spot(s) #{parseSpots(pay.spots).join(', #')}, {pay.weeks} {label}{pay.weeks > 1 ? 's' : ''}</div>
                        <div className="text-[11px] text-gray-400">{pay.created_at ? new Date(pay.created_at).toLocaleString() : ''}</div>
                        {pay.status === 'declined' && pay.decline_reason && (
                          <div className="text-[11px] text-red-500 mt-1">Reason from admin: {pay.decline_reason}</div>
                        )}
                      </div>
                    </div>
                    {pay.status === 'approved'
                      ? <span className="shrink-0 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-semibold">Paid ✅</span>
                      : pay.status === 'declined'
                        ? <span className="shrink-0 text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs font-semibold">Declined ⚠️</span>
                        : <span className="shrink-0 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-semibold">Under review ⏳</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {zoomImg && <ImageLightbox src={zoomImg} alt="Receipt" onClose={() => setZoomImg(null)} />}

      <Footer />
    </div>
  );
}
