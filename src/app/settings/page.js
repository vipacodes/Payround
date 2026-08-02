'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ImageLightbox from '@/components/ImageLightbox';
import { logoutUser } from '@/lib/data';
import {
  HiMail, HiSun, HiMoon, HiLogout, HiChevronRight,
  HiShieldExclamation, HiBadgeCheck, HiEye, HiEyeOff,
  HiLockClosed, HiUser, HiBell
} from 'react-icons/hi';
import toast from 'react-hot-toast';

function SettingRow({ icon, title, desc, right, danger, onClick }) {
  const inner = (
    <>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium ${danger ? 'text-red-700' : 'text-gray-900'}`}>{title}</span>
        {desc && <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>}
      </span>
      <span className="shrink-0">{right}</span>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">{inner}</button>
    : <div className="flex items-center gap-3 px-4 py-3.5">{inner}</div>;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(null); // expanded photo src
  const photoRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    setTheme(localStorage.getItem('payround_theme') || 'light');
  }, []);

  // Load current profile photo from the database
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.from('users').select('profile_pic, pending_profile_pic').eq('email', user.email.toLowerCase()).single();
        if (data?.profile_pic) setPhoto(data.profile_pic);
        if (data?.pending_profile_pic) setPendingPhoto(data.pending_profile_pic);
      } catch {}
    })();
  }, [user]);

  // Photo changes need OWNER approval — we save to pending_profile_pic, the
  // owner reviews it from their panel, and it replaces profile_pic once approved.
  const handlePhoto = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Image too large. Max 8MB.'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    setUploadingPhoto(true);
    try {
      const { compressImage } = await import('@/lib/image');
      const dataUrl = await compressImage(file, 512, 0.85);
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('users').update({ pending_profile_pic: dataUrl }).eq('email', user.email.toLowerCase());
      if (error) throw error;
      setPendingPhoto(dataUrl);
      toast.success('📷 Photo sent to PayRound for approval — it will appear after approval.');
    } catch (err) {
      toast.error(`Could not send photo: ${err.message || 'please try again'}`);
    }
    setUploadingPhoto(false);
  };

  const applyTheme = (t) => {
    setTheme(t);
    localStorage.setItem('payround_theme', t);
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    toast.success(`${t === 'dark' ? '🌙 Dark' : '☀️ Light'} mode on`);
  };

  const handleLogout = () => {
    logoutUser();
    localStorage.removeItem('payround_user');
    toast.success('Logged out');
    router.push('/');
  };

  const handleDeleteAccount = async () => {
    if (!user) { toast.error('You are not logged in.'); return; }
    if (!password) { toast.error('Enter your password.'); return; }
    if (confirmText.trim() !== 'DELETE') { toast.error('Type DELETE to confirm.'); return; }
    setDeleting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: row } = await supabase.from('users').select('password_hash').eq('email', user.email.toLowerCase()).single();
      if (!row || row.password_hash !== password) {
        toast.error('Incorrect password — account not deleted.');
        setDeleting(false);
        return;
      }
      await supabase.from('members').delete().eq('member_email', user.email.toLowerCase());
      const { error } = await supabase.from('users').delete().eq('email', user.email.toLowerCase());
      if (error) throw error;
      localStorage.removeItem('payround_user');
      logoutUser();
      toast.success('Account deleted. We are sad to see you go.');
      router.push('/');
    } catch (e) {
      toast.error(`Delete failed: ${e.message}`);
    }
    setDeleting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">Manage your account, appearance and session.</p>

        {/* Profile */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Profile</p>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 mb-6 overflow-hidden">
          <SettingRow
            icon={<HiUser className="w-5 h-5" />}
            title={user?.name || 'Not logged in'}
            desc={user?.email || 'Log in to manage your account'}
            right={<div className="flex items-center gap-2">{user?.is_verified && <HiBadgeCheck className="w-5 h-5 text-blue-500 drop-shadow" />} <HiChevronRight className="w-4 h-4 text-gray-400" /></div>}
            onClick={() => router.push('/profile')}
          />
          <div className="px-4 py-3.5">
            <input type="file" ref={photoRef} accept="image/*" className="hidden" onChange={(e) => { handlePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="flex items-center gap-3">
              {photo
                ? <img src={photo} alt="profile" onClick={() => setZoomPhoto(photo)} title="Tap to expand" className="w-14 h-14 rounded-xl object-cover border border-gray-200 cursor-zoom-in hover:opacity-90" />
                : <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-600 font-bold text-lg">{(user?.name || 'U').charAt(0).toUpperCase()}</span>}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-900">Profile Photo</span>
                <span className="block text-xs text-gray-500 mt-0.5">PayRound must approve photo changes before they appear. before they appear.</span>
              </span>
              <button disabled={uploadingPhoto} onClick={() => photoRef.current?.click()} className="text-xs font-semibold text-primary-600 border border-primary-200 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 shrink-0 disabled:opacity-60">
                {uploadingPhoto ? 'Sending…' : photo ? 'Change' : 'Upload'}
              </button>
            </div>
            {pendingPhoto && (
              <div className="mt-3 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                <img src={pendingPhoto} alt="pending" onClick={() => setZoomPhoto(pendingPhoto)} title="Tap to expand" className="w-10 h-10 rounded-lg object-cover border border-amber-300 cursor-zoom-in hover:opacity-90" />
                <p className="text-[11px] text-amber-800 font-medium">⏳ New photo awaiting PayRound approval. Your current photo stays until it&apos;s approved.</p>
              </div>
            )}
          </div>
        </div>

        {/* Preferences */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Preferences</p>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 mb-6 overflow-hidden">
          <SettingRow
            icon={theme === 'dark' ? <HiMoon className="w-5 h-5" /> : <HiSun className="w-5 h-5" />}
            title="Appearance"
            desc={theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}
            right={
              <button
                role="switch" aria-checked={theme === 'dark'}
                onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
                className={`relative w-11 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${theme === 'dark' ? 'translate-x-5.5 left-[22px]' : 'left-0.5'}`} />
              </button>
            }
          />
          <SettingRow
            icon={<HiBell className="w-5 h-5" />}
            title="Notifications"
            desc="View your latest notifications"
            right={<HiChevronRight className="w-4 h-4 text-gray-400" />}
            onClick={() => router.push('/notifications')}
          />
        </div>

        {/* Session */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Session</p>
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 mb-8 overflow-hidden">
          <SettingRow
            icon={<HiLogout className="w-5 h-5" />}
            title="Log Out"
            desc={`Signed in as ${user?.email || '—'}`}
            right={<HiChevronRight className="w-4 h-4 text-gray-400" />}
            onClick={handleLogout}
          />
        </div>

        {/* Danger zone */}
        <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 ml-1">Danger Zone</p>
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <SettingRow
            danger
            icon={<HiShieldExclamation className="w-5 h-5" />}
            title="Delete Account"
            desc="Permanently removes your profile and memberships. Cannot be undone."
            right={
              <button onClick={() => setShowDelete(!showDelete)} className="text-xs font-semibold text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100">
                {showDelete ? 'Cancel' : 'Delete…'}
              </button>
            }
          />
          {showDelete && (
            <div className="border-t border-red-100 p-4 bg-red-50/50">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Your password</label>
              <div className="relative mb-3">
                <HiLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                </button>
              </div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Type <span className="font-bold text-red-600">DELETE</span> to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full py-2.5 px-4 border border-gray-200 rounded-xl text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
              />
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || confirmText !== 'DELETE' || !password}
                className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
              </button>
              <p className="text-[11px] text-gray-400 mt-2 text-center">Both your password and the DELETE confirmation are required.</p>
            </div>
          )}
        </div>
      </div>

      <Footer />
      {zoomPhoto && <ImageLightbox src={zoomPhoto} alt="profile photo" onClose={() => setZoomPhoto(null)} />}
    </div>
  );
}
