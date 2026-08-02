'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { signupUser, users, storeUserDocuments } from '@/lib/data';
import { HiUser, HiMail, HiPhone, HiLockClosed, HiCamera, HiLocationMarker, HiCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'payround_signup_form';

export default function SignUpPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [step, setStep] = useState('form'); // form | success

  const profilePicRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    referredBy: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [redirectPath, setRedirectPath] = useState(null); // where to go after signup (e.g. joining a group)

  useEffect(() => {
    // Restore saved draft, then auto-fill "Referred by" from the referral link (?ref=UNIQUEID)
    const saved = sessionStorage.getItem(STORAGE_KEY);
    let base = null;
    if (saved) { try { base = JSON.parse(saved); } catch (e) {} }
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const ref = params ? params.get('ref') : null;
    const redir = params ? params.get('redirect') : null;
    if (redir && redir.startsWith('/')) setRedirectPath(redir);
    if (base || ref) setFormData(prev => ({ ...prev, ...(base || {}), ...(ref ? { referredBy: ref } : {} ) }));
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleFile = async (file, setPreview, setData) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }
    try {
      const { compressImage } = await import('@/lib/image');
      const compressed = await compressImage(file, 512, 0.85);
      setPreview(compressed);
      setData(compressed);
    } catch {
      toast.error('Could not read that file — try another image.');
    }
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
    if (!formData.address.trim()) newErrors.address = 'Address is required';
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
      // Check Supabase for existing email - 1 account per email enforced, real data only
      const { supabase } = await import('@/lib/supabase');
      const { data: existingSupa } = await supabase.from('users').select('email').eq('email', formData.email.trim().toLowerCase()).single();
      if (existingSupa) {
        toast.error('Email already registered - 1 account per email. Please log in.');
        setSubmitting(false);
        return;
      }
    } catch {}

    const exists = users.find(u => u.email === formData.email.trim().toLowerCase());
    if (exists) {
      toast.error('Email already registered.');
      setSubmitting(false);
      return;
    }

    // Store in Supabase shared DB so owner site can see for approval - functional and reflects on owner site
    try {
      const { supabase } = await import('@/lib/supabase');
      let { error } = await supabase.from('users').insert({
        email: formData.email.trim().toLowerCase(),
        name: formData.name,
        phone: formData.phone,
        password_hash: formData.password,
        trial_used: false,
        role: 'member',
        is_verified: false,
        referred_by: formData.referredBy?.trim() || null,
        profile_pic: profilePic || null,
      });
      if (error) {
        // Safety net: retry with core columns only so signup always works even if a migration hasn't been run yet
        const retry = await supabase.from('users').insert({
          email: formData.email.trim().toLowerCase(),
          name: formData.name,
          phone: formData.phone,
          password_hash: formData.password,
          trial_used: false,
          role: 'member',
        });
        error = retry.error;
      }
      if (error) console.log('Supabase insert fallback', error.message);

      // Referral credit: referrer earns ₦200 if they are a member/admin of at least 1 group
      const ref = (formData.referredBy || '').trim();
      if (ref) {
        const { data: allUsers } = await supabase.from('users').select('id,email,name,referral_earnings');
        const referrer = (allUsers || []).find(x => x.id && String(x.id).toLowerCase().startsWith(ref.toLowerCase()));
        if (referrer && referrer.email !== formData.email.trim().toLowerCase()) {
          const { data: mem } = await supabase.from('members').select('id').eq('member_email', referrer.email).eq('status', 'approved');
          const { data: adm } = await supabase.from('groups').select('id').eq('admin_email', referrer.email);
          if ((mem && mem.length > 0) || (adm && adm.length > 0)) {
            await supabase.from('users').update({ referral_earnings: (referrer.referral_earnings || 0) + 200 }).eq('id', referrer.id);
            // Targeted: ONLY the referrer sees this — never broadcast to all users
            await supabase.from('notifications').insert({
              id: `ref-${Date.now()}`, type: 'referral_bonus', is_read: false,
              user_email: referrer.email,
              message: `🎁 ${formData.name} registered with your referral link — ₦200 earned. Minimum withdrawal ₦1,000.`,
            });
          }
        }
      }
    } catch (err) {
      console.log('Supabase insert error, using mock fallback', err.message);
    }

    const result = signupUser({ ...formData, faceVerified: false });
    if (result.success) {
      storeUserDocuments(result.user.id, result.user.email, result.user.name, {
        profilePic,
      });

      localStorage.setItem('payround_user', JSON.stringify({
        id: result.user.id, name: result.user.name, email: result.user.email,
        phone: result.user.phone, address: result.user.address,
        role: result.user.role, faceVerified: false,
      }));
      toast.success('Account created! Welcome to PayRound 🎉');
      sessionStorage.removeItem(STORAGE_KEY);
      setStep('success');
    } else {
      toast.error('Something went wrong.');
      setSubmitting(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
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
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-12 md:py-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary-200">
            <span className="text-white font-bold text-2xl">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
          <p className="text-gray-500 mt-1">Join Payround and start saving together</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Residential Address <span className="text-red-500">*</span></label>
              <div className="relative">
                <HiLocationMarker className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" value={formData.address} onChange={e => updateField('address', e.target.value)} placeholder="Your home address" className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.address ? 'border-red-300' : 'border-gray-200'}`} />
              </div>
              {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Referred by (unique ID) <span className="text-gray-400 text-xs font-normal">— optional</span></label>
              <div className="relative">
                <HiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" value={formData.referredBy} onChange={e => updateField('referredBy', e.target.value)} placeholder="Unique ID of who referred you" className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <p className="text-xs text-gray-400 mt-1">Auto-filled when you open someone's referral link. The referrer earns ₦200.</p>
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

            {/* Profile Picture */}
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

            <button type="submit" disabled={submitting} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50">
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-primary-600 font-medium hover:text-primary-700">Log in</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
