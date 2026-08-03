'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import {
  HiUserGroup, HiCalendar, HiCurrencyDollar,
  HiUser, HiCheckCircle, HiClock, HiArrowLeft,
  HiPhotograph, HiUpload, HiExclamation, HiDocumentText
} from 'react-icons/hi';
import ImageLightbox from '@/components/ImageLightbox';
import GroupBadge from '@/components/GroupBadge';
import { remindRenewalIfSoon } from '@/lib/renewal';
import { parseSpots, formatSpots, currentPeriod, cycleLength, periodLabel, periodDays, paidWeeksForSpot, isSpotCurrent, buildSpotMap, payoutForSpot, withRotationClock, payoutPerSpot, adminInterest, frequencyLabel, adminAutoSpots, paidWeeksEffective } from '@/lib/payments';
import { compressImage } from '@/lib/image';
import toast from 'react-hot-toast';
import { sounds } from '@/lib/sounds';

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
  const [myOffer, setMyOffer] = useState(null);         // member row while a spot offer waits for my answer
  const [offerBusy, setOfferBusy] = useState(false);
  const [declinedOffer, setDeclinedOffer] = useState(null); // my declined membership row (kept as a record)
  const [editingRules, setEditingRules] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [savingRules, setSavingRules] = useState(false);
  const [autoTickBusy, setAutoTickBusy] = useState(false);
  // 🪑 Join flow lives HERE on the group page — tap green spots, agree to the rules, one tap to join
  const [desiredSpots, setDesiredSpots] = useState([]);
  const [agreeRules, setAgreeRules] = useState(false);
  const [joining, setJoining] = useState(false);

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
          const { data: adm } = await supabase.from('users').select('id, name, phone, profile_pic, bank_name, account_number, account_name, payment_remark').eq('email', g.admin_email.toLowerCase()).single();
          if (mounted && adm) setAdminProfile(adm);
        }

        // 🔔 Renewal reminder — the group admin gets a bell notification 7 days before the group plan renews
        if (user?.email && g.admin_email && user.email.toLowerCase() === g.admin_email.toLowerCase()) {
          remindRenewalIfSoon(supabase, g);
        }

        if (user?.email) {
          const email = user.email.toLowerCase();
          const mine = (mems || []).find(m => (m.member_email || '').toLowerCase() === email);
          const { data: pendingMine } = await supabase
            .from('members').select('status')
            .eq('group_id', params.id).eq('member_email', email)
            .eq('status', 'pending');
          const { data: offeredMine } = await supabase
            .from('members').select('*')
            .eq('group_id', params.id).eq('member_email', email)
            .eq('status', 'spot_offered');
          const { data: declinedMine } = await supabase
            .from('members').select('*')
            .eq('group_id', params.id).eq('member_email', email)
            .eq('status', 'declined');
          if (mounted) {
            if (mine) {
              setMyStatus('approved');
              setMyMember(mine);
              setPaySpots(parseSpots(mine.spots)); // pre-select all my spots
            } else if (offeredMine && offeredMine.length > 0) {
              setMyOffer(offeredMine[0]);
              setMyStatus('offered');
            } else if (pendingMine && pendingMine.length > 0) setMyStatus('pending');
            if (declinedMine && declinedMine.length > 0 && !mine) setDeclinedOffer(declinedMine[0]);
          }
        }
      } catch (e) {
        if (mounted) setNotFound(true);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [params.id]);

  // 👑 Admin joins their OWN group as a member — instant, holds the picked spots, self-approves receipts
  const adminJoinOwnGroup = async () => {
    if (!me || joining || desiredSpots.length === 0) return;
    setJoining(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const email = me.email.toLowerCase();
      const { data: amems } = await supabase.from('members').select('spots').eq('group_id', params.id).eq('status', 'approved');
      const taken = (amems || []).flatMap(m => parseSpots(m.spots));
      const conflict = desiredSpots.filter(x => taken.includes(x));
      if (conflict.length) { toast.error(`Spot(s) #${conflict.join(', #')} were just taken — pick another.`); setJoining(false); return; }
      const { data: acc } = await supabase.from('users').select('name, phone').eq('email', email).maybeSingle();
      const row = {
        id: `m-${Date.now()}`, group_id: params.id,
        member_email: email,
        member_name: acc?.name || me.name || group.admin_name || '',
        member_phone: acc?.phone || '',
        spots_requested: desiredSpots.length,
        desired_spots: formatSpots(desiredSpots),
        spots: formatSpots(desiredSpots),
        offered_spots: '',
        status: 'approved',
        approved_at: new Date().toISOString(),
        requested_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('members').insert(row);
      if (error) throw error;
      setMembers(prev => [...prev, row]);
      setMemberCount(c => c + 1);
      setMyMember(row);
      setMyStatus('approved');
      setPaySpots([...desiredSpots]);
      const held = desiredSpots.join(', #');
      setDesiredSpots([]);
      toast.success(`You're in as a member too — you hold spot(s) #${held}. 🎉 Upload receipts like any member and approve them in your Payments tab.`);
      try { const { notifyGroupFullIfFilled } = await import('@/lib/notifications'); await notifyGroupFullIfFilled(supabase, params.id); } catch {}
    } catch (e) { toast.error(`Could not join: ${e.message || 'try again'}`); }
    setJoining(false);
  };

  // 📤 Opened from the chat's "Upload payment receipt" shortcut? Glide straight to the Pay card.
  useEffect(() => {
    if (loading || !myMember) return;
    const want = typeof window !== 'undefined' && (window.location.hash === '#pay' || new URLSearchParams(window.location.search).get('pay') === '1');
    if (!want) return;
    const t = setTimeout(() => {
      document.getElementById('pay-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast.success('Upload your receipt right here 👇');
    }, 350);
    return () => clearTimeout(t);
  }, [loading, myMember]);

  if (loading) {
    return <LoadingScreen label="Loading group…" />;
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
  const frozen = !!group.is_frozen; // ❄️ PayRound froze this group — joins/payments/chat are paused

  // Spot offer answers: accept joins the group with the offered spots; decline keeps you out
  const acceptOffer = async () => {
    if (!myOffer || offerBusy) return;
    setOfferBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const wanted = parseSpots(myOffer.offered_spots);
      // spots may have been taken since the offer — re-check live
      const { data: amems } = await supabase.from('members').select('spots').eq('group_id', params.id).eq('status', 'approved');
      const taken = (amems || []).flatMap(m => parseSpots(m.spots));
      const conflict = wanted.filter(x => taken.includes(x));
      if (conflict.length) {
        await supabase.from('notifications').insert({
          id: `offerlap-${Date.now()}`, type: 'offer_lapsed', group_id: params.id, is_read: false,
          user_email: (group.admin_email || '').toLowerCase(),
          message: `⚠️ The spot offer for ${myOffer.member_name || myOffer.member_email} (#${conflict.join(', #')}) was taken before they accepted — offer them another spot in your Members tab.`,
        });
        toast.error('Sorry — that spot was just taken. The admin has been notified to offer another one.');
        setOfferBusy(false);
        return;
      }
      const { error } = await supabase.from('members').update({
        status: 'approved', spots: formatSpots(wanted), approved_at: new Date().toISOString(),
      }).eq('id', myOffer.id);
      if (error) throw error;
      await supabase.from('notifications').insert({
        id: `offerok-${Date.now()}`, type: 'offer_accepted', group_id: params.id, is_read: false,
        user_email: (group.admin_email || '').toLowerCase(),
        message: `✅ ${myOffer.member_name || myOffer.member_email} accepted the spot offer (#${wanted.join(', #')}) and joined "${group.name}"!`,
      });
      const newMember = { ...myOffer, status: 'approved', spots: formatSpots(wanted) };
      setMyMember(newMember);
      setMembers(prev => [...prev, newMember]);
      setMemberCount(c => c + 1);
      setPaySpots(wanted);
      setMyOffer(null);
      setMyStatus('approved');
      sounds.success();
      toast.success(`You're in! You hold spot${wanted.length > 1 ? 's' : ''} #${wanted.join(', #')}. 🎉`);
      // 🎉 If accepting that offer took the LAST open spot, everyone hears "savings start now!"
      try {
        const { notifyGroupFullIfFilled } = await import('@/lib/notifications');
        await notifyGroupFullIfFilled(supabase, params.id);
      } catch {}
    } catch (e) { toast.error(`Could not accept: ${e.message || 'try again'}`); }
    setOfferBusy(false);
  };

  const declineOffer = async () => {
    if (!myOffer || offerBusy) return;
    if (!window.confirm('Decline this spot offer and stay out of the group? You can send a fresh join request anytime.')) return;
    setOfferBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('members').update({ status: 'declined', spots: '' }).eq('id', myOffer.id);
      if (error) throw error;
      await supabase.from('notifications').insert({
        id: `offerno-${Date.now()}`, type: 'offer_declined', group_id: params.id, is_read: false,
        user_email: (group.admin_email || '').toLowerCase(),
        message: `⚠️ ${myOffer.member_name || myOffer.member_email} declined the offered spot(s) #${parseSpots(myOffer.offered_spots).join(', #')} — they will not join "${group.name}".`,
      });
      setDeclinedOffer(myOffer);
      setMyOffer(null);
      setMyStatus('declined');
      toast.success('Offer declined — you did not join the group.');
    } catch (e) { toast.error(`Could not decline: ${e.message || 'try again'}`); }
    setOfferBusy(false);
  };

  // Admin writes the group's own rules — every user reads them BEFORE joining
  // 👑 Auto-tick toggle — the admin's own spots mark themselves paid every round
  const toggleAutoTick = async () => {
    if (autoTickBusy) return;
    setAutoTickBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const next = group.admin_auto_paid === false;
      const { error } = await supabase.from('groups').update({ admin_auto_paid: next }).eq('id', params.id);
      if (error) throw error;
      setGroup(prev => ({ ...prev, admin_auto_paid: next }));
      toast(next ? `👑 Auto-tick ON — your spot(s) mark themselves paid every ${label}.` : `⏸ Auto-tick OFF — you'll upload receipts like everyone else.`);
    } catch (e) { toast.error(`Could not change auto-tick: ${e.message || 'try again'}`); }
    setAutoTickBusy(false);
  };

  const saveRules = async () => {
    setSavingRules(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const txt = rulesText.trim();
      const { error } = await supabase.from('groups').update({ rules: txt || null }).eq('id', group.id);
      if (error) throw error;
      setGroup(prev => ({ ...prev, rules: txt || null }));
      setEditingRules(false);
      toast.success(txt ? 'Group rules saved — everyone sees them before joining.' : 'Custom rules cleared.');
    } catch (e) { toast.error(`Could not save rules: ${e.message || 'try again'}`); }
    setSavingRules(false);
  };

  // Tap a green (open) spot number to add/remove it from your join wishlist
  const toggleDesiredSpot = (sp) => {
    setDesiredSpots(prev => prev.includes(sp) ? prev.filter(x => x !== sp) : [...prev, sp].sort((a, b) => a - b));
  };

  // One-tap join — name, phone & email pulled straight from the profile (no forms, no typing)
  const submitJoinRequest = async () => {
    if (!me || !agreeRules || joining) return;
    setJoining(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const email = me.email.toLowerCase();
      // Pull details straight from the user's profile — the admin sees these in the Members tab
      let prof = { name: me.name || '', phone: '' };
      try {
        const { data: acc } = await supabase.from('users').select('name, phone').eq('email', email).single();
        if (acc) { if (acc.name) prof.name = acc.name; if (acc.phone) prof.phone = acc.phone; }
      } catch {}
      const payload = {
        group_id: params.id,
        member_email: email,
        member_name: prof.name || '',
        member_phone: prof.phone || '',
        spots_requested: Math.max(1, desiredSpots.length),
        desired_spots: formatSpots(desiredSpots) || null,
        spots: '',
        offered_spots: '',
        status: 'pending',
        requested_at: new Date().toISOString(),
      };
      // Re-requesting after a decline? Revive the same row instead of stacking a duplicate.
      const { data: stale } = await supabase.from('members').select('id').eq('group_id', params.id).eq('member_email', email).in('status', ['declined', 'spot_offered']);
      if (stale && stale.length) {
        const { error } = await supabase.from('members').update(payload).eq('id', stale[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('members').insert({ id: `m-${Date.now()}`, ...payload });
        if (error) throw error;
      }
      // Notify ONLY the group admin
      await supabase.from('notifications').insert({
        id: `join-${Date.now()}`, type: 'join_request', group_id: params.id, is_read: false,
        user_email: (group.admin_email || '').toLowerCase() || null,
        message: `🔔 ${payload.member_name || email} requested to join "${group.name}"${desiredSpots.length ? ` — picked spot(s) #${desiredSpots.join(', #')}` : ' (no spot preference)'} — their profile details are waiting in your Members tab; approve or offer an alternative spot.`,
      });
      setDesiredSpots([]);
      setAgreeRules(false);
      setDeclinedOffer(null);
      setMyStatus('pending');
      sounds.success();
      toast.success('Join request sent! The admin will review it — you will be notified. 🎉');
    } catch (e) { toast.error(`Could not send request: ${e.message || 'try again'}`); }
    setJoining(false);
  };

  const isAdmin = me?.email && group.admin_email && me.email.toLowerCase() === group.admin_email.toLowerCase();
  const isMember = myStatus === 'approved' || isAdmin;
  // 🏁 Nothing is due before the group is FULL — the rotation clock starts then
  const clockGroup = withRotationClock(group, members);
  const period = clockGroup ? currentPeriod(clockGroup) : 0;
  const N = cycleLength(group);
  const label = periodLabel(group.frequency, group.frequency_days);
  const spotMap = buildSpotMap(members);
  const mySpots = myMember ? parseSpots(myMember.spots) : [];
  // Members sorted by the spots they hold — used by the checkbox payment tracker
  const payingMembers = (members || [])
    .filter(m => parseSpots(m.spots).length > 0)
    .sort((a, b) => Math.min(...parseSpots(a.spots)) - Math.min(...parseSpots(b.spots)));
  // Open spots with estimated payout dates — shown to visitors BEFORE they join
  const openSpots = Array.from({ length: N }, (_, i) => i + 1).filter(sp => !(sp in spotMap));
  const daysPerPeriod = periodDays(group.frequency, group.frequency_days);
  const expectedPayout = payoutPerSpot(group);
  const autoSpots = adminAutoSpots(group, spotMap); // 👑 admin-held spots that tick themselves paid
  const adminMoney = adminInterest(group);
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
      // 🧾 Post the receipt into the group chat — everyone sees the image, and the
      // APPROVED / DECLINED stamp lands on it the moment the admin reviews it
      try {
        await supabase.from('group_messages').insert({
          id: `gm-${row.id}`, group_id: params.id, from_email: row.user_email,
          body: `🧾 ${row.member_name || row.user_email} paid ₦${receiptAmount.toLocaleString()} — spot${paySpots.length > 1 ? 's' : ''} #${paySpots.join(', #')} (${payWeeks} ${label}${payWeeks > 1 ? 's' : ''})`,
          image_url: receiptData, payment_id: row.id, receipt_status: 'pending',
        });
      } catch {}
      setPayments([row, ...payments]);
      setReceiptData(null); setReceiptName(''); setPayWeeks(1);
      sounds.success();
      toast.success('Receipt sent! The admin will review it shortly — you will be notified.');
    } catch (e) { sounds.error(); toast.error(`Upload failed: ${e.message || 'try again'}`); }
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
                <GroupBadge verified={group.is_verified} tier={group.badge_tier} className="w-6 h-6 drop-shadow-md shrink-0" />
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

        {/* ❄️ Frozen by PayRound — everything in this group is paused */}
        {frozen && (
          <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4 mb-6 flex items-start gap-3">
            <span className="text-2xl shrink-0">❄️</span>
            <div>
              <p className="text-sm font-bold text-sky-900">This group is frozen</p>
              <p className="text-xs text-sky-800 mt-0.5">PayRound has paused this group — joining, payments and chat are on hold for now. You can still view the board and your history. Questions? Contact PayRound support on WhatsApp: <b>+234 915 1723 199</b></p>
            </div>
          </div>
        )}

        {/* 🏦 Where members pay — the group admin's bank, always pinned at the top of the group */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-6">
          <p className="text-xs font-bold text-emerald-800 mb-1">🏦 ADMIN BANK — send your contribution here</p>
          {adminProfile && (adminProfile.bank_name || adminProfile.account_number || adminProfile.account_name) ? (
            <div className="text-sm text-gray-900 space-y-0.5">
              {adminProfile.bank_name && <p><span className="text-gray-500 text-xs">Bank:</span> <b>{adminProfile.bank_name}</b></p>}
              {adminProfile.account_number && (
                <p className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs">Account No:</span>
                  <b className="font-mono text-base tracking-wide">{adminProfile.account_number}</b>
                  <button
                    onClick={() => { try { navigator.clipboard.writeText(adminProfile.account_number); toast.success('Account number copied!'); } catch {} }}
                    className="text-[10px] font-semibold text-emerald-700 border border-emerald-200 bg-white px-2 py-0.5 rounded-full hover:bg-emerald-100"
                  >Copy</button>
                </p>
              )}
              {adminProfile.account_name && <p><span className="text-gray-500 text-xs">Account Name:</span> <b>{adminProfile.account_name}</b></p>}
              {adminProfile.payment_remark && <p className="pt-0.5"><span className="text-gray-500 text-xs">📝 Payment remark:</span> <b>{adminProfile.payment_remark}</b></p>}
            </div>
          ) : isAdmin ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2">
              ⚠️ You haven&apos;t added your bank details — members need them to pay you.
              <button onClick={() => router.push('/settings')} className="font-bold underline whitespace-nowrap">Add in Settings →</button>
            </p>
          ) : (
            <p className="text-xs text-gray-600">The admin hasn&apos;t added their bank details yet — please ask them to add it in their Settings.</p>
          )}
        </div>

        {/* Real stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiCurrencyDollar className="w-4 h-4 text-primary-500" /> Contribution</div>
            <p className="text-lg font-bold text-gray-900">₦{Number(group.amount || 0).toLocaleString()}</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-0.5">💰 you collect ₦{expectedPayout.toLocaleString()} / spot on your turn</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiCalendar className="w-4 h-4 text-primary-500" /> Frequency</div>
            <p className="text-lg font-bold text-gray-900">{frequencyLabel(group)}</p>
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
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiUser className="w-4 h-4 text-primary-500" /> Group Admin {adminProfile && <span className="text-[10px] text-primary-600 font-semibold">• Tap to view profile →</span>}</div>
            <p className="text-lg font-bold text-gray-900 truncate">{group.admin_name || '—'}</p>
            {adminProfile?.phone && (
              <a href={`tel:${adminProfile.phone}`} onClick={e => e.stopPropagation()} className="text-xs text-primary-600 font-semibold mt-0.5 inline-flex items-center gap-1 hover:text-primary-700">
                📞 {adminProfile.phone}
              </a>
            )}
          </button>
        </div>

        {/* ✏️ Group admin tools — edit details (reviewed by PayRound) / payments */}
        {isAdmin && (
          <div className="flex gap-2 mb-6">
            <button onClick={() => router.push(`/dashboard/admin/${group.id}/edit`)} className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-semibold py-3 rounded-xl hover:border-primary-300 hover:text-primary-700 flex items-center justify-center gap-2">
              ✏️ Edit Group
            </button>
            <button onClick={() => router.push(`/dashboard/admin/${group.id}/payments`)} className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-semibold py-3 rounded-xl hover:border-primary-300 hover:text-primary-700 flex items-center justify-center gap-2">
              💳 Payments
            </button>
          </div>
        )}

        {/* 👑 ADMIN EYES ONLY — interest + the things only the admin can see & change */}
        {isAdmin && (
          <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-5 mb-6">
            <p className="text-sm font-bold text-amber-900 flex items-center gap-2 flex-wrap">👑 Your interest <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full badge-emboss">ONLY YOU CAN SEE THIS</span></p>
            <div className="mt-2 space-y-1 text-xs text-amber-900">
              <p>Collected from all spots every {label}: <b>₦{adminMoney.collected.toLocaleString()}</b> (₦{Number(group.amount || 0).toLocaleString()} × {N} spots)</p>
              <p>Paid out to each spot on its turn: <b>₦{adminMoney.payout.toLocaleString()}</b>{!adminMoney.hasCustomPayout && <span className="text-amber-700"> (currently the full pot — set a payout amount in Edit Group)</span>}</p>
              {adminMoney.perRound > 0 ? (
                <p className="text-sm font-bold text-amber-900 bg-amber-100/80 border border-amber-300 rounded-xl px-3 py-2 mt-1.5">Your interest: ₦{adminMoney.perRound.toLocaleString()} every {label} · <span className="text-emerald-800">₦{adminMoney.perCycle.toLocaleString()} per full cycle</span> ({N} {label}s)</p>
              ) : adminMoney.perRound === 0 ? (
                <p className="text-[11px] text-amber-700 mt-1.5">Interest right now: <b>₦0</b> — payouts equal the full pot. Set a payout amount in Edit Group to start earning an interest.</p>
              ) : (
                <p className="text-[11px] text-red-600 font-semibold mt-1.5">⚠️ The payout (₦{adminMoney.payout.toLocaleString()}) is HIGHER than the ₦{adminMoney.collected.toLocaleString()} collected each {label} — the pot would run short. Lower the payout in Edit Group.</p>
              )}
              <button onClick={() => router.push(`/dashboard/admin/${group.id}/edit`)} className="text-[11px] font-bold text-amber-800 underline underline-offset-2 mt-1">Change the payout amount in Edit Group →</button>
            </div>
            <div className="mt-4 pt-3 border-t border-amber-200/70 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div>
                <p className="font-bold text-amber-900 mb-1">👁 Only YOU can see</p>
                <ul className="space-y-0.5 list-disc list-inside text-amber-800">
                  <li>this interest panel</li>
                  <li>members&apos; phone numbers (Members tab)</li>
                  <li>join requests &amp; their contact details</li>
                  <li>receipts waiting for your review</li>
                </ul>
              </div>
              <div>
                <p className="font-bold text-amber-900 mb-1">✏️ Only YOU can change</p>
                <ul className="space-y-0.5 list-disc list-inside text-amber-800">
                  <li>group details &amp; payout amount (PayRound reviews)</li>
                  <li>member spots &amp; spot offers</li>
                  <li>approve / decline receipts, mark payouts collected</li>
                  <li>group rules, open/lock chat, delete group</li>
                </ul>
              </div>
            </div>
            <p className="text-[10px] text-amber-700/80 mt-3">Members only ever see their expected payout per spot — never your interest.</p>
          </div>
        )}

        {/* 📜 Group Rules — visible to EVERYONE before joining */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><HiDocumentText className="w-5 h-5 text-primary-600" /> Group Rules</h2>
            {isAdmin && !editingRules && (
              <button onClick={() => { setRulesText(group.rules || ''); setEditingRules(true); }} className="text-xs font-semibold text-primary-600 border border-primary-100 bg-primary-50 px-3 py-1.5 rounded-full hover:bg-primary-100">✏️ {group.rules ? 'Edit rules' : 'Add rules'}</button>
            )}
          </div>
          {editingRules ? (
            <div>
              <textarea
                value={rulesText}
                onChange={e => setRulesText(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Write your group rules here — every user sees them before joining. E.g. payment days, late fees, receipt rules, meeting times…"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="flex gap-2 mt-3">
                <button onClick={saveRules} disabled={savingRules} className="bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 disabled:opacity-50">{savingRules ? 'Saving…' : 'Save Rules'}</button>
                <button onClick={() => setEditingRules(false)} className="border border-gray-200 text-gray-600 text-sm px-5 py-2.5 rounded-xl hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {group.rules ? (
                <p className="text-sm text-gray-700 whitespace-pre-line">{group.rules}</p>
              ) : (
                <p className="text-sm text-gray-500">The admin of this group hasn&apos;t added their own rules yet — the standard PayRound rules below apply.</p>
              )}
              <ul className="mt-3 pt-3 border-t border-gray-50 space-y-1.5 text-xs text-gray-500">
                <li className="flex items-start gap-2"><HiCheckCircle className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" /> Pay your contribution on time every cycle.</li>
                <li className="flex items-start gap-2"><HiCheckCircle className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" /> Upload your payment receipt after every payment — the admin confirms it.</li>
                <li className="flex items-start gap-2"><HiCheckCircle className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" /> Payouts follow your spot number in the rotation order.</li>
                <li className="flex items-start gap-2"><HiCheckCircle className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" /> Respect every member — take any dispute to the group admin first.</li>
              </ul>
            </>
          )}
        </div>

        {/* 🪑 Pick your spots & join — the whole join flow lives right here on the group page */}
        {!frozen && !isMember && myStatus !== 'offered' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2"><HiCalendar className="w-5 h-5 text-primary-600" /> Available Spots — Tap to Pick Yours</h2>
            {myStatus === 'pending' ? (
              <p className="text-sm font-medium text-amber-700 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3"><HiClock className="w-5 h-5 shrink-0" /> Your join request is awaiting the admin&apos;s approval — you&apos;ll get a notification.</p>
            ) : openSpots.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">All {N} spots are currently taken — this group is full for this round. Check back after the next payout round!</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  <b>{openSpots.length} of {N} spot{N === 1 ? '' : 's'} still open.</b> Tap a green spot to choose it — you can hold several:
                  each spot pays <b>₦{Number(group.amount || 0).toLocaleString()}</b> every {label} and collects <b>₦{expectedPayout.toLocaleString()}</b> when its turn comes.
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 mb-3">
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Open — tap to pick</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Taken — shows the holder&apos;s name</span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 mb-2">
                  {Array.from({ length: N }, (_, i) => i + 1).map(spot => {
                    const taken = spot in spotMap;
                    const on = desiredSpots.includes(spot);
                    return (
                      <button
                        key={spot}
                        type="button"
                        disabled={taken}
                        onClick={() => toggleDesiredSpot(spot)}
                        title={taken ? `Spot #${spot} is taken` : on ? `Picked — tap to remove. Payout: ${spot * daysPerPeriod} days after savings start` : `Pick spot #${spot} — payout ${spot * daysPerPeriod} days after savings start`}
                        className={`h-11 rounded-lg text-sm font-bold transition-all flex flex-col items-center justify-center leading-tight ${
                          taken
                            ? 'bg-red-500 text-white border border-red-600 cursor-not-allowed'
                            : on
                              ? 'bg-emerald-600 text-white border border-emerald-600 badge-emboss ring-2 ring-emerald-300'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        <span className={taken ? 'line-through text-[11px]' : ''}>#{spot}{!taken && on ? ' ✓' : ''}</span>
                        {taken && <span className="text-[8px] font-semibold text-white/95 truncate max-w-full px-0.5">{(spotMap[spot]?.member_name || 'Taken').split(' ')[0]}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mb-3">
                  Each later spot pays out one {label} later: <b>#1 → {daysPerPeriod} days</b> after savings start · <b>#2 → {2 * daysPerPeriod} days</b> · <b>#3 → {3 * daysPerPeriod} days</b> …
                  Exact dates can&apos;t be fixed yet — <b>savings start when the group is full</b>; that&apos;s when the payout clock starts.
                  Your expected payout: <b className="text-emerald-700">₦{expectedPayout.toLocaleString()} per spot</b> when its turn comes.
                </p>
                {desiredSpots.length > 0 && (
                  <p className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 mb-3">
                    You picked spot{desiredSpots.length > 1 ? 's' : ''} <b>#{desiredSpots.join(', #')}</b> → you pay <b>₦{((group.amount || 0) * desiredSpots.length).toLocaleString()}</b> every {label} and collect <b>{desiredSpots.length}</b> payout{desiredSpots.length > 1 ? 's' : ''} worth <b>₦{expectedPayout.toLocaleString()}</b> each (₦{(expectedPayout * desiredSpots.length).toLocaleString()} in total)
                    {' '}({desiredSpots.map(x => `#${x}: ${x * daysPerPeriod} days after savings start`).join(' · ')}).
                    The admin grants these exact spots if still free — otherwise they offer you an alternative and <b>you</b> accept or decline.
                  </p>
                )}
              </>
            )}
            {isLive && myStatus !== 'pending' && openSpots.length > 0 && (
              <>
                {myStatus === 'declined' && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5 mb-3">You declined the last spot offer — pick your spot(s) above and send a brand-new request below.</p>
                )}
                <label className="flex items-start gap-3 p-3 bg-primary-50 rounded-xl mb-3 cursor-pointer">
                  <input type="checkbox" checked={agreeRules} onChange={e => setAgreeRules(e.target.checked)} className="w-5 h-5 mt-0.5 text-primary-600 rounded focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">I have read and agree to the <b>group rules</b> and contribution terms above.</span>
                </label>
                {me ? (
                  <>
                    <button
                      onClick={submitJoinRequest}
                      disabled={!agreeRules || joining}
                      className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joining ? 'Sending…' : myStatus === 'declined' ? 'Send a New Join Request' : `Request to Join${desiredSpots.length ? ` — #${desiredSpots.join(', #')}` : ''}`}
                    </button>
                    <p className="text-[11px] text-gray-400 mt-2 text-center">
                      No forms, no typing — your name, phone and email are pulled straight from your profile and shown to this group&apos;s admin only.
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/groups/${group.id}`)}`)}
                      className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
                    >
                      Log In to Join
                    </button>
                    <p className="text-[11px] text-gray-400 mt-2 text-center">
                      Already have an account? Just log in — your details fill in automatically. New to PayRound? You can create one in under a minute.
                    </p>
                  </>
                )}
              </>
            )}
            {!isLive && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2"><HiClock className="w-4 h-4 shrink-0" /> This group is still under PayRound review — joining opens once it goes live.</p>
            )}
          </div>
        )}

        {/* 👑 Admins can hold spots & contribute in their own group too */}
        {isAdmin && !myMember && !frozen && (
          <div className="bg-white rounded-2xl border-2 border-primary-200 p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-1">👑 Join your own group as a member</h2>
            <p className="text-xs text-gray-500 mb-3">
              You run this group — but you can also hold spot(s) and contribute like any member.
              You&apos;ll upload receipts the same way, and your green boxes tick when you approve your own receipt in the Payments tab.
            </p>
            {openSpots.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">No open spots left — the group is already full.</p>
            ) : (
              <>
                <p className="text-[11px] text-gray-500 mb-2">Tap the green spot(s) you want to hold ({openSpots.length} of {N} open):</p>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 mb-3">
                  {Array.from({ length: N }, (_, i) => i + 1).map(spot => {
                    const taken = spot in spotMap;
                    const on = desiredSpots.includes(spot);
                    return (
                      <button
                        key={spot}
                        type="button"
                        disabled={taken}
                        onClick={() => toggleDesiredSpot(spot)}
                        title={taken ? `Spot #${spot} is taken` : `Hold spot #${spot} yourself`}
                        className={`h-11 rounded-lg text-sm font-bold transition-all flex flex-col items-center justify-center leading-tight ${
                          taken
                            ? 'bg-red-500 text-white border border-red-600 cursor-not-allowed'
                            : on
                              ? 'bg-emerald-600 text-white border border-emerald-600 badge-emboss ring-2 ring-emerald-300'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        <span className={taken ? 'line-through text-[11px]' : ''}>#{spot}{!taken && on ? ' ✓' : ''}</span>
                        {taken && <span className="text-[8px] font-semibold text-white/95 truncate max-w-full px-0.5">{(spotMap[spot]?.member_name || 'Taken').split(' ')[0]}</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={adminJoinOwnGroup}
                  disabled={desiredSpots.length === 0 || joining}
                  className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {joining ? 'Joining…' : `Join as Member${desiredSpots.length ? ` — take spot(s) #${desiredSpots.join(', #')}` : ''}`}
                </button>
                <p className="text-[11px] text-gray-400 mt-2 text-center">Instant — no approval needed, you are the admin. You&apos;ll appear in the Members list and Payment Tracker like everyone else.</p>
              </>
            )}
          </div>
        )}

        {/* 🪑 Spot offer waiting for MY answer — shown prominently before anything else */}
        {!frozen && myStatus === 'offered' && myOffer && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-1">🪑 The admin offered you a spot</h2>
            <p className="text-sm text-gray-700 mb-1">
              You asked for spot{parseSpots(myOffer.desired_spots).length > 1 ? 's' : ''} <b>#{parseSpots(myOffer.desired_spots).join(', #') || '—'}</b>.
            </p>
            <p className="text-sm text-gray-900 mb-4">
              The admin offers you spot{parseSpots(myOffer.offered_spots).length > 1 ? 's' : ''} <b className="text-emerald-700">#{parseSpots(myOffer.offered_spots).join(', #')}</b> instead.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button onClick={acceptOffer} disabled={offerBusy} className="flex-1 bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50">✔ Accept & Join</button>
              <button onClick={declineOffer} disabled={offerBusy} className="flex-1 bg-white text-red-600 border border-red-200 font-semibold py-3 rounded-xl hover:bg-red-50 transition-all disabled:opacity-50">✖ Decline — Don&apos;t Join</button>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Accepting puts you straight into the group with those spots. Declining means you don&apos;t join — the admin is notified either way.</p>
          </div>
        )}

        {/* Approved member? Straight to the dashboard */}
        {myStatus === 'approved' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-emerald-700 flex items-center gap-2"><HiCheckCircle className="w-5 h-5" /> You&apos;re a member of this group</p>
              <button onClick={() => router.push('/dashboard')} className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all">Open Dashboard</button>
            </div>
          </div>
        )}

        {/* ===== MEMBER AREA: rotation board + receipt upload + history (visible to everyone in the group) ===== */}
        {isMember && (
          <>
            {/* Rotation & payout board */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-6">
              <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><HiCurrencyDollar className="w-5 h-5 text-primary-600" /> Rotation & Payout Board</h2>
              <p className="text-xs text-gray-500 mb-1">
                All members can see this board. Spot #k collects the pot at {label} k — every spot pays its <strong>own</strong> contribution each {label},
                so a member holding several spots pays for each of them and collects several payouts.
              </p>
              {clockGroup
                ? <p className="text-xs text-gray-500 mb-4">Current {label}: <strong>{Math.min(period, N)} of {N}</strong> (the clock started when the group became full)</p>
                : <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-semibold mb-4 mt-1.5">⏳ Nothing is due yet — the contribution clock starts automatically when all {N} spots are filled ({Object.keys(spotMap).length}/{N} taken so far).</p>}
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
                      const paid = paidWeeksEffective(payments, spot, autoSpots, period);
                      const collected = payoutForSpot(payouts, spot);
                      const mine = mySpots.includes(spot);
                      return (
                        <tr key={spot} className={`border-b border-gray-50 ${mine ? 'bg-primary-50/40' : ''}`}>
                          <td className="py-2.5 pr-3 font-bold text-gray-900">#{spot}{mine && <span className="ml-1 text-[10px] text-primary-600 font-semibold">YOU</span>}</td>
                          <td className="py-2.5 pr-3 font-bold text-gray-900 text-sm">{holder ? (holder.member_name || 'Member') : <span className="text-gray-300 font-normal">Open spot</span>}</td>
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

            {/* ✅ Payment Tracker — members listed by their spots; every admin approval ticks the next box green */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><HiCheckCircle className="w-5 h-5 text-emerald-500" /> Payment Tracker</h2>
                {isAdmin && mySpots.length > 0 && (
                  <button
                    onClick={toggleAutoTick}
                    disabled={autoTickBusy}
                    title="Your own spots tick themselves paid every round — no receipts needed from you. Tap to switch off."
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${group.admin_auto_paid !== false ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                  >
                    👑 Auto-tick my spots (#${mySpots.join(', #')}) {group.admin_auto_paid !== false ? 'ON' : 'OFF'}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Members are listed by the spots they hold. Each spot must pay <strong>{N} times</strong> (one per {label}), so it shows <strong>{N} boxes</strong>.
                Every time the admin approves a receipt, the next box(es) turn <span className="text-emerald-600 font-semibold">green ✓</span> automatically —
                paying several {label}s upfront ticks several boxes at once. Only people in this group can see this.
              </p>
              {payingMembers.length === 0 ? (
                <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">No spots assigned yet — once the admin assigns spots, the tracker appears here.</p>
              ) : (
                <div className="space-y-4">
                  {payingMembers.map(m => {
                    const spots = parseSpots(m.spots);
                    const itsMe = !!myMember && m.id === myMember.id;
                    return (
                      <div key={m.id} className={`rounded-xl border p-3 ${itsMe ? 'border-primary-200 bg-primary-50/40' : 'border-gray-100'}`}>
                        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                          <span className="truncate">{m.member_name || 'Member'}</span>
                          {itsMe && <span className="text-[10px] text-primary-600 font-bold shrink-0">YOU</span>}
                          <span className="text-[10px] font-normal text-gray-400 shrink-0">{spots.length === 1 ? '1 spot' : `${spots.length} spots`}</span>
                        </p>
                        <div className="mt-2 space-y-2.5">
                          {spots.map(spot => {
                            const paid = Math.min(N, paidWeeksEffective(payments, spot, autoSpots, period));
                            return (
                              <div key={spot}>
                                <p className="text-[11px] font-semibold text-gray-600 mb-1">
                                  Spot #{spot} · ₦{Number(group.amount || 0).toLocaleString()} × {N} {label}s ·{' '}
                                  <span className={paid >= N ? 'text-emerald-600' : 'text-gray-400'}>{paid}/{N} paid{paid >= N ? ' ✅' : ''}</span>
                                  {autoSpots.includes(spot) && <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">👑 auto</span>}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from({ length: N }, (_, i) => (
                                    <span
                                      key={i}
                                      title={`${label} ${i + 1} — ${i < paid ? 'paid (admin approved)' : 'not paid yet'}`}
                                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${i < paid ? 'bg-emerald-500 text-white badge-emboss' : 'bg-white border border-gray-200 text-gray-300'}`}
                                    >
                                      {i < paid ? '✓' : i + 1}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upload receipt */}
            {myMember && !frozen && (
              <div id="pay-card" className="bg-white rounded-2xl border border-gray-100 p-6 mt-6 scroll-mt-24">
                <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><HiUpload className="w-5 h-5 text-primary-600" /> Pay Your Contribution</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Choose the spot(s) you are paying for and how many {label}s the payment covers — paying for several {label}s upfront is allowed.
                  The admin reviews your receipt and marks you paid.
                </p>
                {isAdmin && autoSpots.length > 0 && (
                  <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 mb-3 font-semibold">👑 Your own spot(s) #{autoSpots.join(', #')} tick themselves paid every {label} — you don&apos;t need receipts for them (toggle it off in the Payment Tracker above if you prefer uploading receipts).</p>
                )}
                {adminProfile && (adminProfile.bank_name || adminProfile.account_number) && (
                  <p className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-2.5 mb-4">
                    🏦 Pay to: <b>{adminProfile.bank_name || '—'}</b> • <b className="font-mono">{adminProfile.account_number || '—'}</b> • {adminProfile.account_name || adminProfile.name}
                    {adminProfile.payment_remark && <span className="block mt-0.5">📝 Remark: <b>{adminProfile.payment_remark}</b></span>}
                  </p>
                )}
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
