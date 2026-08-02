'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  HiUserGroup, HiCalendar, HiCurrencyDollar,
  HiUser, HiCheckCircle, HiClock, HiBadgeCheck, HiArrowLeft
} from 'react-icons/hi';

const badgeEmoji = { bronze: '🥉', silver: '🥈', gold: '🥇' };

export default function GroupDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  const [myStatus, setMyStatus] = useState(null); // null | 'pending' | 'approved'
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

        const { data: mems } = await supabase.from('members').select('id').eq('group_id', params.id).eq('status', 'approved');
        if (mounted) setMemberCount((mems || []).length);

        if (user?.email) {
          const { data: mine } = await supabase
            .from('members').select('status')
            .eq('group_id', params.id).eq('member_email', user.email.toLowerCase())
            .in('status', ['pending', 'approved']);
          if (mounted && mine && mine.length > 0) setMyStatus(mine[0].status);
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
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><HiUser className="w-4 h-4 text-primary-500" /> Group Admin</div>
            <p className="text-lg font-bold text-gray-900 truncate">{group.admin_name || '—'}</p>
          </div>
        </div>

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
      </div>

      <Footer />
    </div>
  );
}
