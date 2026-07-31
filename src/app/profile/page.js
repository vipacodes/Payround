'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HiUser, HiMail, HiPhone, HiCamera, HiPencil, HiSave, HiShieldCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    const parsed = JSON.parse(stored);
    setUser(parsed);
    setFormData({ name: parsed.name || '', email: parsed.email || '', phone: parsed.phone || '' });
  }, [router]);

  if (!user) return null;

  const handleSave = () => {
    const updated = { ...user, ...formData };
    localStorage.setItem('payround_user', JSON.stringify(updated));
    setUser(updated);
    setEditing(false);
    toast.success('Profile updated!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 mb-6">
          <div className="flex items-center gap-6 mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center">
                <span className="text-primary-700 font-bold text-3xl">{user.name?.charAt(0) || 'U'}</span>
              </div>
              <button className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary-600 text-white rounded-full flex items-center justify-center shadow-lg">
                <HiCamera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
              <p className="text-sm text-gray-500 capitalize">{user.role}</p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
            <div className="flex items-center gap-3">
              <HiShieldCheck className="w-6 h-6 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Documents Under Review</p>
                <p className="text-xs text-gray-500">Your profile picture and ID documents are being reviewed by the admin.</p>
              </div>
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <HiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="email" value={formData.email} onChange={e => setFormData(p => ({...p, email: e.target.value}))} className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <div className="relative">
                  <HiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="tel" value={formData.phone} onChange={e => setFormData(p => ({...p, phone: e.target.value}))} className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} className="flex-1 bg-primary-600 text-white font-medium py-3 rounded-xl hover:bg-primary-700 transition-all flex items-center justify-center gap-2"><HiSave className="w-4 h-4" /> Save Changes</button>
                <button onClick={() => setEditing(false)} className="flex-1 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Full Name</p><p className="text-sm font-medium text-gray-900">{user.name}</p></div><HiUser className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Email</p><p className="text-sm font-medium text-gray-900">{user.email}</p></div><HiMail className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Phone</p><p className="text-sm font-medium text-gray-900">{user.phone}</p></div><HiPhone className="w-5 h-5 text-gray-400" /></div>
              <button onClick={() => setEditing(true)} className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-all"><HiPencil className="w-4 h-4" /> Edit Profile</button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
