'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ImageLightbox from '@/components/ImageLightbox';
import { HiUser, HiMail, HiPhone, HiCamera, HiPencil, HiSave, HiBadgeCheck, HiClock, HiGift, HiLockClosed, HiLocationMarker, HiBriefcase, HiCalendar, HiIdentification } from 'react-icons/hi';
import toast from 'react-hot-toast';
import FollowersList from '@/components/FollowersList';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null); // real row from Supabase
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(null); // expanded photo src
  const [formData, setFormData] = useState({ name: '', phone: '', gender: '', dob: '', address: '', occupation: '', bio: '' });
  const photoRef = useRef(null);
  const [badgeReq, setBadgeReq] = useState(undefined); // undefined = still loading, null = none yet
  const [idType, setIdType] = useState('');
  const [idFront, setIdFront] = useState('');
  const [idBack, setIdBack] = useState('');
  const [applying, setApplying] = useState(false);
  const [myBiz, setMyBiz] = useState([]); // my approved business profile(s)
  const [followersCount, setFollowersCount] = useState(0);
  const [showFollowers, setShowFollowers] = useState(false);
  const [followerHighlight, setFollowerHighlight] = useState(''); // who to glow in the list (deep-link)
  const [showStartBiz, setShowStartBiz] = useState(false); // business-profile popup when they have none

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    let parsed;
    try { parsed = JSON.parse(stored); } catch { router.push('/login'); return; }
    setUser(parsed);
    setFormData(prev => ({ ...prev, name: parsed.name || '', phone: parsed.phone || '' }));
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('users')
          .select('name, email, phone, role, profile_pic, pending_profile_pic, is_verified, is_approved, approval_status, referral_earnings, referred_by, created_at, gender, dob, address, occupation, bio, bank_name, account_number, account_name')
          .eq('email', (parsed.email || '').toLowerCase())
          .single();
        if (data) {
          setAccount(data);
          setFormData({
            name: data.name || '', phone: data.phone || '',
            gender: data.gender || '', dob: data.dob || '',
            address: data.address || '', occupation: data.occupation || '', bio: data.bio || '',
          });
        }
        try {
          const { data: biz } = await supabase.from('ads')
            .select('id, business_name')
            .eq('submitter_email', (parsed.email || '').toLowerCase())
            .eq('status', 'approved');
          setMyBiz(biz || []);
        } catch {}
        try {
          const { data: fols } = await supabase.from('follows').select('follower_email').eq('following_email', (parsed.email || '').toLowerCase());
          setFollowersCount((fols || []).length);
        } catch {}
        try {
          const { data: reqs } = await supabase.from('verification_requests')
            .select('id, status, reason, created_at, reviewed_at, decline_reason')
            .eq('subject_type', 'user')
            .eq('user_email', (parsed.email || '').toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1);
          setBadgeReq(reqs && reqs[0] ? reqs[0] : null);
        } catch { setBadgeReq(null); }
      } catch (e) {
        console.log('Profile load:', e.message);
      }
    })();
  }, [router]);

  // 🎯 Deep-link from a follower notification (/profile?followers=1&hl=<email>):
  // pop the followers list open with that person scrolled into view & highlighted
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('followers') === '1') {
        setShowFollowers(true);
        const h = (sp.get('hl') || '').toLowerCase();
        if (h) setFollowerHighlight(h);
        window.history.replaceState({}, '', '/profile'); // clean URL so it doesn't re-trigger
      }
    } catch {}
  }, []);

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

  // Read + compress an ID photo for the badge application
  const pickIdImage = async (file, setter) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Image too large. Max 8MB.'); return; }
    try {
      const { compressImage } = await import('@/lib/image');
      setter(await compressImage(file, 900, 0.82));
    } catch { toast.error('Could not read that image — try another.'); }
  };

  // Submit a blue-badge application: valid ID (compared with the profile selfie by PayRound)
  const applyForBadge = async () => {
    if (!idType) { toast.error('Choose your ID type.'); return; }
    if (!idFront) { toast.error('Upload the front photo of your ID.'); return; }
    setApplying(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const now = new Date().toISOString();
      const row = {
        id: `vr-${Date.now()}`,
        subject_type: 'user',
        user_email: user.email.toLowerCase(),
        user_name: (account?.name || user.name || '').trim(),
        reason: `ID provided: ${idType}${idBack ? ' (front & back)' : ' (front only)'}`,
        id_front_url: idFront,
        id_back_url: idBack || null,
        status: 'pending',
        created_at: now,
      };
      const { error } = await supabase.from('verification_requests').insert(row);
      if (error) throw error;
      setBadgeReq({ id: row.id, status: 'pending', reason: row.reason, created_at: now });
      setIdType(''); setIdFront(''); setIdBack('');
      toast.success('🔵 Application sent! PayRound will compare your ID with your profile selfie.');
    } catch (e) {
      toast.error(`Could not apply: ${e.message || 'try again'}`);
    }
    setApplying(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Name is required.'); return; }
    setSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          ...(extrasUnlocked ? {
            gender: formData.gender || null,
            dob: formData.dob || null,
            address: formData.address.trim() || null,
            occupation: formData.occupation.trim() || null,
            bio: formData.bio.trim() || null,
          } : {}),
        })
        .eq('email', user.email.toLowerCase());
      if (error) throw error;
      const updated = { ...user, name: formData.name.trim(), phone: formData.phone.trim() };
      localStorage.setItem('payround_user', JSON.stringify(updated));
      setUser(updated);
      setAccount(prev => prev ? {
        ...prev, name: updated.name, phone: updated.phone,
        ...(extrasUnlocked ? { gender: formData.gender, dob: formData.dob, address: formData.address, occupation: formData.occupation, bio: formData.bio } : {}),
      } : prev);
      setEditing(false);
      toast.success('Profile updated!');
    } catch (e) {
      toast.error(`Save failed: ${e.message || 'try again'}`);
    }
    setSaving(false);
  };

  const refLink = `https://payround-omega.vercel.app/signup?ref=${user.id || ''}`;
  // Extra profile details unlock after PayRound approves the account
  const extrasUnlocked = !!(account?.is_approved || account?.approval_status === 'approved');

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
                {account?.is_verified && <HiBadgeCheck className="w-7 h-7 text-blue-500 shrink-0 badge-emboss" title="Verified by PayRound" />}
              </h2>
              {account?.approval_status === 'approved' && <p className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 mt-1 inline-block">✅ Account approved</p>}
              <button onClick={() => setShowFollowers(true)} title="See your followers"
                className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-full px-3 py-1 mt-2 text-[11px] font-semibold text-gray-700 transition-colors">
                👥 {followersCount} Follower{followersCount === 1 ? '' : 's'} · view
              </button>
            </div>
          </div>

          {/* Switch profile — personal (here) ⇄ business */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl mb-6">
            <p className="text-xs font-semibold text-gray-500 mb-2">SWITCH PROFILE</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary-600 text-white text-xs font-semibold shadow-sm">👤 Personal</span>
              {myBiz.map(b => (
                <button key={b.id} onClick={() => router.push(`/business/${b.id}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:border-gold-400 hover:text-gold-700 transition-colors">🏪 {b.business_name}</button>
              ))}
              {myBiz.length === 0 && (
                <button onClick={() => setShowStartBiz(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:border-gold-400 hover:text-gold-700 transition-colors">🏪 Business profile</button>
              )}
            </div>
          </div>

          {pendingPhoto && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
              <div className="flex items-center gap-3">
                <img src={pendingPhoto} alt="pending" onClick={() => setZoomPhoto(pendingPhoto)} title="Tap to expand" className="w-11 h-11 rounded-xl object-cover border border-amber-300 cursor-zoom-in hover:opacity-90" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5"><HiClock className="w-4 h-4 text-amber-600" /> Photo awaiting PayRound approval</p>
                  <p className="text-xs text-gray-500">Your current photo keeps showing until PayRound approves the new one.</p>
                  <button type="button" onClick={cancelPendingPhoto} className="mt-2 text-xs font-semibold text-red-700 border border-red-200 bg-white px-3 py-1 rounded-lg hover:bg-red-50">Cancel photo request</button>
                </div>
              </div>
            </div>
          )}

          {account?.is_verified ? (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
              <div className="flex items-center gap-3">
                <HiBadgeCheck className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Verified account</p>
                  <p className="text-xs text-gray-500">The 🔵 blue badge on your profile was granted by PayRound after comparing your ID with your profile selfie.</p>
                </div>
              </div>
            </div>
          ) : badgeReq?.status === 'pending' ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <HiClock className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">🔵 Blue badge application under review</p>
                  <p className="text-xs text-gray-500 mt-0.5">{badgeReq.reason || 'Valid ID submitted'} • Sent {badgeReq.created_at ? new Date(badgeReq.created_at).toLocaleDateString() : ''}</p>
                  <p className="text-xs text-gray-500 mt-1">PayRound is comparing the photo on your ID with your profile selfie. You will be notified here as soon as it is decided.</p>
                  <button type="button" onClick={cancelBadgeRequest} className="mt-2 text-xs font-semibold text-red-700 border border-red-200 bg-white px-3 py-1 rounded-lg hover:bg-red-50">Cancel this application</button>
                </div>
              </div>
            </div>
          ) : (badgeReq?.status === 'declined' && badgeReq.reviewed_at && Date.now() < new Date(badgeReq.reviewed_at).getTime() + 7 * 24 * 60 * 60 * 1000) ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <HiBadgeCheck className="w-6 h-6 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Verification declined</p>
                  <p className="text-xs text-gray-500 mt-0.5">{badgeReq.decline_reason ? `Reason: ${badgeReq.decline_reason}. ` : ''}You can re-apply on {new Date(new Date(badgeReq.reviewed_at).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
              <div className="flex items-start gap-3 mb-3">
                <HiBadgeCheck className="w-6 h-6 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Get the 🔵 verified badge</p>
                  <p className="text-xs text-gray-500 mt-0.5">Upload a valid means of ID. PayRound compares the photo on your ID with your profile selfie — the faces must match before the badge is granted.</p>
                </div>
              </div>
              {account?.approval_status === 'approved' && photo ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">ID type *</label>
                    <select value={idType} onChange={e => setIdType(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Choose your ID…</option>
                      <option>National ID Card</option>
                      <option>NIN Slip</option>
                      <option>Driver&apos;s License</option>
                      <option>International Passport</option>
                      <option>Voter&apos;s Card</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Front of ID *</label>
                      <label className="block cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickIdImage(e.target.files[0], setIdFront); e.target.value = ''; }} />
                        {idFront ? (
                          <img src={idFront} alt="ID front" className="w-full h-24 object-contain rounded-lg border border-blue-300 bg-gray-900" />
                        ) : (
                          <div className="h-24 rounded-lg border-2 border-dashed border-blue-300 flex flex-col items-center justify-center text-blue-500">
                            <HiIdentification className="w-6 h-6" /><span className="text-[11px] font-medium mt-1">Tap to upload</span>
                          </div>
                        )}
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Back of ID (optional)</label>
                      <label className="block cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickIdImage(e.target.files[0], setIdBack); e.target.value = ''; }} />
                        {idBack ? (
                          <img src={idBack} alt="ID back" className="w-full h-24 object-contain rounded-lg border border-blue-200 bg-gray-900" />
                        ) : (
                          <div className="h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
                            <HiCamera className="w-6 h-6" /><span className="text-[11px] font-medium mt-1">Tap to upload</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                  <button onClick={applyForBadge} disabled={applying || !idType || !idFront} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                    {applying ? 'Sending…' : 'Apply for the 🔵 Blue Badge'}
                  </button>
                  <p className="text-[11px] text-gray-400">Your ID is only visible to PayRound for this review — it never shows on your public profile. Declined applications can re-apply after 7 days.</p>
                </div>
              ) : (
                <p className="text-xs text-gray-500 border border-blue-100 rounded-lg p-3">You can apply for the blue badge after your account (with your profile selfie) has been approved by PayRound.</p>
              )}
            </div>
          )}

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
                  <input type="email" value={user.email} disabled className="w-full pl-11 pr-4 py-3 border border-gray-100 bg-gray-50 text-gray-400 rounded-xl text-sm" />
                  <p className="text-[11px] text-gray-500 mt-1">To change your email, open <button type="button" onClick={() => router.push('/settings')} className="text-primary-600 font-semibold underline">Settings</button> and enter your password.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <div className="relative">
                  <HiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="tel" value={formData.phone} onChange={e => setFormData(p => ({...p, phone: e.target.value}))} className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              {extrasUnlocked ? (
                <>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 mb-3">ADDITIONAL DETAILS</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Gender</label>
                      <select value={formData.gender} onChange={e => setFormData(p => ({...p, gender: e.target.value}))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">Select…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Birth</label>
                      <input type="date" value={formData.dob} onChange={e => setFormData(p => ({...p, dob: e.target.value}))} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Residential Address</label>
                    <div className="relative">
                      <HiLocationMarker className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="text" value={formData.address} onChange={e => setFormData(p => ({...p, address: e.target.value}))} placeholder="Your home address" className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Occupation</label>
                    <div className="relative">
                      <HiBriefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="text" value={formData.occupation} onChange={e => setFormData(p => ({...p, occupation: e.target.value}))} placeholder="e.g. Trader, Teacher" className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Short Bio</label>
                    <textarea value={formData.bio} onChange={e => setFormData(p => ({...p, bio: e.target.value}))} placeholder="Tell group admins a little about yourself (e.g. why you save)" rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex items-start gap-2">
                  <HiLockClosed className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Gender, date of birth, address, occupation and bio unlock after PayRound approves your account.</span>
                </div>
              )}
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
              <button onClick={() => router.push('/settings')} className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-xl w-full text-left hover:bg-emerald-100/60 transition-colors">
                <div>
                  <p className="text-xs text-gray-500">🏦 Bank details (visible on your profile)</p>
                  <p className="text-sm font-medium text-gray-900">
                    {(account?.bank_name || account?.account_number || account?.account_name)
                      ? <>{account.bank_name || '—'} • <span className="font-mono">{account.account_number || '—'}</span> • {account.account_name || '—'}</>
                      : 'Not added yet — tap to add in Settings'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-primary-600 shrink-0 ml-2">Edit →</span>
              </button>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Gender</p><p className="text-sm font-medium text-gray-900">{account?.gender || (extrasUnlocked ? '—' : 'Unlocks after approval')}</p></div><HiIdentification className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Date of Birth</p><p className="text-sm font-medium text-gray-900">{account?.dob || '—'}</p></div><HiCalendar className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Address</p><p className="text-sm font-medium text-gray-900">{account?.address || '—'}</p></div><HiLocationMarker className="w-5 h-5 text-gray-400" /></div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Occupation</p><p className="text-sm font-medium text-gray-900">{account?.occupation || '—'}</p></div><HiBriefcase className="w-5 h-5 text-gray-400" /></div>
              {account?.bio && (
                <div className="p-4 bg-gray-50 rounded-xl"><p className="text-xs text-gray-500 mb-1">Bio</p><p className="text-sm font-medium text-gray-900 whitespace-pre-line">{account.bio}</p></div>
              )}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"><div><p className="text-xs text-gray-500">Referral Earnings</p><p className="text-sm font-medium text-gray-900">₦{Number(account?.referral_earnings || 0).toLocaleString()}</p></div><HiGift className="w-5 h-5 text-gray-400" /></div>
              <button onClick={() => setEditing(true)} className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-all"><HiPencil className="w-4 h-4" /> Edit Profile</button>
            </div>
          )}
        </div>
      </div>
      <Footer />
      {zoomPhoto && <ImageLightbox src={zoomPhoto} alt="profile photo" onClose={() => setZoomPhoto(null)} />}
      {showFollowers && <FollowersList userEmail={user.email} userName={account?.name || user.name} onClose={() => { setShowFollowers(false); setFollowerHighlight(''); }} highlight={followerHighlight} />}
      {showStartBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowStartBiz(false)}>
          <div className="bg-white w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 bg-gold-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><span className="text-2xl">🏪</span></div>
            <h3 className="font-bold text-gray-900 mb-1">No business profile yet</h3>
            <p className="text-xs text-gray-500 mb-4">Create your free business profile — show your items with prices, receive messages from buyers, and share everything to WhatsApp with one tap.</p>
            <button onClick={() => router.push('/ads')} className="w-full bg-gold-500 hover:bg-gold-400 text-gray-900 font-bold text-sm py-3 rounded-xl transition-colors">Start a Business Profile</button>
            <button onClick={() => setShowStartBiz(false)} className="w-full text-xs text-gray-400 font-medium mt-3">Maybe later</button>
          </div>
        </div>
      )}
    </div>
  );
}
