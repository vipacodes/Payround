'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { signupUser, users, storeUserDocuments } from '@/lib/data';
import { HiUser, HiMail, HiPhone, HiLockClosed, HiCamera, HiLocationMarker, HiPhotograph, HiIdentification, HiCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'payround_signup_form';

export default function SignUpPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [idFront, setIdFront] = useState(null);
  const [idFrontPreview, setIdFrontPreview] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [idBackPreview, setIdBackPreview] = useState(null);
  const [step, setStep] = useState('form'); // form | success

  const profilePicRef = useRef(null);
  const idFrontRef = useRef(null);
  const idBackRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setFormData(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleFile = (file, setPreview, setData) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setData(e.target.result);
    };
    reader.readAsDataURL(file);
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
    if (!idFront) newErrors.idFront = 'ID front is required';
    if (!idBack) newErrors.idBack = 'ID back is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    const exists = users.find(u => u.email === formData.email.trim().toLowerCase());
    if (exists) {
      toast.error('Email already registered.');
      setSubmitting(false);
      return;
    }

    const result = signupUser({ ...formData, faceVerified: false });
    if (result.success) {
      storeUserDocuments(result.user.id, result.user.email, result.user.name, {
        profilePic,
        idFront,
        idBack,
      });

      localStorage.setItem('payround_user', JSON.stringify({
        id: result.user.id, name: result.user.name, email: result.user.email,
        phone: result.user.phone, address: result.user.address,
        role: result.user.role, faceVerified: false,
      }));
      toast.success('Account created! Admin will review your documents.');
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
          <p className="text-gray-500 mb-2">Your documents have been submitted for review.</p>
          <p className="text-sm text-gray-400 mb-6">An admin will verify your ID and profile picture before you can join groups.</p>
          <button onClick={() => router.push('/dashboard')} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200">
            Go to Dashboard
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Profile Picture <span className="text-red-500">*</span></label>
              <input type="file" ref={profilePicRef} accept="image/*" capture="user" onChange={e => handleFile(e.target.files[0], setProfilePicPreview, setProfilePic)} className="hidden" />
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

            {/* ID Document */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <HiIdentification className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">ID Document Verification</span>
              </div>
              <p className="text-xs text-amber-700 mb-3">Upload your government-issued ID (National ID, Voter's Card, Driver's License, International Passport). Admin will match your face with your ID.</p>

              {/* ID Front */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-amber-800 mb-1">Front of ID <span className="text-red-500">*</span></label>
                <input type="file" ref={idFrontRef} accept="image/*" capture="environment" onChange={e => handleFile(e.target.files[0], setIdFrontPreview, setIdFront)} className="hidden" />
                {idFrontPreview ? (
                  <div className="relative">
                    <img src={idFrontPreview} alt="ID Front" className="w-full max-h-32 rounded-xl object-cover border border-amber-300" />
                    <button type="button" onClick={() => idFrontRef.current?.click()} className="absolute top-1 right-1 w-6 h-6 bg-gray-900/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  </div>
                ) : (
                  <div onClick={() => idFrontRef.current?.click()} className="border-2 border-dashed border-amber-300 rounded-xl p-4 text-center cursor-pointer hover:border-amber-500 hover:bg-amber-50/50 transition-all">
                    <HiPhotograph className="w-6 h-6 text-amber-400 mx-auto mb-1" />
                    <p className="text-xs text-amber-600">Upload front of ID</p>
                  </div>
                )}
                {errors.idFront && <p className="text-xs text-red-500 mt-1">{errors.idFront}</p>}
              </div>

              {/* ID Back */}
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1">Back of ID <span className="text-red-500">*</span></label>
                <input type="file" ref={idBackRef} accept="image/*" capture="environment" onChange={e => handleFile(e.target.files[0], setIdBackPreview, setIdBack)} className="hidden" />
                {idBackPreview ? (
                  <div className="relative">
                    <img src={idBackPreview} alt="ID Back" className="w-full max-h-32 rounded-xl object-cover border border-amber-300" />
                    <button type="button" onClick={() => idBackRef.current?.click()} className="absolute top-1 right-1 w-6 h-6 bg-gray-900/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  </div>
                ) : (
                  <div onClick={() => idBackRef.current?.click()} className="border-2 border-dashed border-amber-300 rounded-xl p-4 text-center cursor-pointer hover:border-amber-500 hover:bg-amber-50/50 transition-all">
                    <HiPhotograph className="w-6 h-6 text-amber-400 mx-auto mb-1" />
                    <p className="text-xs text-amber-600">Upload back of ID</p>
                  </div>
                )}
                {errors.idBack && <p className="text-xs text-red-500 mt-1">{errors.idBack}</p>}
              </div>
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
