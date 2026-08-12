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
  HiLockClosed, HiUser, HiBell, HiCreditCard
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
  const [soundsOn, setSoundsOn] = useState(true);
  useEffect(() => { (async () => { try { const m = await import('@/lib/sounds'); setSoundsOn(m.soundsEnabled()); } catch {} })(); }, []);
  const toggleSounds = async () => {
    try {
      const m = await import('@/lib/sounds');
      const next = !soundsOn;
      m.setSoundsEnabled(next);
      setSoundsOn(next);
      if (next) m.sounds.ding(); // little preview so you hear what you turned on
      toast(next ? '🔊 Sounds on — messages, payments and alerts will chime softly.' : '🔇 Sounds off — the app stays silent.');
    } catch {}
  };
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
  // Bank account details — editable here, shown on your profile (+ top of your group if you admin one)
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [paymentRemark, setPaymentRemark] = useState('');
  const [bankPassword, setBankPassword] = useState(''); // required to save bank details (stops phone-grabbers)
  const [bankSaving, setBankSaving] = useState(false);
  // Security — change password & email (current password required for both)
  const [mustChange, setMustChange] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    setTheme(localStorage.getItem('payround_theme') || 'light');
    try {
      if (localStorage.getItem('payround_must_change_pw') === '1' || (window.location.search || '').includes('mustChange=1')) setMustChange(true);
    } catch {}
  }, []);

  // Load current profile photo from the database
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.from('users').select('profile_pic, pending_profile_pic, bank_name, account_number, account_name, payment_remark').eq('email', user.email.toLowerCase()).single();
        if (data) {
          setBankName(data.bank_name || '');
          setAccountNumber(data.account_number || '');
          setAccountName(data.account_name || '');
          setPaymentRemark(data.payment_remark || '');
        }
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

  const saveBank = async () => {
    if (!user?.email) return;
    const acct = accountNumber.trim().replace(/\s+/g, '');
    if (acct && !/^\d{8,15}$/.test(acct)) { toast.error('Account number should be 8–15 digits (e.g. 10 digits for NUBAN).'); return; }
    const savingMoney = !!(bankName.trim() || acct || accountName.trim()); // clearing everything stays password-free
    if (savingMoney && !bankPassword) { toast.error('🔑 Enter your PayRound password to save bank details — it protects your money.'); return; }
    setBankSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      if (savingMoney) {
        const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email.toLowerCase(), password: bankPassword });
        if (reauthErr) { toast.error('Password incorrect — bank details NOT saved.'); setBankSaving(false); return; }
      }
      const row = { bank_name: bankName.trim() || null, account_number: acct || null, account_name: accountName.trim() || null, payment_remark: paymentRemark.trim() || null };
      const { error } = await supabase.from('users').update(row).eq('email', user.email.toLowerCase());
      if (error) throw error;
      setBankPassword('');
      toast.success('🏦 Bank details saved — they now show on your profile.');
    } catch (e) { toast.error(`Could not save bank details: ${e.message || 'try again'}`); }
    setBankSaving(false);
  };

  const applyTheme = (t) => {
    setTheme(t);
    localStorage.setItem('payround_theme', t);
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    toast.success(`${t === 'dark' ? '🌙 Dark' : '☀️ Light'} mode on`);
  };

  const handleLogout = async () => {
    const { signOutEverywhere } = await import('@/lib/session');
    await signOutEverywhere();
    logoutUser();
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
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email.toLowerCase(), password });
      if (reauthErr) {
        toast.error('Incorrect password — account not deleted.');
        setDeleting(false);
        return;
      }
      await supabase.from('members').delete().eq('member_email', user.email.toLowerCase());
      const { error } = await supabase.from('users').delete().eq('email', user.email.toLowerCase());
      if (error) throw error;
      const { signOutEverywhere } = await import('@/lib/session');
      await signOutEverywhere();
      logoutUser();
      toast.success('Account deleted. We are sad to see you go.');
      router.push('/');
    } catch (e) {
      toast.error(`Delete failed: ${e.message}`);
    }
    setDeleting(false);
  };

  // 🔑 Change password — needs the CURRENT password (a valid temporary one also works)
  const changePassword = async () => {
    if (!user?.email) { toast.error('Log in first.'); return; }
    if (newPw.length < 6) { toast.error('New password must be at least 6 characters.'); return; }
    if (newPw !== newPw2) { toast.error('New passwords do not match.'); return; }
    if (newPw === curPw) { toast.error('New password must be different from the current one.'); return; }
    setPwBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email.toLowerCase(), password: curPw });
      if (reauthErr) { toast.error('Current password is incorrect.'); setPwBusy(false); return; }
      const { error: upErr } = await supabase.auth.updateUser({ password: newPw });
      if (upErr) throw upErr;
      try { localStorage.removeItem('payround_must_change_pw'); } catch {}
      setMustChange(false);
      setCurPw(''); setNewPw(''); setNewPw2('');
      try { const { sounds } = await import('@/lib/sounds'); sounds.success(); } catch {}
      toast.success('Password changed! Use the new one next time you log in. 🔑');
    } catch (e) { toast.error(`Could not change password: ${e.message || 'try again'}`); }
    setPwBusy(false);
  };

  // ✉️ Change email — needs the current password; rewrites the address EVERYWHERE it appears
  const changeEmail = async () => {
    if (!user?.email) { toast.error('Log in first.'); return; }
    const em = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast.error('Enter a valid email address.'); return; }
    if (em === user.email.toLowerCase()) { toast.error('That is already your email.'); return; }
    setEmailBusy(true);
    const t = toast.loading('Updating your email everywhere…');
    try {
      const { supabase } = await import('@/lib/supabase');
      const oldE = user.email.toLowerCase();
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: oldE, password: emailPw });
      if (reauthErr) { toast.error('Password incorrect — email not changed.', { id: t, duration: 6000 }); setEmailBusy(false); return; }
      const { error: authEmailErr } = await supabase.auth.updateUser({ email: em });
      if (authEmailErr) throw authEmailErr;
      const { data: taken } = await supabase.from('users').select('email').eq('email', em).maybeSingle();
      if (taken) { toast.error('Another account already uses that email.', { id: t, duration: 6000 }); setEmailBusy(false); return; }
      // every table + column that stores the user's address
      const spots = [
        ['users', 'email'],
        ['members', 'member_email'],
        ['payments', 'user_email'],
        ['payouts', 'user_email'],
        ['messages', 'from_email'],
        ['messages', 'to_email'],
        ['group_messages', 'from_email'],
        ['groups', 'admin_email'],
        ['group_edit_requests', 'admin_email'],
        ['group_reviews', 'reviewer_email'],
        ['member_receipts', 'member_email'],
        ['member_reviews', 'member_email'],
        ['member_reviews', 'admin_email'],
        ['notifications', 'user_email'],
        ['verification_requests', 'user_email'],
        ['follows', 'follower_email'],
        ['follows', 'following_email'],
        ['ads', 'submitter_email'],
      ];
      for (const [table, col] of spots) {
        await supabase.from(table).update({ [col]: em }).eq(col, oldE); // best-effort per table
      }
      const stored = JSON.parse(localStorage.getItem('payround_user') || '{}');
      stored.email = em;
      localStorage.setItem('payround_user', JSON.stringify(stored));
      setUser(prev => ({ ...prev, email: em }));
      setNewEmail(''); setEmailPw('');
      try { const { sounds } = await import('@/lib/sounds'); sounds.success(); } catch {}
      toast.success('Email changed everywhere — log in with the new one next time. ✉️', { id: t, duration: 5000 });
    } catch (e) { toast.error(`Could not change email: ${e.message || 'try again'}`, { id: t, duration: 7000 }); }
    setEmailBusy(false);
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
            right={<div className="flex items-center gap-2">{user?.is_verified && <HiBadgeCheck className="w-5 h-5 text-blue-500 badge-emboss" />} <HiChevronRight className="w-4 h-4 text-gray-400" /></div>}
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

        {/* Bank Account */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Bank Account</p>
        <div className="bg-white rounded-2xl border border-gray-100 mb-6 p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-600"><HiCreditCard className="w-5 h-5" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">Your Bank Details</span>
              <span className="block text-xs text-gray-500 mt-0.5">Visible on your profile — and pinned at the top of any group you admin, so members know where to pay.</span>
            </span>
          </div>
          <div className="space-y-3">
            <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bank name — e.g. Palmpay, OPay, GTBank" maxLength={60}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="text" inputMode="numeric" value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/[^\d ]/g, ''))} placeholder="Account number — e.g. 9151723199" maxLength={19}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Account name — e.g. Basikoro James Okeroghene" maxLength={80}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="text" value={paymentRemark} onChange={e => setPaymentRemark(e.target.value)} placeholder="Payment remark (optional) — e.g. Write your name & spot number as transfer narration" maxLength={120}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <p className="text-[11px] text-gray-400 -mt-1">📝 The remark shows under your bank details on your profile and at the top of your group(s) — members see exactly what to write when paying you.</p>
            <input type="password" value={bankPassword} onChange={e => setBankPassword(e.target.value)} placeholder="🔑 Your PayRound password (required to save bank details)" autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={saveBank} disabled={bankSaving || !user?.email}
              className="w-full bg-primary-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50">
              {bankSaving ? 'Saving…' : 'Save Bank Details'}
            </button>
            <p className="text-[11px] text-gray-400">Tip: leave a field empty and save to clear it.</p>
          </div>
        </div>

        {/* 🔐 Security — visible always; highlighted when a temporary password must be replaced */}
        {mustChange && (
          <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-100 p-4">
            <p className="text-sm font-bold text-amber-900">⏳ You logged in with a TEMPORARY password</p>
            <p className="text-xs text-amber-800 mt-0.5">It stops working soon. Set your own new password below right now — use the temporary one as the &quot;current password&quot;.</p>
          </div>
        )}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Security</p>
        <div className="bg-white rounded-2xl border border-gray-100 mb-6 p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-600"><HiLockClosed className="w-5 h-5" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">Change Password</span>
              <span className="block text-xs text-gray-500 mt-0.5">You must enter your current password to set a new one.</span>
            </span>
          </div>
          <div className="space-y-3">
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="Current password (temporary one works too)" autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 6 characters)" autoComplete="new-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} placeholder="Repeat new password" autoComplete="new-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={changePassword} disabled={pwBusy || !curPw || !newPw || !user?.email}
              className="w-full bg-gray-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-black transition-all disabled:opacity-50">
              {pwBusy ? 'Updating…' : '🔑 Change Password'}
            </button>
          </div>
          <div className="border-t border-gray-100 my-4" />
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-600"><HiMail className="w-5 h-5" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">Change Email</span>
              <span className="block text-xs text-gray-500 mt-0.5">Current: <b>{user?.email || '—'}</b> — your new address is updated everywhere (groups, chats, payments…).</span>
            </span>
          </div>
          <div className="space-y-3">
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New email address"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} placeholder="Your current password (to confirm it is you)" autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={changeEmail} disabled={emailBusy || !newEmail.trim() || !emailPw || !user?.email}
              className="w-full bg-gray-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-black transition-all disabled:opacity-50">
              {emailBusy ? 'Updating everywhere…' : '✉️ Change Email'}
            </button>
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
          <SettingRow
            icon={<span className="text-lg leading-none">{soundsOn ? '🔊' : '🔇'}</span>}
            title="App Sounds"
            desc={soundsOn ? 'On — soft chimes for messages, payments & alerts' : 'Off — the app stays silent'}
            right={
              <button
                role="switch" aria-checked={soundsOn}
                onClick={toggleSounds}
                className={`relative w-11 h-6 rounded-full transition-colors ${soundsOn ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${soundsOn ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            }
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
