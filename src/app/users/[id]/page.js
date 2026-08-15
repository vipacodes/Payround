'use client';

import { useState, useEffect } from 'react';
import GroupBadge from '@/components/GroupBadge';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import ImageLightbox from '@/components/ImageLightbox';
import {
  HiArrowLeft, HiBadgeCheck, HiUserGroup, HiCalendar,
  HiShieldCheck, HiUser, HiCheck, HiUserAdd, HiPhone, HiChatAlt2,
  HiGift, HiClock, HiCheckCircle
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import FollowersList from '@/components/FollowersList';
import ShareButton, { siteUrl } from '@/components/ShareSheet';



export default function PublicUserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const [person, setPerson] = useState(null);
  const [groupsAdmin, setGroupsAdmin] = useState([]);
  const [groupsMember, setGroupsMember] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [meEmail, setMeEmail] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busyFollow, setBusyFollow] = useState(false);
  const [bizAds, setBizAds] = useState([]); // approved businesses this person runs on PayRound
  const [showFollowers, setShowFollowers] = useState(false);
  const [profileExtras, setProfileExtras] = useState(null); // privacy-safe DOB/referral projection

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        let u = null;
        const sel = 'id, name, email, phone, profile_pic, is_verified, role, created_at, bank_name, account_number, account_name';
        const byId = await supabase.from('users').select(sel).eq('id', params.id).maybeSingle();
        u = byId.data;
        if (!u && String(params.id || '').length >= 6) {
          const { data: list } = await supabase.from('users').select(sel).ilike('id', `${params.id}%`).limit(2);
          if (list && list.length === 1) u = list[0];
        }
        if (!mounted) return;
        if (!u) { setNotFound(true); setLoading(false); return; }
        setPerson(u);
        try {
          const { data: extras } = await supabase.rpc('get_public_profile_extras', { p_user_id: u.id });
          if (mounted) setProfileExtras(extras || null);
        } catch { if (mounted) setProfileExtras(null); }
        const email = (u.email || '').toLowerCase(); // used only to fetch their groups — never displayed
        // Groups they admin
        const { data: ag } = await supabase.from('groups').select('id, name, avatar_url, is_verified, badge_tier, amount, frequency').eq('admin_email', email).in('status', ['active', 'approved']);
        // Public memberships (approved only)
        const { data: mems } = await supabase.from('members').select('group_id').eq('member_email', email).in('status', ['active', 'approved']);
        if (!mounted) return;
        setGroupsAdmin(ag || []);

        // Their PUBLIC business profile(s) on PayRound — only after the owner approved the business
        try {
          const { data: biz } = await supabase.from('ads').select('id, business_name').eq('submitter_email', email).eq('biz_status', 'approved');
          if (mounted) setBizAds(biz || []);
        } catch {}

        // Follow stats — visible to the public
        const { data: fols } = await supabase.from('follows').select('follower_email').eq('following_id', String(u.id));
        if (mounted) setFollowers((fols || []).length);
        try {
          const stored = localStorage.getItem('payround_user');
          if (stored) {
            const e = (JSON.parse(stored).email || '').toLowerCase();
            if (mounted) {
              setMeEmail(e);
              setIsFollowing((fols || []).some(f => (f.follower_email || '').toLowerCase() === e));
            }
          }
        } catch {}
        if (mems && mems.length > 0) {
          const ids = mems.map(m => m.group_id);
          const { data: gs } = await supabase.from('groups').select('id, name, avatar_url, is_verified, badge_tier, amount, frequency').in('id', ids).in('status', ['active', 'approved']);
          if (mounted) setGroupsMember(gs || []);
        }
      } catch (e) {
        if (mounted) setNotFound(true);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [params.id]);

  const isSupport = (person?.email || '').toLowerCase() === 'payroundsupport@gmail.com';
  const phonePublic = !!person?.phone && (groupsAdmin.length > 0 || isSupport);

  const toggleFollow = async () => {
    if (!meEmail) { toast.error('Log in to follow people.'); router.push('/login'); return; }
    setBusyFollow(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      if (isFollowing) {
        const { error } = await supabase.from('follows').delete().eq('follower_email', meEmail).eq('following_id', String(person.id));
        if (error) throw error;
        setIsFollowing(false); setFollowers(c => Math.max(0, c - 1));
      } else {
        const { error } = await supabase.from('follows').insert({
          id: `fol-${Date.now()}`, follower_email: meEmail,
          following_id: String(person.id), following_email: (person.email || '').toLowerCase(),
        });
        if (error) throw error;
        setIsFollowing(true); setFollowers(c => c + 1);
        // name the follower in their notification + carry the email so tapping opens
        // THEIR followers list with this person scrolled into view & highlighted 🎉
        let followerName = '';
        try {
          const { data: meRow } = await supabase.from('users').select('name').eq('email', meEmail).maybeSingle();
          followerName = (meRow?.name || '').trim();
        } catch {}
        await supabase.from('notifications').insert({
          id: `foll-${Date.now()}`, type: 'new_follower', is_read: false,
          user_email: (person.email || '').toLowerCase(),
          message: `➕ ${followerName || 'Someone'} started following you on PayRound — tap to see them in your followers list.[[FOL:${meEmail}]]`,
        });
      }
    } catch (e) { toast.error(`Could not update follow: ${e.message || 'try again'}`); }
    setBusyFollow(false);
  };

  if (loading) {
    return <LoadingScreen label="Loading profile…" />;
  }

  if (notFound || !person) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiUser className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">User Not Found</h2>
            <p className="text-gray-500 mb-4">This profile doesn&apos;t exist.</p>
            <button onClick={() => router.push('/groups/search?tab=users')} className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all">Search People</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const GroupRow = ({ g, admin }) => (
    <button onClick={() => router.push(`/groups/${g.id}`)} className="w-full bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 text-left card-hover">
      {g.avatar_url
        ? <img src={g.avatar_url} alt={g.name} className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />
        : <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0"><span className="text-primary-700 font-bold">{g.name.charAt(0)}</span></div>}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
          {g.name}
          <GroupBadge verified={g.is_verified} tier={g.badge_tier} className="w-4 h-4 shrink-0" />
        </p>
        <p className="text-xs text-gray-500">₦{Number(g.amount || 0).toLocaleString()} • {g.frequency || 'Weekly'}{admin ? ' • 👑 they admin' : ''}</p>
      </div>
      <span className="text-sm font-medium text-primary-600 shrink-0">View →</span>
    </button>
  );

  // Admins are often members of their own group too — count each group ONCE,
  // exactly like the list below renders it (deduped), so the number always matches the cards.
  const groupsMemberOnly = groupsMember.filter(g => !groupsAdmin.find(x => x.id === g.id));
  const groupsTotal = groupsAdmin.length + groupsMemberOnly.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 mb-6 text-center">
          <div className="mx-auto w-28 h-28 mb-4">
            {person.profile_pic
              ? <img src={person.profile_pic} alt={person.name} onClick={() => setZoom(true)} title="Tap to expand" className="w-28 h-28 rounded-3xl object-cover border border-gray-200 shadow-sm cursor-zoom-in hover:opacity-90" />
              : <div className="w-28 h-28 rounded-3xl bg-primary-600 flex items-center justify-center shadow-sm"><span className="text-white font-bold text-4xl">{(person.name || 'U').charAt(0).toUpperCase()}</span></div>}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
            {person.name}
            {person.is_verified && <HiBadgeCheck className="w-8 h-8 text-blue-500 shrink-0 badge-emboss" title="Verified by PayRound" />}
          </h1>
          {person.id && (
            <p className="text-[12px] text-purple-700 font-mono font-bold mt-1">
              Unique ID: {String(person.id).slice(0, 8)}
            </p>
          )}
          <div className="mt-3">
            <ShareButton
              compact
              label="Share profile"
              title={person.name || 'PayRound profile'}
              text={`See ${person.name || 'this saver'} on PayRound. Unique ID: ${String(person.id || '').slice(0, 8)}`}
              url={siteUrl(`/users/${person.id}`)}
            />
          </div>
          {person.is_verified && (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5 mt-3">
              <HiShieldCheck className="w-4 h-4" /> Verified by PayRound
            </p>
          )}
          {phonePublic && (
            <a href={`tel:${person.phone}`} className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200 text-primary-700 text-sm font-semibold px-4 py-2 rounded-full mt-3 hover:bg-primary-100 transition-colors">
              <HiPhone className="w-4 h-4" /> {person.phone} <span className="text-[10px] font-normal text-primary-500">• {isSupport ? 'PayRound support line' : 'Group admin contact'}</span>
            </a>
          )}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => setShowFollowers(true)} title="See who follows them"
              className="text-sm font-semibold text-gray-900 hover:text-primary-600 transition-colors">
              {followers} <span className="text-xs font-normal text-gray-500">Follower{followers === 1 ? '' : 's'}</span>
            </button>
            {meEmail && meEmail !== (person.email || '').toLowerCase() && (
              <button
                onClick={() => router.push(`/messages?to=${encodeURIComponent((person.email || '').toLowerCase())}`)}
                title="Send them a message"
                className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition-all"
              >
                <HiChatAlt2 className="w-4 h-4" /> Message
              </button>
            )}
            {(!meEmail || meEmail !== (person.email || '').toLowerCase()) && (
              <button
                onClick={toggleFollow}
                disabled={busyFollow}
                className={`flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-full transition-all disabled:opacity-50 ${isFollowing ? 'bg-gray-100 text-gray-600 border border-gray-200' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-md shadow-primary-200'}`}
              >
                {isFollowing ? <><HiCheck className="w-4 h-4" /> Following</> : <><HiUserAdd className="w-4 h-4" /> Follow</>}
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-4">
            <HiCalendar className="w-4 h-4" />
            Member since {person.created_at ? new Date(person.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : '—'}
          </div>
          {profileExtras?.dob_visible && profileExtras?.dob && (
            <p className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 mt-3">
              <HiCalendar className="w-4 h-4" /> Date of birth: {new Date(`${profileExtras.dob}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Their bank details — so members can pay them (and admins can pay payouts) */}
        {(person.bank_name || person.account_number || person.account_name) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <p className="text-xs font-bold text-gray-500 mb-2">🏦 BANK DETAILS</p>
            <div className="space-y-1.5 text-sm">
              {person.bank_name && <p className="text-gray-900"><span className="text-gray-400 text-xs">Bank:</span> <b>{person.bank_name}</b></p>}
              {person.account_number && (
                <p className="text-gray-900 flex items-center gap-2">
                  <span className="text-gray-400 text-xs">Account No:</span>
                  <b className="font-mono tracking-wide">{person.account_number}</b>
                  <button
                    onClick={() => { try { navigator.clipboard.writeText(person.account_number); toast.success('Account number copied!'); } catch {} }}
                    className="text-[10px] font-semibold text-primary-600 border border-primary-100 bg-primary-50 px-2 py-0.5 rounded-full hover:bg-primary-100"
                  >Copy</button>
                </p>
              )}
              {person.account_name && <p className="text-gray-900"><span className="text-gray-400 text-xs">Account Name:</span> <b>{person.account_name}</b></p>}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Use these details to send them group contributions or payouts.</p>
          </div>
        )}

        {/* Their business profile(s) — personal profile shows first, business one tap away */}
        {bizAds.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <p className="text-xs font-bold text-gray-500 mb-2">🏪 BUSINESS ON PAYROUND</p>
            <div className="space-y-2">
              {bizAds.map(b => (
                <button key={b.id} onClick={() => router.push(`/business/${b.id}`)}
                  className="w-full flex items-center gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-gold-200 rounded-xl px-4 py-3 text-left hover:shadow-md transition-all">
                  <span className="w-9 h-9 bg-gold-100 rounded-lg flex items-center justify-center text-gold-700 font-bold shrink-0">{(b.business_name || 'B').charAt(0)}</span>
                  <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">{b.business_name}</span>
                  <span className="text-xs font-bold text-gold-700 shrink-0">View Business →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Referral list appears only after this person explicitly makes it public. */}
        {profileExtras?.referrals_visible && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <HiGift className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="text-xs font-bold text-gray-500">REFERRALS</p>
                  <p className="text-sm font-bold text-gray-900">₦{Number(profileExtras.total_earnings || 0).toLocaleString('en-NG')} total earnings</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-500">{Number(profileExtras.referral_count || 0)} people</span>
            </div>
            {(profileExtras.referrals || []).length === 0 ? (
              <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">No referrals listed yet.</p>
            ) : (
              <div className="space-y-2">
                {(profileExtras.referrals || []).map(row => (
                  <button key={row.user_id} onClick={() => router.push(`/users/${row.user_id}`)} className="w-full flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3 text-left hover:bg-gray-100 transition-colors">
                    {row.profile_pic ? (
                      <img src={row.profile_pic} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">{(row.name || 'P').charAt(0).toUpperCase()}</span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{row.name || 'PayRound member'}</span>
                      <span className="block text-[10px] text-gray-400">Referred {row.referred_at ? new Date(row.referred_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                    </span>
                    {row.status === 'awarded' && Number(row.bonus_amount || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 shrink-0"><HiCheckCircle className="w-3 h-3" /> ₦{Number(row.bonus_amount).toLocaleString('en-NG')} paid</span>
                    ) : row.status === 'pending' && Number(row.bonus_amount || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 shrink-0"><HiClock className="w-3 h-3" /> ₦{Number(row.bonus_amount).toLocaleString('en-NG')} pending</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-gray-400 shrink-0">Not qualified</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Their groups */}
        <div className="mb-3 flex items-center gap-2">
          <HiUserGroup className="w-5 h-5 text-primary-600" />
          <h2 className="font-bold text-gray-900">Groups ({groupsTotal})</h2>
        </div>
        {groupsTotal > 0 ? (
          <div className="space-y-3">
            {groupsAdmin.map(g => <GroupRow key={`a-${g.id}`} g={g} admin />)}
            {groupsMemberOnly.map(g => <GroupRow key={`m-${g.id}`} g={g} />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Not in any public groups yet.
          </div>
        )}
      </div>

      <Footer />
      {zoom && person.profile_pic && <ImageLightbox src={person.profile_pic} alt={person.name} onClose={() => setZoom(false)} />}
      {showFollowers && <FollowersList userEmail={person.email} userName={person.name} onClose={() => setShowFollowers(false)} />}
    </div>
  );
}
