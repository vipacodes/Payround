'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import ImageLightbox from '@/components/ImageLightbox';
import {
  HiArrowLeft, HiBadgeCheck, HiUserGroup, HiCalendar,
  HiShieldCheck, HiUser, HiCheck, HiUserAdd, HiPhone
} from 'react-icons/hi';
import toast from 'react-hot-toast';

const badgeEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇' };

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: u, error } = await supabase
          .from('users')
          .select('id, name, email, phone, profile_pic, is_verified, role, created_at')
          .eq('id', params.id)
          .single();
        if (!mounted) return;
        if (error || !u) { setNotFound(true); setLoading(false); return; }
        setPerson(u);
        const email = (u.email || '').toLowerCase(); // used only to fetch their groups — never displayed
        // Groups they admin
        const { data: ag } = await supabase.from('groups').select('id, name, avatar_url, is_verified, badge_tier, amount, frequency').eq('admin_email', email).in('status', ['active', 'approved']);
        // Public memberships (approved only)
        const { data: mems } = await supabase.from('members').select('group_id').eq('member_email', email).in('status', ['active', 'approved']);
        if (!mounted) return;
        setGroupsAdmin(ag || []);

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
        await supabase.from('notifications').insert({
          id: `foll-${Date.now()}`, type: 'new_follower', is_read: false,
          user_email: (person.email || '').toLowerCase(),
          message: `➕ Someone started following you on PayRound — your followers count is now visible on your profile.`,
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
          {g.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />}
          {g.badge_tier && <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">{badgeEmoji[g.badge_tier]} {g.badge_tier}</span>}
        </p>
        <p className="text-xs text-gray-500">₦{Number(g.amount || 0).toLocaleString()} • {g.frequency || 'Weekly'}{admin ? ' • 👑 they admin' : ''}</p>
      </div>
      <span className="text-sm font-medium text-primary-600 shrink-0">View →</span>
    </button>
  );

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
            {person.is_verified && <HiBadgeCheck className="w-8 h-8 text-blue-500 drop-shadow-md shrink-0" title="Verified by PayRound" />}
          </h1>
          <p className="text-sm text-gray-500 capitalize mt-1">{person.role || 'member'}</p>
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
            <span className="text-sm font-semibold text-gray-900">{followers} <span className="text-xs font-normal text-gray-500">Follower{followers === 1 ? '' : 's'}</span></span>
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
        </div>

        {/* Their groups */}
        <div className="mb-3 flex items-center gap-2">
          <HiUserGroup className="w-5 h-5 text-primary-600" />
          <h2 className="font-bold text-gray-900">Groups ({groupsAdmin.length + groupsMember.length})</h2>
        </div>
        {groupsAdmin.length + groupsMember.length > 0 ? (
          <div className="space-y-3">
            {groupsAdmin.map(g => <GroupRow key={`a-${g.id}`} g={g} admin />)}
            {groupsMember.filter(g => !groupsAdmin.find(x => x.id === g.id)).map(g => <GroupRow key={`m-${g.id}`} g={g} />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Not in any public groups yet.
          </div>
        )}
      </div>

      <Footer />
      {zoom && person.profile_pic && <ImageLightbox src={person.profile_pic} alt={person.name} onClose={() => setZoom(false)} />}
    </div>
  );
}
