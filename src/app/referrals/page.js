'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import ShareButton, { payroundInviteUrl } from '@/components/ShareSheet';
import {
  HiGift, HiClock, HiCheckCircle, HiUserGroup, HiEye, HiEyeOff,
  HiShieldCheck, HiExternalLink, HiCalendar,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

function money(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG')}`;
}

function ReferralStatus({ row }) {
  if (row.status === 'awarded') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
        <HiCheckCircle className="w-3.5 h-3.5" /> {money(row.bonus_amount || 500)} paid
      </span>
    );
  }
  if (row.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
        <HiClock className="w-3.5 h-3.5" /> {money(row.bonus_amount || 500)} pending
      </span>
    );
  }
  if (row.status === 'legacy') {
    return <span className="text-[11px] font-semibold text-gray-500">Previous referral record</span>;
  }
  return <span className="text-[11px] font-semibold text-gray-500">Waiting for their first approved group</span>;
}

function PrivacyToggle({ icon, title, description, enabled, disabled, onChange }) {
  return (
    <div className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 ${enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        <span className="sr-only">{enabled ? 'Make private' : 'Make public'}</span>
      </button>
    </div>
  );
}

export default function ReferralsPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let local = null;
      try { local = JSON.parse(localStorage.getItem('payround_user') || 'null'); } catch {}
      if (!local) { router.replace('/login?redirect=/referrals'); return; }
      setMe(local);

      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) { router.replace('/login?redirect=/referrals'); return; }
        const { data, error } = await supabase.rpc('get_my_referral_dashboard');
        if (error) throw error;
        if (mounted) setDashboard(data || {});
      } catch (error) {
        if (mounted) toast.error(`Could not load referrals: ${error.message || 'try again'}`);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [router]);

  const setPrivacy = async (field, value) => {
    if (!dashboard || privacyBusy) return;
    const next = {
      referrals_public: field === 'referrals_public' ? value : !!dashboard.referrals_public,
      dob_public: field === 'dob_public' ? value : !!dashboard.dob_public,
    };
    setPrivacyBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase.rpc('set_profile_privacy', {
        p_referrals_public: next.referrals_public,
        p_dob_public: next.dob_public,
      });
      if (error) throw error;
      setDashboard(prev => ({ ...prev, ...next, ...(data || {}) }));
      toast.success(value ? 'Now visible on your public profile' : 'Changed back to private');
    } catch (error) {
      toast.error(`Privacy update failed: ${error.message || 'try again'}`);
    }
    setPrivacyBusy(false);
  };

  if (loading) return <LoadingScreen label="Loading your referrals…" />;

  const referrals = Array.isArray(dashboard?.referrals) ? dashboard.referrals : [];
  const qualified = referrals.filter(row => row.status === 'pending' || row.status === 'awarded').length;
  const inviteText = 'Join me on PayRound. Sign up with my link and create a group. If PayRound approves your first group, I can earn a ₦500 referral bonus.';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <HiGift className="w-7 h-7 text-primary-600" /> My Referrals
            </h1>
            <p className="text-sm text-gray-500 mt-1">Your personal link works for every PayRound account.</p>
          </div>
          {me?.id && (
            <ShareButton
              compact
              label="Share link"
              title="Join me on PayRound"
              text={inviteText}
              url={payroundInviteUrl()}
            />
          )}
        </div>

        <section className="bg-gradient-to-br from-primary-700 via-emerald-700 to-primary-800 text-white rounded-2xl p-6 mb-5 shadow-lg shadow-primary-100">
          <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">Total referral earnings</p>
          <p className="text-4xl font-black mt-1">{money(dashboard?.total_earnings)}</p>
          <div className="grid grid-cols-3 gap-2 mt-5">
            <div className="bg-white/10 border border-white/15 rounded-xl p-3">
              <p className="text-xl font-bold">{referrals.length}</p>
              <p className="text-[10px] text-emerald-100">People referred</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl p-3">
              <p className="text-xl font-bold">{qualified}</p>
              <p className="text-[10px] text-emerald-100">Qualified</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl p-3">
              <p className="text-xl font-bold">{money(dashboard?.pending_total)}</p>
              <p className="text-[10px] text-emerald-100">Pending</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-50">
            <HiShieldCheck className="w-4 h-4 shrink-0" />
            {dashboard?.eligible
              ? 'You currently meet the group eligibility rule, so qualified bonuses can be paid.'
              : 'Qualified bonuses stay pending until you own or become an approved member of an approved group.'}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-bold text-gray-900">Your personal referral link</h2>
              <p className="text-xs text-gray-500 mt-0.5">Anyone can share a link; no group membership is needed.</p>
            </div>
            <ShareButton label="Share" title="Join me on PayRound" text={inviteText} url={payroundInviteUrl()} />
          </div>
          <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3 break-all">{payroundInviteUrl()}</p>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
            <p className="font-bold">How the ₦500 bonus works</p>
            <p>1. Your friend signs up through your link. No money is paid at signup.</p>
            <p>2. They create a group and PayRound approves it. They qualify only once, even if they create more groups.</p>
            <p>3. You receive ₦500 if you own or are an approved member of an approved group. Otherwise it waits as pending and is released automatically when you qualify.</p>
          </div>
        </section>

        <section className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">People you referred</h2>
            <span className="text-xs font-semibold text-gray-500">{referrals.length} total</span>
          </div>
          {referrals.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <HiUserGroup className="w-11 h-11 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">No referrals yet</p>
              <p className="text-xs text-gray-500 mt-1 mb-4">Share your personal link. New valid signups will appear here.</p>
              <ShareButton label="Share my link" title="Join me on PayRound" text={inviteText} url={payroundInviteUrl()} />
            </div>
          ) : (
            <div className="space-y-3">
              {referrals.map(row => (
                <div key={row.user_id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                  {row.profile_pic ? (
                    <img src={row.profile_pic} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-100 shrink-0" />
                  ) : (
                    <span className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">
                      {(row.name || 'P').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <button onClick={() => router.push(`/users/${row.user_id}`)} className="font-bold text-sm text-gray-900 hover:text-primary-700 truncate max-w-full inline-flex items-center gap-1">
                      <span className="truncate">{row.name || 'PayRound member'}</span><HiExternalLink className="w-3 h-3 shrink-0" />
                    </button>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Referred {row.referred_at ? new Date(row.referred_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      {row.qualifying_group_name ? ` · ${row.qualifying_group_name}` : ''}
                    </p>
                    <div className="mt-2"><ReferralStatus row={row} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <HiShieldCheck className="w-5 h-5 text-primary-600" />
            <div>
              <h2 className="font-bold text-gray-900">Profile privacy</h2>
              <p className="text-xs text-gray-500">Both are private by default. You control each one.</p>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            <PrivacyToggle
              icon={dashboard?.referrals_public ? <HiEye className="w-5 h-5" /> : <HiEyeOff className="w-5 h-5" />}
              title="Show my referral list publicly"
              description="When on, profile visitors can see this list, statuses, and your total referral earnings."
              enabled={!!dashboard?.referrals_public}
              disabled={privacyBusy}
              onChange={value => setPrivacy('referrals_public', value)}
            />
            <PrivacyToggle
              icon={<HiCalendar className="w-5 h-5" />}
              title="Show my date of birth publicly"
              description="When off, only you can retrieve your date of birth. Turn it on to show it on your public profile."
              enabled={!!dashboard?.dob_public}
              disabled={privacyBusy}
              onChange={value => setPrivacy('dob_public', value)}
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
