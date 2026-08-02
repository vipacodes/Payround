'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  HiCheckCircle, HiUser, HiPhone, HiMail,
  HiUserGroup, HiDocumentText, HiArrowLeft,
  HiClock, HiLogin, HiUserAdd, HiCurrencyDollar, HiCalendar
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function JoinGroupPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState('rules'); // gate | rules | form | success | already
  const [me, setMe] = useState(null); // logged-in user (localStorage + DB row)
  const [existing, setExisting] = useState(null); // existing membership row (pending/approved)
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', spots: 1 });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Who am I?
      const stored = localStorage.getItem('payround_user');
      let user = null;
      if (stored) { try { user = JSON.parse(stored); } catch {} }
      try {
        const { supabase } = await import('@/lib/supabase');
        // Real group from the database
        const { data: g, error } = await supabase.from('groups').select('*').eq('id', params.id).single();
        if (!mounted) return;
        if (error || !g) { setNotFound(true); setLoading(false); return; }
        setGroup(g);

        if (user?.email) {
          const email = user.email.toLowerCase();
          setMe(user);
          // Prefill from my real account row (phone may only live in the DB)
          let phone = user.phone || '';
          try {
            const { data: acc } = await supabase.from('users').select('name, phone').eq('email', email).single();
            if (acc) {
              if (acc.phone) phone = acc.phone;
              if (acc.name) user.name = acc.name;
            }
          } catch {}
          setFormData({ name: user.name || '', phone, email });
          // Already requested / already a member?
          const { data: mems } = await supabase
            .from('members').select('*')
            .eq('group_id', params.id).eq('member_email', email)
            .in('status', ['pending', 'approved']);
          if (!mounted) return;
          if (mems && mems.length > 0) setExisting(mems[0]);
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
            <p className="text-gray-500 mb-4">This group doesn&apos;t exist or isn&apos;t live yet.</p>
            <button onClick={() => router.push('/groups/search')} className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all">Browse Groups</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const joinPath = `/groups/${params.id}/join`;

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      // Record the join request — the group admin reviews your profile and approves
      const { error } = await supabase.from('members').insert({
        id: `m-${Date.now()}`,
        group_id: params.id,
        member_email: formData.email.trim().toLowerCase(),
        member_name: formData.name.trim(),
        member_phone: formData.phone.trim(),
        spots_requested: Math.max(1, parseInt(formData.spots, 10) || 1),
        status: 'pending',
      });
      if (error) throw error;
      // Notify ONLY the group admin
      await supabase.from('notifications').insert({
        id: `join-${Date.now()}`, type: 'join_request', group_id: params.id, is_read: false,
        user_email: (group.admin_email || '').toLowerCase() || null,
        message: `🔔 ${formData.name.trim()} requested to join "${group.name}" — review their profile and approve in your admin members tab.`,
      });
      setStep('success');
      toast.success('Join request submitted!');
    } catch (err) {
      toast.error(`Could not submit request: ${err.message || 'try again'}`);
    }
    setSubmitting(false);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const isLive = ['active', 'approved'].includes(group.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3 mb-6">
          {group.avatar_url
            ? <img src={group.avatar_url} alt={group.name} className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
            : <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center"><span className="text-primary-700 font-bold text-lg">{group.name.charAt(0)}</span></div>}
          <div>
            <h1 className="text-xl font-bold text-gray-900">Join {group.name}</h1>
            <p className="text-sm text-gray-500">ID: {group.id}</p>
          </div>
        </div>

        {/* NOT LOGGED IN — no forced signup: choose login or create account */}
        {!me && step !== 'success' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiLogin className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Log in to join this group</h2>
            <p className="text-sm text-gray-500 mb-6">
              Already have a PayRound account? Just log in — <b>you do not need to create a new account</b>. Your details are filled in automatically.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push(`/login?redirect=${encodeURIComponent(joinPath)}`)}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 flex items-center justify-center gap-2"
              >
                <HiLogin className="w-5 h-5" /> Log In to Join
              </button>
              <button
                onClick={() => router.push(`/signup?redirect=${encodeURIComponent(joinPath)}`)}
                className="w-full border border-gray-200 text-gray-700 font-medium py-3.5 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
              >
                <HiUserAdd className="w-5 h-5" /> I&apos;m New — Create Account
              </button>
            </div>
          </div>
        )}

        {/* LOGGED IN — already a member / request pending */}
        {me && existing && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${existing.status === 'approved' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              {existing.status === 'approved' ? <HiCheckCircle className="w-12 h-12 text-emerald-500" /> : <HiClock className="w-12 h-12 text-amber-500" />}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {existing.status === 'approved' ? 'You\'re already a member ✅' : 'Request already sent ⏳'}
            </h2>
            <p className="text-gray-500 mb-6">
              {existing.status === 'approved'
                ? <>You&apos;re a member of <strong>{group.name}</strong>. View it from your dashboard.</>
                : <>Your request to join <strong>{group.name}</strong> is waiting for the admin&apos;s approval. You&apos;ll get a notification.</>}
            </p>
            <button onClick={() => router.push('/dashboard')} className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all">Go to Dashboard</button>
          </div>
        )}

        {/* Group paused/under review notice */}
        {me && !existing && !isLive && (
          <div className="bg-white rounded-2xl border border-amber-200 p-8 text-center">
            <HiClock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1">This group isn&apos;t open for joins yet</h2>
            <p className="text-sm text-gray-500">The group is still being reviewed by PayRound. Please check back later.</p>
          </div>
        )}

        {/* What you're agreeing to — REAL group terms from the database */}
        {me && !existing && isLive && step === 'rules' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <HiDocumentText className="w-6 h-6 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Before You Join</h2>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <HiCurrencyDollar className="w-5 h-5 text-primary-500 shrink-0" />
                <span className="text-sm text-gray-700">Contribution: <b>₦{Number(group.amount || 0).toLocaleString()}</b> per cycle</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <HiCalendar className="w-5 h-5 text-primary-500 shrink-0" />
                <span className="text-sm text-gray-700">Contribution frequency: <b>{group.frequency || 'Weekly'}</b></span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <HiUserGroup className="w-5 h-5 text-primary-500 shrink-0" />
                <span className="text-sm text-gray-700">Group size limit: <b>{group.max_members || '—'} members</b> — payouts follow the rotation order</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">By joining you agree to pay your contribution on time every cycle and follow the group&apos;s payout rotation. The group admin reviews every join request.</p>

            <label className="flex items-start gap-3 p-4 bg-primary-50 rounded-xl mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the contribution terms above.
              </span>
            </label>

            <button
              onClick={() => setStep('form')}
              disabled={!agreed}
              className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Your details — prefilled from your account, no re-registration */}
        {me && !existing && isLive && step === 'form' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Confirm Your Details</h2>
            <p className="text-sm text-gray-500 mb-6">
              Pulled from your account — no need to register again. Visible to you and the group admin only.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <div className="relative">
                  <HiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Enter your full name"
                    className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.name ? 'border-red-300' : 'border-gray-200'}`}
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
                  <div className="relative">
                    <HiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="08031234567"
                      className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.phone ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                  <div className="relative">
                    <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      readOnly
                      className="w-full pl-11 pr-4 py-3 border border-gray-100 bg-gray-50 text-gray-500 rounded-xl text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">How many spots? *</label>
                  <select
                    value={formData.spots}
                    onChange={(e) => updateField('spots', parseInt(e.target.value, 10) || 1)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    {[1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n} spot{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    Each spot pays <strong>₦{Number(group.amount || 0).toLocaleString()}</strong> per {group.frequency || 'week'} and receives its own payout —
                    e.g. holding spot #1 and spot #19 means you contribute for 2 spots and collect 2 payouts.
                    The admin assigns your exact spot numbers when approving you.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Join Request'}
              </button>
            </form>

            <p className="text-xs text-gray-400 mt-4 text-center">
              The group admin reviews your account profile before approving.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiCheckCircle className="w-12 h-12 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted! 🎉</h2>
            <p className="text-gray-500 mb-2">
              Your request to join <strong>{group.name}</strong> has been sent to the admin.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              You will get a notification once the admin approves or declines.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => router.push('/groups/search')}
                className="border border-gray-200 text-gray-700 font-medium px-6 py-3 rounded-xl hover:bg-gray-50 transition-all"
              >
                Browse More Groups
              </button>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
