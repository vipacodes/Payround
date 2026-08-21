'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HiCheckCircle, HiArrowLeft, HiLightningBolt, HiUserGroup, HiCurrencyDollar, HiCalendar, HiDocumentText, HiShieldCheck, HiPhotograph, HiTrash } from 'react-icons/hi';
import { HiBanknotes } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { GROUP_COLORS, platformInfo } from '@/lib/data';
import { frequencyLabel } from '@/lib/payments';

const STEPS = [
  { num: 1, title: 'Group Info' },
  { num: 2, title: 'Contribution' },
  { num: 3, title: 'Bank Details' },
  { num: 4, title: 'Rules & Constitution' },
  { num: 5, title: 'Review & Pay' },
];

export default function CreateGroupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [paid, setPaid] = useState(false);
  const [startedTrial, setStartedTrial] = useState(false);
  const fileSelfieRef = useRef(null);
  const fileIdRef = useRef(null);
  const fileReceiptRef = useRef(null);

  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const fileAvatarRef = useRef(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [myGroups, setMyGroups] = useState(null); // my submissions — pending/live/declined, nothing auto-deleted
  const [trialUsed, setTrialUsed] = useState(false);
  const [selectedColor, setSelectedColor] = useState(GROUP_COLORS[0]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    contributionAmount: '',
    payoutAmount: '',
    schedule: 'Weekly',
    customDays: '',
    maxMembers: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    constitution: '',
    rules: [''],
    idType: 'NIN',
    color: GROUP_COLORS[0],
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('payround_user');
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        const flag = localStorage.getItem(`trial_used_${u.email?.toLowerCase()}`);
        if (flag) setTrialUsed(true);
      } catch {}
    }
  }, []);

  const handleNext = () => {
    if (step === 1) {
      if (!formData.name || !formData.description) { toast.error('Group name and description required'); return; }
      if (!selfieFile) { toast.error('Clear selfie is mandatory for KYC'); return; }
      if (!idFile) { toast.error('Valid ID (NIN/Voter/Driver/Passport) is mandatory'); return; }
      if (!avatarPreview) { toast.error('Group logo is required — upload it in step 1'); return; }
    }
    if (step === 2) {
      const amt = parseInt(formData.contributionAmount, 10);
      const mm = parseInt(formData.maxMembers, 10);
      if (!amt || amt <= 0) { toast.error('Enter the contribution amount each spot pays.'); return; }
      if (!Number.isInteger(mm) || mm < 2 || mm > 200) { toast.error('Number of spots (max members) must be between 2 and 200.'); return; }
      if (formData.schedule === 'Custom') {
        const d = parseInt(formData.customDays, 10);
        if (!Number.isInteger(d) || d < 2 || d > 365) { toast.error('Custom schedule: enter every how many days (2–365).'); return; }
      }
      const pay = parseInt(formData.payoutAmount, 10);
      if (formData.payoutAmount !== '' && !(pay > 0)) { toast.error('Payout amount must be more than ₦0 — or leave it empty for the full pot.'); return; }
      if (pay > 0 && pay > amt * mm) { toast.error(`Payout can't be more than ₦${(amt * mm).toLocaleString()} — that's everything the group collects each round.`); return; }
    }
    if (step < 5) setStep(step + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  const handleStartTrial = () => {
    if (trialUsed) { toast.error('You have already used your one-time 7-day trial. Payment required.'); return; }
    if (!selfieFile || !idFile) { toast.error('Selfie + ID mandatory before trial'); return; }
    if (!avatarPreview) { toast.error('Group logo is required'); return; }
    setStartedTrial(true);
    const storedUser = localStorage.getItem('payround_user');
    if (storedUser) {
      try { const u = JSON.parse(storedUser); localStorage.setItem(`trial_used_${u.email?.toLowerCase()}`, 'true'); } catch {}
    }
    setTimeout(async () => {
      const groupId = 'PR' + Math.floor(10000 + Math.random() * 90000);
      const ok = await syncGroupToSupabase(groupId, 'trial_active', false);
      if (!ok) { setStartedTrial(false); return; } // error already shown — user keeps everything and can retry
      toast.success('🎉 7-day trial started!');
      const groups = JSON.parse(localStorage.getItem('payround_groups_custom') || '[]');
      groups.push({ id: groupId, ...formData, color: selectedColor, status: 'trial_active', trialEndsAt: new Date(Date.now()+7*24*60*60*1000).toISOString(), createdAt: new Date().toISOString() });
      localStorage.setItem('payround_groups_custom', JSON.stringify(groups));
      toast.success(`Group ${groupId} created on trial!`);
      router.push(`/groups/${groupId}`);
    }, 1500);
  };

  const handlePay = () => {
    if (!selfieFile || !idFile) { toast.error('Selfie + ID mandatory'); return; }
    if (!avatarPreview) { toast.error('Group logo is required'); return; }
    if (!receiptFile) { toast.error(`Upload receipt of ₦${planPrice.toLocaleString()} to Palmpay 9151723199 Basikoro James Okeroghene`); return; }
    setPaid(true);
    setTimeout(async () => {
      const groupId = 'PR' + Math.floor(10000 + Math.random() * 90000);
      const ok = await syncGroupToSupabase(groupId, 'pending_owner', true);
      if (!ok) { setPaid(false); return; } // error already shown — user keeps everything and can retry
      toast.success('Payment receipt uploaded - pending PayRound approval.');
      const groups = JSON.parse(localStorage.getItem('payround_groups_custom') || '[]');
      groups.push({ id: groupId, ...formData, color: selectedColor, status: 'pending_owner', hasReceipt: true, createdAt: new Date().toISOString() });
      localStorage.setItem('payround_groups_custom', JSON.stringify(groups));
      const waMsg = `New Group Request: ${formData.name} by user, ₦${planPrice.toLocaleString()} paid (${selectedPlan}-month plan) to Palmpay 9151723199, needs approval. Selfie+ID attached.`;
      const waLink = `https://wa.me/2349151723199?text=${encodeURIComponent(waMsg)}`;
      window.open(waLink, '_blank');
      toast.success(`Group ${groupId} saved pending PayRound approval`);
      router.push(`/`);
    }, 1500);
  };

  const addRule = () => setFormData(prev => ({ ...prev, rules: [...prev.rules, ''] }));
  const updateRule = (index, value) => { const newRules = [...formData.rules]; newRules[index]=value; setFormData(prev=>({...prev, rules:newRules})); };
  const removeRule = (index) => { if (formData.rules.length>1) setFormData(prev=>({...prev, rules: prev.rules.filter((_,i)=>i!==index)})); };
  const updateField = (field, value) => setFormData(prev=>({...prev, [field]:value}));

  // Subscription plans — owner-controlled 1/6/12-month base prices with package/add-on pricing.
  const PLAN_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
  const [planPrices, setPlanPrices] = useState({ 1: 1500, 6: 8000, 12: 15000 });
  const [selectedPlan, setSelectedPlan] = useState(6);
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: s } = await supabase.from('public_pricing').select('plan_1m, plan_6m, plan_12m').eq('id', 1).single();
        if (s) setPlanPrices({ 1: s.plan_1m ?? 1500, 6: s.plan_6m ?? 8000, 12: s.plan_12m ?? 15000 });
      } catch {}
    })();
  }, []);
  // My group submissions — pending approval stays visible, declined stays unless I delete it
  const loadMyGroups = async () => {
    let email = '';
    try { email = (JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase(); } catch {}
    if (!email) { setMyGroups([]); return; }
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.from('groups')
        .select('id, name, status, rejection_reason, amount, frequency, frequency_days, payout_amount, plan_months, avatar_url, created_at')
        .eq('admin_email', email).order('created_at', { ascending: false });
      setMyGroups(data || []);
    } catch { setMyGroups([]); }
  };
  useEffect(() => { loadMyGroups(); }, []);

  // Only the group ADMIN can remove their own submission (pending or declined)
  const deleteMyGroup = async (g) => {
    if (!window.confirm(`Delete "${g.name}" permanently? This cannot be undone.`)) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('groups').delete().eq('id', g.id);
      if (error) throw error;
      try {
        const keep = JSON.parse(localStorage.getItem('payround_groups_custom') || '[]').filter(x => x.id !== g.id);
        localStorage.setItem('payround_groups_custom', JSON.stringify(keep));
      } catch {}
      setMyGroups(prev => (prev || []).filter(x => x.id !== g.id));
      toast.success('Submission deleted.');
    } catch (e) { toast.error(`Could not delete: ${e.message || 'try again'}`); }
  };

  const priceForMonths = (months) => {
    const oneMonth = Number(planPrices[1] || 0);
    const sixMonths = Number(planPrices[6] || 0);
    const annual = Number(planPrices[12] || 0);
    if (months >= 1 && months <= 5) return oneMonth * months;
    if (months === 6) return sixMonths;
    if (months >= 7 && months <= 11) return sixMonths + (oneMonth * (months - 6));
    if (months === 12) return annual;
    return 0;
  };
  const planPrice = priceForMonths(selectedPlan);

  // Shrink any already-picked photo so big camera shots never break the upload
  const shrinkDataUrl = (dataUrl, maxSize = 900, quality = 0.8) => new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    if (!dataUrl.startsWith('data:image')) return resolve(dataUrl); // pdf/other left as-is
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((img.width || 1) * scale));
        c.height = Math.max(1, Math.round((img.height || 1) * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  // Store group in Supabase so the owner panel can review/approve it (reflects on both sites).
  // Returns true ONLY when the row is really saved — we never pretend otherwise.
  const syncGroupToSupabase = async (groupId, status, withReceipt) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      let adminEmail = '', adminName = '';
      const s = localStorage.getItem('payround_user');
      if (s) { try { const u = JSON.parse(s); adminEmail = u.email || ''; adminName = u.name || ''; } catch {} }
      const [selfie, idImg, logo, receipt] = await Promise.all([
        shrinkDataUrl(selfiePreview, 768, 0.8),
        shrinkDataUrl(idPreview, 1000, 0.82),
        shrinkDataUrl(avatarPreview, 512, 0.85),
        withReceipt ? shrinkDataUrl(receiptPreview, 1000, 0.82) : Promise.resolve(null),
      ]);
      // If anything is still heavy, shrink harder instead of failing —
      // pictures are already compressed at pick time, so this is a last resort.
      const LIMIT = 2200000;
      const shrinkUntilFits = async (dataUrl) => {
        if (!dataUrl || String(dataUrl).length <= LIMIT) return dataUrl;
        let out = dataUrl;
        for (const [size, q] of [[800, 0.7], [640, 0.6], [480, 0.5]]) {
          out = await shrinkDataUrl(out, size, q);
          if (String(out).length <= LIMIT) return out;
        }
        return out;
      };
      const [selfie2, idImg2, logo2, receipt2] = await Promise.all([
        shrinkUntilFits(selfie), shrinkUntilFits(idImg), shrinkUntilFits(logo), shrinkUntilFits(receipt),
      ]);
      const tooBig = [selfie2, idImg2, logo2, receipt2].filter(Boolean).some(d => String(d).length > LIMIT);
      if (tooBig) {
        toast.error('One of your files could not be compressed — please re-upload it as a normal photo (JPG or PNG), not a video or PDF.');
        return false;
      }
      const { error } = await supabase.from('groups').insert({
        id: groupId,
        name: formData.name,
        description: formData.description,
        amount: parseInt(formData.contributionAmount) || 0,
        frequency: formData.schedule === 'Custom' ? 'Custom' : (formData.schedule || 'Weekly'),
        frequency_days: formData.schedule === 'Custom' ? (parseInt(formData.customDays, 10) || null) : null,
        payout_amount: parseInt(formData.payoutAmount, 10) > 0 ? parseInt(formData.payoutAmount, 10) : null,
        max_members: parseInt(formData.maxMembers) || 0,
        color: selectedColor,
        admin_email: adminEmail,
        admin_name: adminName,
        status,
        selfie_url: selfie2 || null,
        id_url: idImg2 || null,
        id_type: formData.idType,
        avatar_url: logo2 || null,
        plan_months: withReceipt ? selectedPlan : null,
        plan_price: withReceipt ? planPrice : null,
        expiry_at: withReceipt ? new Date(Date.now() + selectedPlan * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
        creation_receipt_url: withReceipt ? (receipt2 || null) : null,
      });
      if (error) throw error;
      loadMyGroups();
      return true;
    } catch (e) {
      console.log('Group sync to Supabase failed', e.message);
      toast.error(`Could not submit your group — ${e.message || 'check your connection and try again'}. Nothing was saved yet, your details are safe here.`);
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gold-200">
            <HiLightningBolt className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create an Ajo Group</h1>
          <p className="text-gray-500 mt-1">Set up your group in 5 steps - Selfie + Valid ID + Group Logo required, Color picker 12 options</p>
        </div>

        {myGroups && myGroups.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <p className="text-sm font-bold text-gray-900 mb-3">📋 My group submissions</p>
            <div className="space-y-2.5">
              {myGroups.map(g => (
                <div key={g.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    {g.avatar_url ? (
                      <img src={g.avatar_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                    ) : (
                      <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">{(g.name || 'G').charAt(0)}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{g.name} <span className="text-[10px] font-normal text-gray-400">• {g.id}</span></p>
                      <p className="text-[11px] text-gray-500">₦{Number(g.amount || 0).toLocaleString()} {frequencyLabel(g)} • {g.plan_months ? `${g.plan_months}-month plan` : 'trial'} • {g.created_at ? new Date(g.created_at).toLocaleDateString() : ''}</p>
                    </div>
                    {g.status === 'pending_owner' && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">⏳ Pending approval</span>}
                    {g.status === 'trial_active' && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full shrink-0">🧪 Trial</span>}
                    {['active', 'approved'].includes(g.status) && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full shrink-0">✅ Live</span>}
                    {g.status === 'rejected' && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full shrink-0">❌ Declined</span>}
                  </div>
                  {g.status === 'rejected' && g.rejection_reason && (
                    <p className="text-[11px] text-red-600 mt-2">Reason: {g.rejection_reason}. Your details stay saved — fix the issue and create a fresh group anytime, or delete this submission.</p>
                  )}
                  {g.status === 'pending_owner' && (
                    <p className="text-[11px] text-gray-400 mt-1.5">Waiting for PayRound review — you will be notified. Nothing is deleted automatically.</p>
                  )}
                  <div className="flex gap-3 mt-2">
                    {['active', 'approved'].includes(g.status) && (
                      <button onClick={() => router.push(`/groups/${g.id}`)} className="text-[11px] font-semibold text-primary-600">Open group →</button>
                    )}
                    {['pending_owner', 'rejected'].includes(g.status) && (
                      <button onClick={() => deleteMyGroup(g)} className="text-[11px] font-semibold text-red-500 hover:text-red-600">🗑 Delete submission</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-8 px-2">
          {STEPS.map((s, index) => (
            <div key={s.num} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step > s.num ? 'bg-emerald-500 text-white' : step === s.num ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-gray-200 text-gray-500'}`}>
                {step > s.num ? <HiCheckCircle className="w-5 h-5" /> : s.num}
              </div>
              {index < STEPS.length - 1 && (<div className={`hidden md:block w-20 h-0.5 mx-2 ${step > s.num ? 'bg-emerald-500' : 'bg-gray-200'}`} />)}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2"><HiUserGroup className="w-6 h-6 text-primary-600" /><h2 className="text-lg font-semibold">Group Information</h2></div>
              <div><label className="block text-sm font-medium mb-1.5">Group Name *</label><input type="text" value={formData.name} onChange={(e)=>updateField('name', e.target.value)} placeholder="e.g., Bright Future Ajo" className="w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Description *</label><textarea value={formData.description} onChange={(e)=>updateField('description', e.target.value)} placeholder="Describe purpose..." rows={3} className="w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 resize-none outline-none" /></div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Group Logo * <span className="text-gray-400 text-xs font-normal">(required — shown as the group's picture everywhere)</span></label>
                <input type="file" ref={fileAvatarRef} accept="image/*" className="hidden" onChange={async (e)=>{const f=e.target.files[0]; if(f){ if(f.size>8*1024*1024){toast.error('Max 8MB'); return;} try { const { compressImage } = await import('@/lib/image'); setAvatarPreview(await compressImage(f, 512, 0.85)); } catch { toast.error('Could not read that image'); } }}} />
                {avatarPreview ? (
                  <div className="relative w-24 h-24"><img src={avatarPreview} className="w-24 h-24 rounded-2xl object-cover border" /><button type="button" onClick={()=>setAvatarPreview(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">×</button></div>
                ) : (
                  <div onClick={()=>fileAvatarRef.current?.click()} className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer bg-white hover:border-primary-400 w-fit"><HiPhotograph className="w-6 h-6 mx-auto text-gray-400"/><p className="text-xs mt-1">Upload Group Logo *</p></div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Group Color * (12 options)</label>
                <div className="flex flex-wrap gap-2">
                  {GROUP_COLORS.map(c=>(
                    <button key={c} type="button" onClick={()=>{setSelectedColor(c); updateField('color', c);}} className={`w-10 h-10 rounded-full border-2 ${selectedColor===c?'border-black scale-110 shadow-lg':'border-white shadow'} transition-all`} style={{backgroundColor:c}} />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">Selected: <span className="inline-block w-3 h-3 rounded-full" style={{backgroundColor:selectedColor}} /> {selectedColor}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-bold text-sm text-amber-800">KYC Required - Selfie + Valid ID *</h4>
                <div className="grid md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Clear Selfie *</label>
                    <input type="file" ref={fileSelfieRef} accept="image/*,image/heic,image/heif" onChange={async (e)=>{const f=e.target.files[0]; e.target.value=''; if(!f) return; if((f.type||'').startsWith('video/') || (f.type||'')==='application/pdf'){ toast.error('Photos only — videos and PDFs are not accepted.'); return; } if(f.size>15*1024*1024){ toast.error('That photo is too large (max 15MB). Take a normal photo and try again.'); return; } try { const { compressImage } = await import('@/lib/image'); const small = await compressImage(f, 768, 0.8); setSelfieFile(f); setSelfiePreview(small); } catch { toast.error('Could not read that photo. Use a normal JPG or PNG picture.'); }}} className="hidden" />
                    {selfiePreview ? (<div className="relative w-24 h-24"><img src={selfiePreview} className="w-24 h-24 rounded-xl object-cover border" /><button type="button" onClick={()=>{setSelfieFile(null); setSelfiePreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">×</button></div>) : (<div onClick={()=>fileSelfieRef.current?.click()} className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer bg-white hover:border-primary-400"><HiPhotograph className="w-6 h-6 mx-auto text-gray-400"/><p className="text-xs mt-1">Upload Selfie</p></div>)}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">ID Type *</label>
                    <select value={formData.idType} onChange={(e)=>updateField('idType', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mb-2"><option value="NIN">NIN</option><option value="Voter's Card">Voter's Card</option><option value="Driver's License">Driver's License</option><option value="International Passport">Passport</option></select>
                    <input type="file" ref={fileIdRef} accept="image/*,image/heic,image/heif" onChange={async (e)=>{const f=e.target.files[0]; e.target.value=''; if(!f) return; if((f.type||'').startsWith('video/') || (f.type||'')==='application/pdf'){ toast.error('Photos only — snap a clear picture of your ID instead of a PDF or video.'); return; } if(f.size>15*1024*1024){ toast.error('That photo is too large (max 15MB). Take a normal photo and try again.'); return; } try { const { compressImage } = await import('@/lib/image'); const small = await compressImage(f, 1000, 0.82); setIdFile(f); setIdPreview(small); } catch { toast.error('Could not read that photo. Use a normal JPG or PNG picture.'); }}} className="hidden" />
                    {idPreview ? (<div className="relative w-24 h-24"><img src={idPreview} className="w-24 h-24 rounded-xl object-cover border" /><button type="button" onClick={()=>{setIdFile(null); setIdPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">×</button></div>) : (<div onClick={()=>fileIdRef.current?.click()} className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer bg-white hover:border-primary-400"><HiShieldCheck className="w-6 h-6 mx-auto text-gray-400"/><p className="text-xs mt-1">Upload {formData.idType}</p></div>)}
                  </div>
                </div>
              </div>

            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4"><HiCurrencyDollar className="w-6 h-6 text-primary-600" /><h2 className="text-lg font-semibold">Contribution</h2></div>
              <div><label className="block text-sm font-medium mb-1.5">Amount (₦) *</label><input type="number" value={formData.contributionAmount} onChange={(e)=>updateField('contributionAmount', e.target.value)} placeholder="e.g., 50000" className="w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Schedule *</label><select value={formData.schedule} onChange={(e)=>updateField('schedule', e.target.value)} className="w-full px-4 py-3 border rounded-xl text-sm bg-white outline-none"><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Every 2 Weeks">Every 2 Weeks</option><option value="Monthly">Monthly</option><option value="Custom">Custom</option></select></div>
              {formData.schedule==='Custom' && (<div><label className="block text-sm font-medium mb-1.5">Every how many days?</label><input type="number" value={formData.customDays} onChange={(e)=>updateField('customDays', e.target.value)} placeholder="e.g., 10" className="w-full px-4 py-3 border rounded-xl text-sm outline-none" /></div>)}
              <div><label className="block text-sm font-medium mb-1.5">Number of Spots (Max Members) *</label><input type="number" value={formData.maxMembers} onChange={(e)=>updateField('maxMembers', e.target.value)} placeholder="e.g., 10" className="w-full px-4 py-3 border rounded-xl text-sm outline-none" /></div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Payout each spot collects (₦) <span className="font-normal text-gray-400">— optional</span></label>
                <input type="number" value={formData.payoutAmount} onChange={(e)=>updateField('payoutAmount', e.target.value)} placeholder={(parseInt(formData.contributionAmount,10)||0) * (parseInt(formData.maxMembers,10)||0) > 0 ? `leave empty = full pot ₦${((parseInt(formData.contributionAmount,10)||0) * (parseInt(formData.maxMembers,10)||0)).toLocaleString()}` : 'e.g., 40000'} className="w-full px-4 py-3 border rounded-xl text-sm outline-none" />
                <p className="text-[11px] text-gray-400 mt-1">Leave it empty and every spot collects the full pot. Set a lower amount and the difference becomes <b>your interest</b> as the admin.</p>
              </div>
              {(() => {
                const amt = parseInt(formData.contributionAmount, 10) || 0;
                const mm = parseInt(formData.maxMembers, 10) || 0;
                if (!amt || !mm) return null;
                const collected = amt * mm;
                const customPay = parseInt(formData.payoutAmount, 10);
                const pay = customPay > 0 ? customPay : collected;
                const per = collected - pay;
                const perLabel = formData.schedule === 'Custom' ? `${parseInt(formData.customDays, 10) || '?'} days` : formData.schedule.toLowerCase();
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">👑 Money preview <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">ONLY YOU EVER SEE THE INTEREST</span></p>
                    <p>Group collects <b>₦{collected.toLocaleString()}</b> every {perLabel} ({`₦${amt.toLocaleString()} × ${mm} spots`}).</p>
                    <p>Each spot collects <b>₦{pay.toLocaleString()}</b> on its turn — members see this as their expected payout.</p>
                    {per > 0
                      ? <p className="font-bold">Your interest: ₦{per.toLocaleString()} every {perLabel} · <span className="text-emerald-700">₦{(per * mm).toLocaleString()} per full cycle</span> ({mm} rounds)</p>
                      : <p className="text-amber-700">Interest: ₦0 — spots collect the full pot.</p>}
                  </div>
                );
              })()}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4"><HiBanknotes className="w-6 h-6 text-primary-600" /><h2 className="text-lg font-semibold">Bank Details (for members to pay admin)</h2></div>
              <p className="text-sm text-gray-500">Members will send contributions to this account - not to PayRound.</p>
              <div><label className="block text-sm font-medium mb-1.5">Bank Name *</label><input type="text" value={formData.bankName} onChange={(e)=>updateField('bankName', e.target.value)} placeholder="GTBank" className="w-full px-4 py-3 border rounded-xl text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Account Name *</label><input type="text" value={formData.accountName} onChange={(e)=>updateField('accountName', e.target.value)} placeholder="Account holder" className="w-full px-4 py-3 border rounded-xl text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium mb-1.5">Account Number *</label><input type="text" value={formData.accountNumber} onChange={(e)=>updateField('accountNumber', e.target.value)} placeholder="0123456789" maxLength={10} className="w-full px-4 py-3 border rounded-xl text-sm font-mono outline-none" /></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4"><HiDocumentText className="w-6 h-6 text-primary-600" /><h2 className="text-lg font-semibold">Rules & Constitution</h2></div>
              <div><label className="block text-sm font-medium mb-1.5">Constitution</label><textarea value={formData.constitution} onChange={(e)=>updateField('constitution', e.target.value)} placeholder="Purpose, goals..." rows={4} className="w-full px-4 py-3 border rounded-xl text-sm resize-none outline-none" /></div>
              <div>
                <div className="flex justify-between mb-2"><label className="text-sm font-medium">Rules</label><button onClick={()=>setFormData(prev=>({...prev, rules:[...prev.rules,'']}))} className="text-xs text-primary-600">+ Add Rule</button></div>
                <div className="space-y-2">{formData.rules.map((rule, i)=>(<div key={i} className="flex gap-2"><span className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-2">{i+1}</span><input type="text" value={rule} onChange={(e)=>{const nr=[...formData.rules]; nr[i]=e.target.value; setFormData(p=>({...p, rules:nr}));}} placeholder={`Rule ${i+1}`} className="flex-1 px-4 py-3 border rounded-xl text-sm outline-none" />{formData.rules.length>1 && (<button onClick={()=>setFormData(prev=>({...prev, rules: prev.rules.filter((_,idx)=>idx!==i)}))} className="text-red-500 px-2">×</button>)}</div>))}</div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2"><HiShieldCheck className="w-6 h-6 text-primary-600" /><h2 className="text-lg font-semibold">Review & Pay</h2></div>
              
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="font-bold text-sm">Pay to PayRound</div>
                <div className="text-xs mt-1">Bank: Palmpay | Acct: 9151723199 | Name: Basikoro James Okeroghene</div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Group</span><span className="font-medium">{formData.name || 'Not set'} <span className="inline-block w-3 h-3 rounded-full ml-1" style={{backgroundColor:selectedColor}} /></span></div>
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-medium">₦{(parseInt(formData.contributionAmount)||0).toLocaleString()} / {formData.schedule === 'Custom' ? `every ${formData.customDays || '?'} days` : formData.schedule}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Spots</span><span className="font-medium">{formData.maxMembers || 'Not set'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Payout per spot</span><span className="font-medium">{parseInt(formData.payoutAmount, 10) > 0 ? `₦${parseInt(formData.payoutAmount, 10).toLocaleString()}` : `Full pot ₦${((parseInt(formData.contributionAmount, 10) || 0) * (parseInt(formData.maxMembers, 10) || 0)).toLocaleString()}`}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">KYC</span><span className="font-medium">{selfieFile?'Selfie ✅':'Selfie ❌'} & {idFile?`${formData.idType} ✅`:`ID ❌`}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Color</span><span className="font-medium">{selectedColor}</span></div>
              </div>

              {!startedTrial && !paid ? (
                <div className="space-y-4">
                  {trialUsed ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm">Trial already used - 1 account per email, trial once ever. Payment required.</div>
                  ) : (
                    <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                      <div className="flex items-center gap-2 mb-2"><HiLightningBolt className="w-5 h-5 text-blue-600" /><span className="font-semibold">7-Day Free Trial (Once per Email)</span></div>
                      <p className="text-sm text-gray-600 mb-3">Try Payround free for 7 days. No payment required now.</p>
                      <button onClick={()=>{if(!selfieFile||!idFile){toast.error('Selfie+ID mandatory'); return;} const s=localStorage.getItem('payround_user'); if(s){try{const u=JSON.parse(s); localStorage.setItem(`trial_used_${u.email?.toLowerCase()}`, 'true');}catch{}} handleStartTrial();}} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl shadow-lg">Start 7-Day Trial</button>
                    </div>
                  )}

                  <div className="flex items-center gap-3"><div className="flex-1 h-px bg-gray-200"/><span className="text-sm text-gray-400">OR</span><div className="flex-1 h-px bg-gray-200"/></div>

                  <div className="p-5 bg-gold-50 rounded-2xl border border-gold-100">
                    <div className="text-sm font-medium mb-3">Choose a subscription plan</div>
                    <p className="text-[11px] text-gray-500 mb-3">1–5 months use the monthly rate · 6 months uses the package price · 7–11 add the monthly rate to the 6-month package · 12 months uses the annual price.</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                      {PLAN_MONTHS.map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSelectedPlan(m)}
                          className={`rounded-xl border-2 p-3 text-center transition-all ${selectedPlan === m ? 'border-primary-600 bg-white shadow-md' : 'border-transparent bg-white/60 hover:bg-white'}`}
                        >
                          <div className="font-bold text-gray-900 text-sm">{m} Month{m > 1 ? 's' : ''}</div>
                          <div className={`text-xs font-bold mt-0.5 ${selectedPlan === m ? 'text-primary-700' : 'text-gray-500'}`}>₦{priceForMonths(m).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mb-2"><span className="text-sm font-medium">{selectedPlan}-Month Plan</span><span className="text-2xl font-bold">₦{planPrice.toLocaleString()}</span></div>
                    <p className="text-xs text-gray-500 mb-3">Covers {selectedPlan} month{selectedPlan > 1 ? 's' : ''} of the platform. Upload receipt of ₦{planPrice.toLocaleString()} payment to the Palmpay account above.</p>

                    <div className="border-2 border-dashed rounded-xl p-4 bg-white mb-3">
                      <label className="block text-xs font-bold mb-2">Payment Receipt * (Palmpay {platformInfo.owner.accountNumber})</label>
                      <input type="file" ref={fileReceiptRef} accept="image/*,image/heic,image/heif" onChange={async (e)=>{const f=e.target.files[0]; e.target.value=''; if(!f) return; if((f.type||'').startsWith('video/') || (f.type||'')==='application/pdf'){ toast.error('Photos only — upload a screenshot or photo of the receipt.'); return; } if(f.size>15*1024*1024){ toast.error('That image is too large (max 15MB). Use a screenshot of the receipt.'); return; } try { const { compressImage } = await import('@/lib/image'); const small = await compressImage(f, 1000, 0.82); setReceiptFile(f); setReceiptPreview(small); } catch { toast.error('Could not read that image. Use a normal screenshot or JPG/PNG photo.'); }}} className="hidden" />
                      {receiptPreview ? (<div className="relative w-24 h-24"><img src={receiptPreview} className="w-24 h-24 rounded-xl object-cover border" /><button type="button" onClick={()=>{setReceiptFile(null); setReceiptPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">×</button></div>) : (<div onClick={()=>fileReceiptRef.current?.click()} className="border rounded-xl p-4 text-center cursor-pointer"><HiPhotograph className="w-6 h-6 mx-auto text-gray-400"/><p className="text-xs mt-1">Upload Receipt</p></div>)}
                    </div>

                    <button onClick={handlePay} className="w-full bg-black text-white font-bold py-3.5 rounded-xl shadow-xl flex items-center justify-center gap-2">Pay ₦{planPrice.toLocaleString()} & Create</button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><HiCheckCircle className="w-10 h-10 text-emerald-500" /></div>
                  <p className="text-lg font-semibold">{startedTrial ? '🎉 Trial Started!' : 'Pending PayRound Approval'}</p>
                  <p className="text-sm text-gray-500">{startedTrial ? 'Your trial has begun.' : 'Receipt uploaded. PayRound will review and approve.'}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 ? (<button onClick={handleBack} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"><HiArrowLeft className="w-4 h-4" />Back</button>) : (<div></div>)}
            {step < 5 && (<button onClick={handleNext} className="bg-primary-600 text-white font-medium px-6 py-2.5 rounded-xl hover:bg-primary-700 shadow-lg">Continue</button>)}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
