'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getGroupById } from '@/lib/data';
import toast from 'react-hot-toast';
import {
  HiArrowLeft, HiUser, HiCheckCircle, HiClock,
  HiExclamation, HiSearch, HiPhone, HiMail,
  HiLocationMarker, HiBriefcase, HiCurrencyDollar, HiUserGroup
} from 'react-icons/hi';

export default function AdminMembersPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [meEmail, setMeEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [approvedMembers, setApprovedMembers] = useState([]);
  const [groupPayments, setGroupPayments] = useState([]);
  const [groupPayouts, setGroupPayouts] = useState([]);
  const [memberReviews, setMemberReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, review: '' });
  const [spotOffers, setSpotOffers] = useState([]); // sent spot offers waiting for the user's accept/decline
  const [offerFor, setOfferFor] = useState(null);   // join-request card with the offer panel open
  const [offerSpots, setOfferSpots] = useState([]);
  const [spotEditList, setSpotEditList] = useState([]);  // member spot editor — picked spots for the editor
  const [spotEditBusy, setSpotEditBusy] = useState(false);

  // Load the REAL group from the database (bundled demo data only as fallback for legacy demo links)
  useEffect(() => {
    try { setMeEmail((JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase()); } catch {}
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: g } = await supabase.from('groups').select('*').eq('id', params.groupId).single();
        if (g) { setGroup(g); return; }
      } catch {}
      const found = getGroupById(params.groupId);
      if (found) setGroup(found);
    })();
  }, [params.groupId]);

  // Real join requests + approved members + payments + payouts + member reviews, from Supabase
  const loadSupa = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: reqs } = await supabase.from('members').select('*').eq('group_id', params.groupId).eq('status', 'pending').order('requested_at', { ascending: false });
      if (reqs) setJoinRequests(reqs);
      const { data: approved } = await supabase.from('members').select('*').eq('group_id', params.groupId).eq('status', 'approved');
      const { data: offers } = await supabase.from('members').select('*').eq('group_id', params.groupId).eq('status', 'spot_offered');
      if (offers) setSpotOffers(offers);
      if (approved) setApprovedMembers(approved.map(m => ({ ...m, name: m.member_name || '—', email: m.member_email, phone: m.member_phone || '—' })));
      const { data: pays } = await supabase.from('payments').select('user_email, spots, weeks, status').eq('group_id', params.groupId);
      if (pays) setGroupPayments(pays);
      const { data: outs } = await supabase.from('payouts').select('*').eq('group_id', params.groupId);
      if (outs) setGroupPayouts(outs);
      const { data: revs } = await supabase.from('member_reviews').select('*').order('created_at', { ascending: false });
      if (revs) setMemberReviews(revs);
    } catch {}
  };
  useEffect(() => { loadSupa(); }, [params.groupId]);

  // Approve -> auto-assign the next free rotation spot(s); a member can hold several spots.
  const handleJoinRequest = async (req, approve) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { parseSpots, formatSpots, nextFreeSpots } = await import('@/lib/payments');
      let assigned = [];
      if (approve) {
        const { data: existing } = await supabase.from('members').select('spots').eq('group_id', params.groupId).eq('status', 'approved');
        const takenFlat = (existing || []).flatMap(m => parseSpots(m.spots));
        const wanted = Math.max(1, parseInt(req.spots_requested, 10) || 1);
        const desired = parseSpots(req.desired_spots || '');
        if (desired.length) {
          const blocked = desired.filter(sp => takenFlat.includes(sp));
          if (!blocked.length) {
            assigned = desired.slice(0, wanted); // grant their wishlist spots
          } else {
            setOfferFor(req.id);
            setOfferSpots(nextFreeSpots(takenFlat, Math.max(1, parseInt(group?.max_members, 10) || 1), wanted));
            toast.error(`Spot(s) ${blocked.map(b => '#' + b).join(', ')} are already taken — offer an alternative below instead.`);
            return; // approval paused until the admin offers alternative spots
          }
        } else {
          assigned = nextFreeSpots(takenFlat, Math.max(1, parseInt(group?.max_members, 10) || 1), wanted);
        }
      }
      await supabase.from('members').update({
        status: approve ? 'approved' : 'declined',
        approved_at: approve ? new Date().toISOString() : null,
        spots: approve ? formatSpots(assigned) : '',
      }).eq('id', req.id);
      // Targeted: only the requesting user sees this notification
      await supabase.from('notifications').insert({
        id: `joinres-${Date.now()}`, type: approve ? 'join_approved' : 'join_declined', group_id: params.groupId, is_read: false,
        user_email: req.member_email,
        message: approve
          ? `✅ Your request to join "${group?.name || params.groupId}" was approved — you are now a member.${assigned.length ? ` You hold spot${assigned.length > 1 ? 's' : ''} #${assigned.join(', #')} — each spot pays its own contribution and collects its own payout.` : ' No free spots were left to assign yet — please contact your group admin.'}`
          : `Your request to join "${group?.name || params.groupId}" was declined.`,
      });
      toast.success(approve
        ? (assigned.length ? `Member approved — assigned spot${assigned.length > 1 ? 's' : ''} #${assigned.join(', #')}.` : 'Member approved (no free spots left to assign).')
        : 'Request declined.');
      if (approve) {
        // 🎉 If that approval took the LAST open spot, everyone hears "savings start now!"
        try {
          const { notifyGroupFullIfFilled } = await import('@/lib/notifications');
          await notifyGroupFullIfFilled(supabase, params.groupId);
        } catch {}
      }
    } catch (e) { toast.error('Could not update request.'); }
    loadSupa();
  };

  // 🪑 Approve / decline EXTRA spot requests from members who already hold spots
  const [extraBusy, setExtraBusy] = useState(false);
  const reviewExtraSpots = async (m, approve) => {
    if (extraBusy) return;
    setExtraBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { parseSpots, formatSpots } = await import('@/lib/payments');
      const want = parseSpots(m.extra_spots_request);
      if (!approve) {
        await supabase.from('members').update({ extra_spots_request: null }).eq('id', m.id);
        await supabase.from('notifications').insert({
          id: `extrares-${Date.now()}`, type: 'extra_spots_declined', group_id: params.groupId, is_read: false,
          user_email: m.member_email,
          message: `Your request to take extra spot${want.length > 1 ? 's' : ''} #${want.join(', #')} in "${group?.name || params.groupId}" was declined by the admin. You keep your current spot(s) ${m.spots ? `#${m.spots}` : ''}.`,
        });
        toast.success('Extra-spots request declined — the member was notified.');
      } else {
        // fresh conflict check — another member may have grabbed a spot meanwhile
        const { data: current } = await supabase.from('members').select('id, spots').eq('group_id', params.groupId).eq('status', 'approved');
        const takenElsewhere = (current || []).filter(x => x.id !== m.id).flatMap(x => parseSpots(x.spots));
        const free = want.filter(sp => !takenElsewhere.includes(sp));
        const lost = want.filter(sp => takenElsewhere.includes(sp));
        if (free.length === 0) {
          toast.error(`Spot(s) #${lost.join(', #')} are taken now — decline instead or ask the member to pick again.`);
          setExtraBusy(false);
          return;
        }
        const merged = formatSpots([...parseSpots(m.spots), ...free]);
        const { error } = await supabase.from('members').update({ spots: merged, extra_spots_request: null }).eq('id', m.id);
        if (error) throw error;
        await supabase.from('notifications').insert({
          id: `extrares-${Date.now()}`, type: 'extra_spots_approved', group_id: params.groupId, is_read: false,
          user_email: m.member_email,
          message: `🎉 Approved! You now ALSO hold spot${free.length > 1 ? 's' : ''} #${free.join(', #')} in "${group?.name || params.groupId}" — you now hold #${parseSpots(merged).join(', #')} total. Each spot pays its own contribution and collects its own payout.${lost.length ? ` (#${lost.join(', #')} were taken meanwhile and were NOT granted.)` : ''}`,
        });
        toast.success(`Granted — ${m.member_name || m.member_email} now holds #${parseSpots(merged).join(', #')}.`);
        // 🎉 If that filled the LAST open spot, everyone hears "savings start now!"
        try {
          const { notifyGroupFullIfFilled } = await import('@/lib/notifications');
          await notifyGroupFullIfFilled(supabase, params.groupId);
        } catch {}
      }
    } catch { toast.error('Could not review the request.'); }
    setExtraBusy(false);
    loadSupa();
  };

  // ✏️ Move an approved member to different spot(s) — only free numbers can be picked; the member is notified
  const saveMemberSpots = async () => {
    if (!selectedMember || spotEditBusy) return;
    if (!spotEditList.length) { toast.error('Pick at least one spot (or remove the member instead).'); return; }
    setSpotEditBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { formatSpots } = await import('@/lib/payments');
      const spots = formatSpots(spotEditList);
      const { error } = await supabase.from('members').update({ spots }).eq('id', selectedMember.id);
      if (error) throw error;
      await supabase.from('notifications').insert({
        id: `spotchg-${Date.now()}`, type: 'spots_changed', group_id: params.groupId, is_read: false,
        user_email: selectedMember.email,
        message: `🪑 Your group admin moved your spot(s) in "${group?.name || 'your group'}" — you now hold spot${spotEditList.length > 1 ? 's' : ''} #${spotEditList.join(', #')}. Your payment history carries over.`,
      });
      toast.success(`Spots updated — ${selectedMember.name} now holds #${spotEditList.join(', #')}. They got a notification.`);
      setSelectedMember(prev => prev ? { ...prev, spots } : prev);
      await loadSupa();
    } catch (e) { toast.error('Could not update spots.'); }
    setSpotEditBusy(false);
  };

  // Send an alternative spot offer — the user must ACCEPT to join or DECLINE to stay out (both sides get notified)
  const sendSpotOffer = async (req) => {
    if (!offerSpots.length) { toast.error('Pick the spot(s) to offer first.'); return; }
    try {
      const { supabase } = await import('@/lib/supabase');
      const { parseSpots, formatSpots } = await import('@/lib/payments');
      // fresh availability check so two offers can't collide
      const { data: existing } = await supabase.from('members').select('spots').eq('group_id', params.groupId).eq('status', 'approved');
      const takenFlat = (existing || []).flatMap(m => parseSpots(m.spots));
      const clash = offerSpots.filter(sp => takenFlat.includes(sp));
      if (clash.length) { toast.error(`Spot(s) ${clash.map(b => '#' + b).join(', ')} just got taken — pick again.`); loadSupa(); return; }
      const { error } = await supabase.from('members').update({
        status: 'spot_offered', offered_spots: formatSpots(offerSpots), spots: '',
      }).eq('id', req.id);
      if (error) throw error;
      await supabase.from('notifications').insert({
        id: `offer-${Date.now()}`, type: 'spot_offer', group_id: params.groupId, is_read: false,
        user_email: req.member_email,
        message: `🪑 In "${group?.name || params.groupId}": ${req.desired_spots ? `the spot(s) you wanted (#${req.desired_spots}) are taken — but ` : ''}the admin offers you spot${offerSpots.length > 1 ? 's' : ''} #${offerSpots.join(', #')}. Open the group page to ACCEPT or DECLINE.`,
      });
      toast.success('Spot offer sent — they get a notification and must accept or decline.');
      setOfferFor(null); setOfferSpots([]);
    } catch (e) { toast.error('Could not send the offer.'); }
    loadSupa();
  };

  const reviewsFor = (email) => memberReviews.filter(r => r.member_email === email);

  const submitReview = async (memberEmail) => {
    if (!reviewForm.review.trim()) { toast.error('Write a review first.'); return; }
    try {
      const { supabase } = await import('@/lib/supabase');
      let adminEmail = 'admin';
      const s = localStorage.getItem('payround_user');
      if (s) { try { adminEmail = JSON.parse(s).email || 'admin'; } catch {} }
      await supabase.from('member_reviews').insert({
        id: `mr-${Date.now()}`, member_email: memberEmail, group_id: params.groupId,
        admin_email: adminEmail, rating: reviewForm.rating, review: reviewForm.review.trim(),
      });
      toast.success('Review saved — visible to other group admins.');
      setReviewForm({ rating: 5, review: '' });
      loadSupa();
    } catch { toast.error('Could not save review.'); }
  };

  if (!group) return null;

  // Privacy lock: member contact details (phone numbers) are visible ONLY to the group admin
  const isGroupAdmin = meEmail && group.admin_email && meEmail === (group.admin_email || '').toLowerCase();
  if (!isGroupAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <HiExclamation className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Admin Only</h2>
          <p className="text-sm text-gray-500 mb-4">Member contact details are private — only the admin of "{group.name}" can manage members here.</p>
          <button onClick={() => router.push(`/groups/${params.groupId}`)} className="bg-primary-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl">Back to Group</button>
        </div>
        <Footer />
      </div>
    );
  }

  const parseSpotsLite = (str) => String(str || '').split(',').map(x => parseInt(x.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
  const takenNow = approvedMembers.flatMap(m => parseSpotsLite(m.spots));
  const freeSpotNums = Array.from({ length: Math.max(1, parseInt(group?.max_members, 10) || 1) }, (_, i) => i + 1).filter(n => !takenNow.includes(n));

  const q = searchQuery.toLowerCase();
  const filteredMembers = approvedMembers.filter(m =>
    (m.name || '').toLowerCase().includes(q) ||
    (m.email || '').toLowerCase().includes(q) ||
    (m.phone || '').includes(searchQuery)
  );

  // Real contribution progress: total approved receipt-weeks submitted BY this member
  const paidWeeksFor = (email) => (groupPayments || [])
    .filter(p => p.status === 'approved' && (p.user_email || '') === (email || ''))
    .reduce((sum, p) => sum + (parseInt(p.weeks, 10) || 1), 0);
  const spotsLabel = (m) => {
    const sp = (m.spots || '').split(',').map(x => x.trim()).filter(Boolean);
    return sp.length ? `Spot${sp.length > 1 ? 's' : ''} #${sp.join(', #')}` : 'No spot assigned yet';
  };
  const collectedForMember = (m) => (groupPayouts || []).filter(po => po.status === 'collected' && (po.user_email || '') === (m.email || ''));

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid': return <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg text-xs font-medium"><HiCheckCircle className="w-3 h-3" /> Paid</span>;
      case 'pending': return <span className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded-lg text-xs font-medium"><HiClock className="w-3 h-3" /> Pending</span>;
      case 'overdue': return <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-lg text-xs font-medium"><HiExclamation className="w-3 h-3" /> Overdue</span>;
      case 'not_due': return <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-1 rounded-lg text-xs font-medium"><HiClock className="w-3 h-3" /> Not Due</span>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          {group.avatar_url
            ? <img src={group.avatar_url} alt={group.name} className="w-12 h-12 rounded-xl object-cover border border-gray-100 shrink-0" />
            : <span className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center shrink-0"><HiUserGroup className="w-6 h-6 text-primary-600" /></span>}
          <h1 className="text-2xl font-bold text-gray-900 truncate flex-1 min-w-0">Members - {group.name}</h1>
          <button
            onClick={() => router.push(`/group-chat?group=${group.id}`)}
            title="Open group chat"
            aria-label="Open group chat"
            className="p-2.5 rounded-xl bg-primary-50 border border-primary-100 text-primary-600 hover:bg-primary-100 transition-colors shrink-0"
          >
            <HiUserGroup className="w-6 h-6" />
          </button>
        </div>
        <p className="text-gray-500 mb-6">{approvedMembers.length} approved member{approvedMembers.length === 1 ? '' : 's'} {joinRequests.length > 0 ? `• ${joinRequests.length} join request${joinRequests.length > 1 ? 's' : ''} waiting` : ''}</p>

        {group?.is_frozen && (
          <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-sky-800">❄️ This group is frozen by PayRound — approvals, spot offers and spot changes are paused until the freeze is lifted.</div>
        )}

        {/* Join Requests — real requests from the members table; preview profile before approving */}
        {joinRequests.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 p-5 mb-6">
            <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              Join Requests <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{joinRequests.length}</span>
            </h2>
            <p className="text-xs text-gray-500 mb-4">Preview each profile — including reviews from other group admins — before approving. Approving adds them as a member automatically.</p>
            {joinRequests.map(req => (
              <div key={req.id} className="border rounded-xl p-4 mb-3">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="font-medium text-sm">{req.member_name || '—'}</div>
                    <div className="text-xs text-gray-500">{req.member_email}{req.member_phone ? ` • 📞 ${req.member_phone}` : ''} • Requested {req.requested_at ? new Date(req.requested_at).toLocaleDateString() : '—'}</div>
                    {parseSpotsLite(req.desired_spots).length > 0 && (() => {
                      const wants = parseSpotsLite(req.desired_spots);
                      const blocked = wants.filter(w => takenNow.includes(w));
                      return (
                        <p className="text-[11px] mt-1">
                          Wants spot{wants.length > 1 ? 's' : ''}: <b className="text-gray-900">#{wants.join(', #')}</b>
                          {blocked.length
                            ? <span className="text-red-600 font-semibold"> — #{blocked.join(', #')} already taken (suggest another)</span>
                            : <span className="text-emerald-600 font-semibold"> — all still free ✓ approve to grant them</span>}
                        </p>
                      );
                    })()}
                  </div>
                  {!group?.is_frozen && (
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => handleJoinRequest(req, true)} className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">Approve → Add Member</button>
                    <button onClick={() => {
                      setOfferFor(offerFor === req.id ? null : req.id);
                      // Start from THEIR wishlist spots that are still free, topped up with the next free spots
                      const need = Math.max(1, parseInt(req.spots_requested, 10) || 1);
                      const wished = parseSpotsLite(req.desired_spots).filter(w => freeSpotNums.includes(w));
                      const pre = [...wished];
                      for (const sp of freeSpotNums) { if (pre.length >= Math.max(need, wished.length)) break; if (!pre.includes(sp)) pre.push(sp); }
                      setOfferSpots(pre.sort((a, b) => a - b));
                    }} className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-xs font-medium">🪑 Suggest spot(s)</button>
                    <button onClick={() => handleJoinRequest(req, false)} className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-medium">Decline</button>
                  </div>
                  )}
                </div>
                {/* Past reviews by other group admins */}
                <div className="mt-3 bg-gray-50 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-gray-500 mb-1">Past reviews from group admins ({reviewsFor(req.member_email).length})</div>
                  {reviewsFor(req.member_email).length > 0 ? reviewsFor(req.member_email).map(r => (
                    <div key={r.id} className="text-xs text-gray-600 py-1 border-b last:border-0">
                      <span className="text-yellow-500">{'★'.repeat(r.rating || 0)}{'☆'.repeat(5 - (r.rating || 0))}</span> {r.review} <span className="text-gray-400">— {r.admin_email} • {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                    </div>
                  )) : <div className="text-xs text-gray-400">No reviews yet — this member is new to the platform or has none recorded.</div>}
                </div>

                {/* Alternative-spot offer panel */}
                {offerFor === req.id && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-amber-800 mb-1">🪑 Offer alternative spot(s)</p>
                    <p className="text-[11px] text-gray-600 mb-2">
                      Pick the spot(s) you offer {req.member_name || 'them'} — they must <b>ACCEPT</b> to join or <b>DECLINE</b> to stay out. You both get a notification.
                      {parseSpotsLite(req.desired_spots).length > 0 && <> Their wishlist <b>#{parseSpotsLite(req.desired_spots).join(', #')}</b> is pre-picked for you where still free — adjust anything before sending.</>}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {freeSpotNums.length === 0 && <span className="text-[11px] text-red-600 font-semibold">No free spots left in this group right now.</span>}
                      {freeSpotNums.map(sp => {
                        const on = offerSpots.includes(sp);
                        return <button key={sp} onClick={() => setOfferSpots(on ? offerSpots.filter(x => x !== sp) : [...offerSpots, sp].sort((a, b) => a - b))} className={`w-9 h-8 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`}>#{sp}</button>;
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => sendSpotOffer(req)} className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700">✉️ Send Offer {offerSpots.length ? `(#${offerSpots.join(', #')})` : ''}</button>
                      <button onClick={() => { setOfferFor(null); setOfferSpots([]); }} className="text-xs text-gray-600 border border-gray-200 px-3 py-2 rounded-lg bg-white hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 🪑 EXTRA spot requests — members who already hold spots asking for more */}
        {approvedMembers.filter(m => parseSpotsLite(m.extra_spots_request).length > 0).length > 0 && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-5 mb-6" data-extra-spots="admin">
            <h2 className="font-bold text-gray-900 mb-2">🪑 Extra Spot Requests ({approvedMembers.filter(m => parseSpotsLite(m.extra_spots_request).length > 0)})</h2>
            <p className="text-xs text-gray-500 mb-3">These members already hold spots and want MORE. Approving adds the spots to theirs — each spot pays &amp; collects separately.</p>
            {approvedMembers.filter(m => parseSpotsLite(m.extra_spots_request).length > 0).map(m => (
              <div key={m.id} className="py-3 border-b border-gray-50 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-600">
                    <b className="text-gray-900">{m.name}</b> holds <b>#{parseSpotsLite(m.spots).join(', #')}</b> — wants extra spot{parseSpotsLite(m.extra_spots_request).length > 1 ? 's' : ''} <b className="text-emerald-700">#{parseSpotsLite(m.extra_spots_request).join(', #')}</b>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={extraBusy} onClick={() => reviewExtraSpots(m, true)} className="bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50">✔ Approve</button>
                    <button disabled={extraBusy} onClick={() => reviewExtraSpots(m, false)} className="bg-red-50 text-red-600 border border-red-200 text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50">✖ Decline</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spot offers already sent — waiting for the user's answer (visible to the admin) */}
        {spotOffers.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <h2 className="font-bold text-gray-900 mb-2">🪑 Spot Offers Sent — Waiting ({spotOffers.length})</h2>
            {spotOffers.map(o => (
              <div key={o.id} className="text-xs text-gray-600 py-2 border-b last:border-0 flex flex-wrap justify-between gap-2">
                <span><b className="text-gray-900">{o.member_name || o.member_email}</b> — offered spot{parseSpotsLite(o.offered_spots).length > 1 ? 's' : ''} <b>#{parseSpotsLite(o.offered_spots).join(', #')}</b>{o.desired_spots ? ` (they wanted #${o.desired_spots})` : ''}</span>
                <span className="text-amber-600 font-semibold">⏳ waiting for accept / decline</span>
              </div>
            ))}
          </div>
        )}

        <div className="relative mb-6 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Member List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filteredMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => { const next = selectedMember?.id === member.id ? null : member; setSelectedMember(next); setSpotEditList(parseSpotsLite(next?.spots)); }}
                  className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left ${
                    selectedMember?.id === member.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-700 font-semibold text-sm">{member.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">{spotsLabel(member)} • {member.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">{paidWeeksFor(member.email)} week{paidWeeksFor(member.email) === 1 ? '' : 's'} approved</span>
                    {collectedForMember(member).length > 0 && <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">💰 {collectedForMember(member).length} payout{collectedForMember(member).length > 1 ? 's' : ''}</span>}
                  </div>
                </button>
              ))}
              {filteredMembers.length === 0 && (
                <div className="p-8 text-center text-gray-500">No members found.</div>
              )}
            </div>
          </div>

          {/* Member Details */}
          <div>
            {selectedMember ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-primary-700 font-bold text-2xl">{selectedMember.name.charAt(0)}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedMember.name}</h3>
                  <p className="text-sm text-gray-500">{spotsLabel(selectedMember)}</p>
                </div>

                <div className="space-y-3">
                  <DetailRow icon={<HiPhone className="w-4 h-4" />} label="Phone" value={selectedMember.phone} />
                  <DetailRow icon={<HiMail className="w-4 h-4" />} label="Email" value={selectedMember.email} />
                  <DetailRow icon={<HiUser className="w-4 h-4" />} label="Spots Held" value={spotsLabel(selectedMember)} />
                  <DetailRow icon={<HiCheckCircle className="w-4 h-4" />} label="Weeks Approved" value={`${paidWeeksFor(selectedMember.email)} (receipt-verified)`} />
                  <DetailRow icon={<HiCurrencyDollar className="w-4 h-4" />} label="Payouts Collected" value={collectedForMember(selectedMember).length > 0 ? collectedForMember(selectedMember).map(po => `#${po.spot} ✅`).join(', ') : 'None yet'} />
                  <DetailRow icon={<HiClock className="w-4 h-4" />} label="Joined" value={selectedMember.approved_at ? new Date(selectedMember.approved_at).toLocaleDateString() : '—'} />
                </div>

                {/* ✏️ Change this member's spot(s) — only free numbers + their own are pickable */}
                {!group?.is_frozen && (
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <div className="text-xs font-bold text-gray-500 mb-2">Change this member&apos;s spot(s)</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[...new Set([...freeSpotNums, ...parseSpotsLite(selectedMember.spots)])]
                      .sort((a, b) => a - b)
                      .map(sp => {
                        const on = spotEditList.includes(sp);
                        const theirs = parseSpotsLite(selectedMember.spots).includes(sp);
                        return (
                          <button key={sp} type="button"
                            onClick={() => setSpotEditList(on ? spotEditList.filter(x => x !== sp) : [...spotEditList, sp].sort((a, b) => a - b))}
                            className={`w-10 h-9 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}
                            title={theirs ? 'their current spot' : 'a free spot'}
                          >#{sp}</button>
                        );
                      })}
                  </div>
                  <p className="text-[11px] text-gray-400 mb-3">Current: <b>{spotsLabel(selectedMember)}</b>. Only free numbers and their own spots are listed — two members can never share a spot. The member is notified of the change.</p>
                  <div className="flex gap-2">
                    <button onClick={saveMemberSpots} disabled={spotEditBusy} className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{spotEditBusy ? 'Saving…' : 'Save new spot(s)'}</button>
                    <button onClick={() => setSpotEditList(parseSpotsLite(selectedMember.spots))} className="text-xs text-gray-600 border border-gray-200 px-3 py-2 rounded-lg bg-white hover:bg-gray-50">Reset</button>
                  </div>
                </div>
                )}

                {/* Member reviews — given by group admins, shown to other admins before approving joins */}
                {selectedMember.email && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <div className="text-xs font-bold text-gray-500 mb-2">Reviews by group admins ({reviewsFor(selectedMember.email).length})</div>
                    {reviewsFor(selectedMember.email).length > 0 ? reviewsFor(selectedMember.email).map(r => (
                      <div key={r.id} className="text-xs text-gray-600 py-1.5 border-b last:border-0">
                        <span className="text-yellow-500">{'★'.repeat(r.rating || 0)}{'☆'.repeat(5 - (r.rating || 0))}</span> {r.review} <span className="text-gray-400">— {r.admin_email}</span>
                      </div>
                    )) : <p className="text-xs text-gray-400 mb-2">No reviews yet for this member.</p>}
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                      <div className="text-xs font-bold text-gray-500 mb-2">Add a review (visible to other group admins)</div>
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} type="button" onClick={() => setReviewForm(prev => ({ ...prev, rating: n }))}
                            className={`text-lg leading-none ${n <= reviewForm.rating ? 'text-yellow-500' : 'text-gray-300'}`}>★</button>
                        ))}
                      </div>
                      <textarea
                        value={reviewForm.review}
                        onChange={(e) => setReviewForm(prev => ({ ...prev, review: e.target.value }))}
                        rows={2}
                        placeholder="e.g. Pays on time every cycle, very reliable."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      />
                      <button onClick={() => submitReview(selectedMember.email)} className="mt-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold py-2 rounded-lg">Save Review</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <HiUser className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a member to view their details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
      <span className="text-gray-400 w-5">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value || 'N/A'}</p>
      </div>
    </div>
  );
}
