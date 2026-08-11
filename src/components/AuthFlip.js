'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, signupUser, users, storeUserDocuments } from '@/lib/data';
import { HiUser, HiMail, HiPhone, HiLockClosed, HiCamera, HiCheckCircle, HiEye, HiEyeOff } from 'react-icons/hi';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'payround_signup_form';

/* ═══════════════ SIGN IN pane (logic = old /login page, untouched) ═══════════════ */
function LoginPane({ go, autoSkip }) {
  const router = useRouter();
  const [redirect, setRedirect] = useState('/dashboard');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('redirect');
    if (r && r.startsWith('/')) setRedirect(r);
    const em = p.get('email');
    if (em) setFormData(prev => ({ ...prev, email: em }));
    if (autoSkip) {
      try {
        if (localStorage.getItem('payround_user')) router.replace(r && r.startsWith('/') ? r : '/dashboard');
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = () => {
    const newErrors = {};
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: usersRow, error } = await supabase.from('users').select('*').eq('email', formData.email.trim().toLowerCase()).single();
      if (usersRow && !error) {
        const tempOk = usersRow.reset_code && usersRow.reset_code === formData.password
          && usersRow.reset_expires && new Date(usersRow.reset_expires).getTime() > Date.now();
        if (tempOk) {
          localStorage.setItem('payround_user', JSON.stringify({
            id: usersRow.id, name: usersRow.name, email: usersRow.email, phone: usersRow.phone,
            role: usersRow.role || 'member', faceVerified: true,
          }));
          localStorage.setItem('payround_must_change_pw', '1');
          toast('Logged in with your temporary password — set your NEW password now. ⏳', { icon: '🔑' });
          router.push('/settings?mustChange=1');
          setLoading(false);
          return;
        }
        if (usersRow.reset_code === formData.password && usersRow.reset_expires && new Date(usersRow.reset_expires).getTime() <= Date.now()) {
          toast.error('That temporary password has expired (20 min limit) — tap "Forgot password?" for a new one.');
          setLoading(false);
          return;
        }
        if (usersRow.password_hash === formData.password) {
          localStorage.setItem('payround_user', JSON.stringify({
            id: usersRow.id, name: usersRow.name, email: usersRow.email, phone: usersRow.phone,
            role: usersRow.role || 'member', faceVerified: true,
          }));
          toast.success(`Welcome back, ${usersRow.name}!`);
          router.push(redirect);
          setLoading(false);
          return;
        } else {
          toast.error('Incorrect password. Please try again.');
          setLoading(false);
          return;
        }
      }
      const result = loginUser(formData.email, formData.password);
      if (result.success) {
        localStorage.setItem('payround_user', JSON.stringify({
          id: result.user.id, name: result.user.name, email: result.user.email,
          phone: result.user.phone, role: result.user.role, faceVerified: result.user.faceVerified,
        }));
        toast.success(`Welcome back, ${result.user.name}!`);
        router.push(redirect);
      } else {
        toast.error('Invalid email or password. Please check your details and try again.');
      }
    } catch (err) {
      toast.error('Login failed: ' + err.message);
    }
    setLoading(false);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  return (
    <div className="h-full">
      <div className="text-center mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Welcome Back</h1>
        <p className="text-gray-500 text-sm mt-1">Log in to your account to continue</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
          <div className="relative">
            <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} placeholder="you@example.com" className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <HiLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => updateField('password', e.target.value)} placeholder="Your password - only yours works" className="w-full pl-11 pr-11 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}</button>
          </div>
          {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
        </div>
        <div className="flex justify-end"><a href="/forgot-password" className="text-xs text-primary-600 font-medium hover:text-primary-700">Forgot password?</a></div>
        <button type="submit" disabled={loading} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50">{loading ? 'Logging in...' : 'Log In'}</button>
      </form>
      {redirect !== '/dashboard' && (
        <p className="text-center text-xs text-gray-400 mt-4">After logging in we&apos;ll take you right back to where you were.</p>
      )}
      <p className="text-center text-sm text-gray-500 mt-6">Don&apos;t have an account?{' '}
        <a href="/signup" onClick={(e) => { e.preventDefault(); go('signup'); }} className="text-primary-600 font-medium hover:text-primary-700">Sign up</a>
      </p>
    </div>
  );
}

/* ═══════════════ SIGN UP pane (logic = old /signup page, untouched) ═══════════════ */
function SignupPane({ go }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [done, setDone] = useState(false);
  const profilePicRef = useRef(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', referredBy: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [redirectPath, setRedirectPath] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    let base = null;
    if (saved) { try { base = JSON.parse(saved); } catch (e) {} }
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const redir = params.get('redirect');
    if (redir && redir.startsWith('/')) setRedirectPath(redir);
    if (base || ref) setFormData(prev => ({ ...prev, ...(base || {}), ...(ref ? { referredBy: ref } : {}) }));
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleFile = async (file, setPreview, setData) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large. Max 5MB.'); return; }
    try {
      const { compressImage } = await import('@/lib/image');
      const compressed = await compressImage(file, 512, 0.85);
      setPreview(compressed);
      setData(compressed);
    } catch { toast.error('Could not read that file — try another image.'); }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email';
    if (formData.email.trim()) {
      const exists = users.find(u => u.email === formData.email.trim().toLowerCase());
      if (exists) newErrors.email = 'Email already registered. Please log in.';
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    else if (!/^0\d{10}$/.test(formData.phone)) newErrors.phone = 'Valid Nigerian phone required (e.g., 08031234567)';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'At least 6 characters';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!profilePic) newErrors.profilePic = 'Profile picture is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: existingSupa } = await supabase.from('users').select('email').eq('email', formData.email.trim().toLowerCase()).single();
      if (existingSupa) {
        toast.error('Email already registered - 1 account per email. Please log in.');
        setSubmitting(false);
        return;
      }
    } catch {}
    const exists = users.find(u => u.email === formData.email.trim().toLowerCase());
    if (exists) { toast.error('Email already registered.'); setSubmitting(false); return; }
    try {
      const { supabase } = await import('@/lib/supabase');
      let { error } = await supabase.from('users').insert({
        email: formData.email.trim().toLowerCase(), name: formData.name, phone: formData.phone,
        password_hash: formData.password, trial_used: false, role: 'member', is_verified: false,
        referred_by: formData.referredBy?.trim() || null, profile_pic: profilePic || null,
      });
      if (error) {
        const retry = await supabase.from('users').insert({
          email: formData.email.trim().toLowerCase(), name: formData.name, phone: formData.phone,
          password_hash: formData.password, trial_used: false, role: 'member',
        });
        error = retry.error;
      }
      if (error) console.log('Supabase insert fallback', error.message);
      const ref = (formData.referredBy || '').trim();
      if (ref) {
        const { data: allUsers } = await supabase.from('users').select('id,email,name,referral_earnings');
        const referrer = (allUsers || []).find(x => x.id && String(x.id).toLowerCase().startsWith(ref.toLowerCase()));
        if (referrer && referrer.email !== formData.email.trim().toLowerCase()) {
          const { data: mem } = await supabase.from('members').select('id').eq('member_email', referrer.email).eq('status', 'approved');
          const { data: adm } = await supabase.from('groups').select('id').eq('admin_email', referrer.email);
          if ((mem && mem.length > 0) || (adm && adm.length > 0)) {
            await supabase.from('users').update({ referral_earnings: (referrer.referral_earnings || 0) + 200 }).eq('id', referrer.id);
            await supabase.from('notifications').insert({
              id: `ref-${Date.now()}`, type: 'referral_bonus', is_read: false,
              user_email: referrer.email,
              message: `🎁 ${formData.name} registered with your referral link — ₦200 earned. Minimum withdrawal ₦1,000.`,
            });
          }
        }
      }
    } catch (err) { console.log('Supabase insert error, using mock fallback', err.message); }

    const result = signupUser({ ...formData, faceVerified: false });
    if (result.success) {
      storeUserDocuments(result.user.id, result.user.email, result.user.name, { profilePic });
      localStorage.setItem('payround_user', JSON.stringify({
        id: result.user.id, name: result.user.name, email: result.user.email,
        phone: result.user.phone, role: result.user.role, faceVerified: false,
      }));
      toast.success('Account created! Welcome to PayRound 🎉');
      sessionStorage.removeItem(STORAGE_KEY);
      setDone(true);
    } else {
      toast.error('Something went wrong.');
      setSubmitting(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  if (done) {
    return (
      <div className="text-center py-10">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <HiCheckCircle className="w-12 h-12 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Account Created! 🎉</h2>
        <p className="text-gray-500 mb-2">Your account is in — welcome to PayRound! 🎊</p>
        <p className="text-sm text-gray-400 mb-6">PayRound will review your profile picture shortly — you can already explore groups.</p>
        <button onClick={() => router.push(redirectPath || '/dashboard')} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200">
          {redirectPath ? 'Continue →' : 'Go to Dashboard'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="text-center mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Create Your Account</h1>
        <p className="text-gray-500 text-sm mt-1">Join Payround and start saving together</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
          <div className="relative">
            <HiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={formData.name} onChange={e => updateField('name', e.target.value)} placeholder="Enter your full name" className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.name ? 'border-red-300' : 'border-gray-200'}`} />
          </div>
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
          <div className="relative">
            <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="email" value={formData.email} onChange={e => updateField('email', e.target.value)} placeholder="you@example.com" className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.email ? 'border-red-300' : 'border-gray-200'}`} />
          </div>
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone <span className="text-red-500">*</span></label>
          <div className="relative">
            <HiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="tel" value={formData.phone} onChange={e => updateField('phone', e.target.value)} placeholder="08031234567" className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.phone ? 'border-red-300' : 'border-gray-200'}`} />
          </div>
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Selfie <span className="text-red-500">*</span> <span className="text-gray-400 text-xs font-normal">(the only photo needed to sign up — used as your profile picture)</span></label>
          <input type="file" ref={profilePicRef} accept="image/*,image/heic,image/heif,video/*,application/pdf,.pdf" onChange={e => handleFile(e.target.files[0], setProfilePicPreview, setProfilePic)} className="hidden" />
          {profilePicPreview ? (
            <div className="relative w-24 h-24">
              <img src={profilePicPreview} alt="Profile" className="w-24 h-24 rounded-2xl object-cover border-2 border-primary-200" />
              <button type="button" onClick={() => profilePicRef.current?.click()} className="absolute -top-2 -right-2 w-6 h-6 bg-primary-600 text-white rounded-full text-xs flex items-center justify-center shadow">✕</button>
            </div>
          ) : (
            <div onClick={() => profilePicRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all">
              <HiCamera className="w-8 h-8 text-gray-400 mx-auto mb-1" />
              <p className="text-sm text-gray-500">Tap to take a selfie</p>
              <p className="text-xs text-gray-400">This will be your profile picture</p>
            </div>
          )}
          {errors.profilePic && <p className="text-xs text-red-500 mt-1">{errors.profilePic}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <HiLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="password" value={formData.password} onChange={e => updateField('password', e.target.value)} placeholder="Password" className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.password ? 'border-red-300' : 'border-gray-200'}`} />
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm <span className="text-red-500">*</span></label>
            <div className="relative">
              <HiLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="password" value={formData.confirmPassword} onChange={e => updateField('confirmPassword', e.target.value)} placeholder="Repeat" className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.confirmPassword ? 'border-red-300' : 'border-gray-200'}`} />
            </div>
            {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Referred by (unique ID) <span className="text-gray-400 text-xs font-normal">— optional</span></label>
          <div className="relative">
            <HiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={formData.referredBy} onChange={e => updateField('referredBy', e.target.value)} placeholder="Unique ID of who referred you" className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <p className="text-xs text-gray-400 mt-1">Auto-filled when you open someone&apos;s referral link. The referrer earns ₦200.</p>
        </div>
        <button type="submit" disabled={submitting} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50">
          {submitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-6">Already have an account?{' '}
        <a href="/login" onClick={(e) => { e.preventDefault(); go('login'); }} className="text-primary-600 font-medium hover:text-primary-700">Log in</a>
      </p>
    </div>
  );
}

/* ═══════════════ The sliding card (TikTok-style) ═══════════════ */
export default function AuthFlip({ initial = 'login' }) {
  const [mode, setMode] = useState(initial);                  // which FORM is visible
  const [overlay, setOverlay] = useState(initial);            // which TEXT is on the green panel
  const [flip, setFlip] = useState('');                       // '' | 'show-signup' | 'show-login'

  const go = (next) => {
    if (next === mode) return;
    setFlip(next === 'signup' ? 'show-signup' : 'show-login');
    setMode(next);
    // swap the green panel's text right at the midpoint of the turn
    setTimeout(() => setOverlay(next), 430);
    try {
      const q = window.location.search || '';
      window.history.replaceState(null, '', (next === 'signup' ? '/signup' : '/login') + q);
    } catch {}
  };

  const overlayText = overlay === 'signup'
    ? { over: 'ONE OF US?', title: 'Welcome back!', sub: 'Your circle kept saving — pick up right where you stopped.', btn: 'Sign in →', btnTo: 'login' }
    : { over: 'NEW TO PAYROUND?', title: 'New here?', sub: 'Create your free account, join a circle and start saving with people you can see.', btn: 'Create account →', btnTo: 'signup' };

  return (
    <div data-auth="flip" data-mode={mode} className="auth-card relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 🖥 desktop split — the green panel physically TURNS across the card */}
      <div className="hidden md:flex relative">
        <div className="w-1/2 p-8 max-h-[78vh] overflow-y-auto overscroll-contain">
          <LoginPane go={go} autoSkip={initial === 'login'} />
        </div>
        <div className="w-1/2 p-8 max-h-[78vh] overflow-y-auto overscroll-contain">
          <SignupPane go={go} />
        </div>
        <div className={`auth-overlay absolute top-0 right-0 h-full w-1/2 z-10 bg-gradient-to-br from-primary-600 via-emerald-600 to-primary-700 flex flex-col items-center justify-center text-center text-white px-8 ${flip}`}
          style={flip === '' && initial === 'signup' ? { transform: 'translate3d(-100%, 0, 0) rotateY(0)' } : undefined}>
          <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mb-5 border border-white/25">
            <span className="text-white font-bold text-2xl">P</span>
          </div>
          <p className="text-[11px] tracking-[0.25em] font-semibold text-emerald-100 mb-2">{overlayText.over}</p>
          <h2 className="text-2xl font-bold mb-2">{overlayText.title}</h2>
          <p className="text-sm text-emerald-100 mb-6 max-w-[240px]">{overlayText.sub}</p>
          <button onClick={() => go(overlayText.btnTo)} className="border-2 border-white/80 text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-white hover:text-primary-700 transition-all">
            {overlayText.btn}
          </button>
          <p className="text-[10px] text-emerald-200 mt-5">Free to start · No card needed</p>
        </div>
      </div>

      {/* 📱 mobile — green banner + forms slide/turn in on switch */}
      <div className="md:hidden">
        <div key={`banner-${overlay}`} className="auth-banner bg-gradient-to-br from-primary-600 via-emerald-600 to-primary-700 text-white text-center px-6 py-6">
          <p className="text-[10px] tracking-[0.25em] font-semibold text-emerald-100 mb-1">{overlayText.over}</p>
          <h2 className="text-lg font-bold mb-1">{overlayText.title}</h2>
          <p className="text-xs text-emerald-100 mb-4">{overlayText.sub}</p>
          <button onClick={() => go(overlayText.btnTo)} className="border-2 border-white/80 text-white text-xs font-semibold px-5 py-2 rounded-full active:bg-white active:text-primary-700 transition-all">
            {overlayText.btn}
          </button>
        </div>
        <div key={mode} className="auth-form-in p-6">
          {mode === 'signup' ? <SignupPane go={go} /> : <LoginPane go={go} autoSkip={initial === 'login'} />}
        </div>
      </div>
    </div>
  );
}
