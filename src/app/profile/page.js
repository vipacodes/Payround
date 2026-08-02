'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ImageLightbox from '@/components/ImageLightbox';
import { HiUser, HiMail, HiPhone, HiCamera, HiPencil, HiSave, HiBadgeCheck, HiClock, HiGift } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null); // real row from Supabase
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(null); // expanded photo src
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const photoRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    let parsed;
    try { parsed = JSON.parse(stored); } catch { router.push('/login'); return; }
    setUser(parsed);
    setFormData({ name: parsed.name || '', phone: parsed.phone || '' });
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('users')
          .select('name, email, phone, role, profile_pic, pending_profile_pic, is_verified, approval_status, referral_earnings, referred_by, created_at')
          .eq('email', (parsed.email || '').toLowerCase())
          .single();
        if (data) {
          setAccount(data);
          setFormData({ name: data.name || '', phone: data.phone || '' });
        }
      } catch (e) {
        console.log('Profile load:', e.message);
      }
    })();
  }, [router]);

  if (!user) return null;

  const photo = account?.profile_pic || null;
  const pendingPhoto = account?.pending_profile_pic || null;

  // Photo changes require OWNER approval — saved to pending_profile_pic.
  const handlePhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Image too large. Max 8MB.'); return; }
    setUploadingPhoto(true);
    try {
      const { compressImage } = await import('@/lib/image');
      const dataUrl = await compressImage(file, 512, 0.85);
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('users').update({ pending_profile_pic: dataUrl }).eq('email', user.email.toLowerCase());
      if (error) throw error;
      setAccount(prev => ({ ...(prev || {}), pending_profile_pic: dataUrl }));
      toast.success('📷 Photo sent to PayRound for approval — it will appear here after approval.');
    } catch (e) {
      toast.error(`Could not send photo: ${e.message || 'try again'}`);
    }
    setUploadingPhoto(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Name is required.'); return; }
    setSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('users')
        .update({ name: formData.name.trim(), phone: formData.phone.trim() })
        .eq('email', user.email.toLowerCase());
      if (error) throw error;
      const updated = { ...user, name: formData.name.trim(), phone: formData.phone.trim() };
      localStorage.setItem('payround_user', JSON.stringify(updated));
      setUser(updated);
      setAccount(prev => prev ? { ...prev, name: updated.name, phone: updated.phone } : prev);
      setEditing(false);
      toast.success('Profile updated!');
    } catch (e) {
      toast.error(`Save failed: ${e.message || 'try again'}`);
    }
    setSaving(false);
  };

  const refLink = `https://payround-omega.vercel.app/signup?ref=${user.id || ''}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 mb-6">
          <div className="flex items-center gap-5 mb-6">
            <div className="relative shrink-0">
              <input type="file" ref={photoRef} accept="image/*" className="hidden" onChange={(e) => { handlePhoto(e.target.files?.[0]); e.target.value = ''; }} />
              {photo
                ? <img src={photo} alt={formData.name || 'profile'} onClick={() => setZoomPhoto(photo)} title="Tap to expand" className="w-20 h-20 rounded-2xl object-cover border border-gray-200 cursor-zoom-in hover:opacity-90" />
                : <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center"><span className="text-primary-700 font-bold text-3xl">{(formData.name || 'U').charAt(0).toUpperCase()}</span></div>}
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                title="Change photo (PayRound approval required)"
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary-600 text-white rounded-full flex items-center justify-center shadow-lg disabled:opacity-60"
              >
                <HiCamera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
                <span className="truncate">{account?.name || user.name}</span>
                {account?.is_verified && <HiBadgeCheck className="w-7 h-7 text-blue-500 drop-shadow-md shrink-0" title="Verified by PayRound" />}
              </h2>
              <p className="text-sm text-gray-500 capitalize">{account?.role || user.role || 'member'}</p>
              {account?.approval_status === 'approved' && <p className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 mt-1 inline-block">✅ Account approved</p>}
            </div>
          </div>

          {pendingPhoto && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
              <div className="flex items-center gap-3">
                <img src={pendingPhoto} alt="pending" onClick={() => setZoomPhoto(pendingPhoto)} title="Tap to expand" className="w-11 h-11 rounded-xl object-cover border border-amber-300 cursor-zoom-in hover:opacity-90" />
                <div>
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5"><HiClock className="w-4 h-4 text-amber-600" /> Photo awaiting PayRound approval</p>
                  <p className="text-xs text-gray-500">Your current photo keeps showing until PayRound approves the new one.</p>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
            <div className="flex items-center gap-3">
              <HiBadgeCheck className="w-6 h-6 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{account?.is_verified ? 'Verified account' : 'Verification handled by PayRound'}</p>
                <p className="text-xs text-gray-500">{account?.is_verified ? 'The 🔵 blue badge on your profile was granted by PayRound.' : 'Profile photo changes and the blue badge are reviewed and approved by PayRound.'}</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email (cannot be changed)</label>
                <div className="relative">
                  <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="email" value={user.email} disabled className="w-full pl-11 pr-4 py-3 border border-gray-100 bg-gray-50 text-gray-400 rounded-xl text-sm" />
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
                <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 text-white font-medium py-3 rounded-xl hover:bg-primary-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"><HiSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}</button>
                <button onClick={() => setEditing(false)} className="flex-1 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-all">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Full Name</p><p className="text-sm font-medium text-gray-900">{account?.name || user.name}</p></div><HiUser className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Email</p><p className="text-sm font-medium text-gray-900">{user.email}</p></div><HiMail className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Phone</p><p className="text-sm font-medium text-gray-900">{account?.phone || user.phone || '—'}</p></div><HiPhone className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Referral Earnings</p><p className="text-sm font-medium text-gray-900">₦{Number(account?.referral_earnings || 0).toLocaleString()}</p></div><HiGift className="w-5 h-5 text-gray-400" /></div>
              <button onClick={() => setEditing(true)} className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-all"><HiPencil className="w-4 h-4" /> Edit Profile</button>
            </div>
          )}
        </div>
      </div>
      <Footer />
      {zoomPhoto && <ImageLightbox src={zoomPhoto} alt="profile photo" onClose={() => setZoomPhoto(null)} />}
    </div>
  );
}
