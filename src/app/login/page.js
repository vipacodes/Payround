'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { loginUser } from '@/lib/data';
import { HiMail, HiLockClosed, HiEye, HiEyeOff } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

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
      // Try Supabase first - 1 account per email enforced, only that password works, functional and reflects on owner site
      const { supabase } = await import('@/lib/supabase');
      const { data: users, error } = await supabase.from('users').select('*').eq('email', formData.email.trim().toLowerCase()).single();
      if (users && !error) {
        if (users.password_hash === formData.password) {
          localStorage.setItem('payround_user', JSON.stringify({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            role: users.role || 'member',
            faceVerified: true,
          }));
          toast.success(`Welcome back, ${users.name}!`);
          router.push('/dashboard');
          setLoading(false);
          return;
        } else {
          toast.error('Incorrect password. Only your password works for your account.');
          setLoading(false);
          return;
        }
      }
      // Fallback to mock data
      const result = loginUser(formData.email, formData.password);
      if (result.success) {
        localStorage.setItem('payround_user', JSON.stringify({
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          phone: result.user.phone,
          role: result.user.role,
          faceVerified: result.user.faceVerified,
        }));
        toast.success(`Welcome back, ${result.user.name}!`);
        router.push('/dashboard');
      } else {
        toast.error(result.error + ' - If you signed up with Supabase, use that password. Only your password works.');
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
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-md mx-auto px-4 py-12 md:py-20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary-200">
            <span className="text-white font-bold text-2xl">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-500 mt-1">Log in - 1 account per email, only your password works</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
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
            <div className="flex justify-end"><a href="/forgot-password" className="text-xs text-primary-600 font-medium hover:text-primary-700">Forgot password? Reset link will be sent to your email</a></div>
            <button type="submit" disabled={loading} className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50">{loading ? 'Logging in...' : 'Log In'}</button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">Don&apos;t have an account? <a href="/signup" className="text-primary-600 font-medium hover:text-primary-700">Sign up - 1 account per email</a></p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
