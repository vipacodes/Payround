'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HiCheckCircle, HiArrowLeft, HiLightningBolt, HiUserGroup, HiCurrencyDollar, HiCalendar, HiDocumentText, HiShieldCheck, HiPhotograph, HiTrash } from 'react-icons/hi';
import { HiBanknotes } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { GROUP_COLORS, platformInfo } from '@/lib/data';

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
  const [trialUsed, setTrialUsed] = useState(false);
  const [selectedColor, setSelectedColor] = useState(GROUP_COLORS[0]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    contributionAmount: '',
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
    toast.success('🎉 7-day trial started!');
    setStartedTrial(true);
    const storedUser = localStorage.getItem('payround_user');
    if (storedUser) {
      try { const u = JSON.parse(storedUser); localStorage.setItem(`trial_used_${u.email?.toLowerCase()}`, 'true'); } catch {}
    }
    setTimeout(() => {
      const groupId = 'PR' + Math.floor(10000 + Math.random() * 90000);
      const groups = JSON.parse(localStorage.getItem('payround_groups_custom') || '[]');
      groups.push({ id: groupId, ...formData, color: selectedColor, status: 'trial_active', trialEndsAt: new Date(Date.now()+7*24*60*60*1000).toISOString(), createdAt: new Date().toISOString() });
      localStorage.setItem('payround_groups_custom', JSON.stringify(groups));
      syncGroupToSupabase(groupId, 'trial_active', false);
      toast.success(`Group ${groupId} created on trial!`);
      router.push(`/groups/${groupId}`);
    }, 1500);
  };

  const handlePay = () => {
    if (!selfieFile || !idFile) { toast.error('Selfie + ID mandatory'); return; }
    if (!avatarPreview) { toast.error('Group logo is required'); return; }
    if (!receiptFile) { toast.error(`Upload receipt of ₦${planPrice.toLocaleString()} to Palmpay 9151723199 Basikoro James Okeroghene`); return; }
    toast.success('Payment receipt uploaded - pending PayRound approval.');
    setPaid(true);
    setTimeout(() => {
      const groupId = 'PR' + Math.floor(10000 + Math.random() * 90000);
      const groups = JSON.parse(localStorage.getItem('payround_groups_custom') || '[]');
      groups.push({ id: groupId, ...formData, color: selectedColor, status: 'pending_owner', hasReceipt: true, createdAt: new Date().toISOString() });
      localStorage.setItem('payround_groups_custom', JSON.stringify(groups));
      syncGroupToSupabase(groupId, 'pending_owner', true);
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

  // Subscription plans — prices controlled by the owner. 1mo ₦1,500 / 6mo ₦8,000 / 12mo ₦15,000
  const PLAN_MONTHS = [1, 6, 12];
  const [planPrices, setPlanPrices] = useState({ 1: 1500, 6: 8000, 12: 15000 });
  const [selectedPlan, setSelectedPlan] = useState(6);
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: s } = await supabase.from('owner_settings').select('plan_1m, plan_6m, plan_12m').eq('id', 1).single();
        if (s) setPlanPrices({ 1: s.plan_1m ?? 1500, 6: s.plan_6m ?? 8000, 12: s.plan_12m ?? 15000 });
      } catch {}
    })();
  }, []);
  const planPrice = planPrices[selectedPlan] || 8000;

  // Store group in Supabase so the owner panel can review/approve it (reflects on both sites)
  const syncGroupToSupabase = async (groupId, status, withReceipt) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      let adminEmail = '', adminName = '';
      const s = localStorage.getItem('payround_user');
      if (s) { try { const u = JSON.parse(s); adminEmail = u.email || ''; adminName = u.name || ''; } catch {} }
      await supabase.from('groups').insert({
        id: groupId,
        name: formData.name,
        description: formData.description,
        amount: parseInt(formData.contributionAmount) || 0,
        frequency: formData.schedule || 'Weekly',
        max_members: parseInt(formData.maxMembers) || 0,
        color: selectedColor,
        admin_email: adminEmail,
        admin_name: adminName,
        status,
        selfie_url: selfiePreview || null,
        id_url: idPreview || null,
        id_type: formData.idType,
        avatar_url: avatarPreview || null,
        plan_months: withReceipt ? selectedPlan : null,
        plan_price: withReceipt ? planPrice : null,
        expiry_at: withReceipt ? new Date(Date.now() + selectedPlan * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
        creation_receipt_url: withReceipt ? (receiptPreview || null) : null,
      });
    } catch (e) { console.log('Group sync to Supabase failed (offline ok)', e.message); }
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
                <h4 className="font-bold text-sm text-amber-800">KYC Required - Selfie + Valid ID * (ID replaces signup ID — profile signup only needs a selfie)</h4>
                <div className="grid md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Clear Selfie *</label>
                    <input type="file" ref={fileSelfieRef} accept="image/*,image/heic,image/heif,video/*" onChange={(e)=>{const f=e.target.files[0]; if(f){setSelfieFile(f); const r=new FileReader(); r.onload=(ev)=>setSelfiePreview(ev.target.result); r.readAsDataURL(f);}}} className="hidden" />
                    {selfiePreview ? (<div className="relative w-24 h-24"><img src={selfiePreview} className="w-24 h-24 rounded-xl object-cover border" /><button type="button" onClick={()=>{setSelfieFile(null); setSelfiePreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">×</button></div>) : (<div onClick={()=>fileSelfieRef.current?.click()} className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer bg-white hover:border-primary-400"><HiPhotograph className="w-6 h-6 mx-auto text-gray-400"/><p className="text-xs mt-1">Upload Selfie</p></div>)}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">ID Type *</label>
                    <select value={formData.idType} onChange={(e)=>updateField('idType', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mb-2"><option value="NIN">NIN</option><option value="Voter's Card">Voter's Card</option><option value="Driver's License">Driver's License</option><option value="International Passport">Passport</option></select>
                    <input type="file" ref={fileIdRef} accept="image/*,image/heic,image/heif,application/pdf,.pdf,video/*" onChange={(e)=>{const f=e.target.files[0]; if(f){setIdFile(f); const r=new FileReader(); r.onload=(ev)=>setIdPreview(ev.target.result); r.readAsDataURL(f);}}} className="hidden" />
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
              <div><label className="block text-sm font-medium mb-1.5">Max Members *</label><input type="number" value={formData.maxMembers} onChange={(e)=>updateField('maxMembers', e.target.value)} placeholder="e.g., 20" className="w-full px-4 py-3 border rounded-xl text-sm outline-none" /></div>
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
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-medium">₦{(parseInt(formData.contributionAmount)||0).toLocaleString()} / {formData.schedule}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Max</span><span className="font-medium">{formData.maxMembers || 'Not set'}</span></div>
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
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {PLAN_MONTHS.map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSelectedPlan(m)}
                          className={`rounded-xl border-2 p-3 text-center transition-all ${selectedPlan === m ? 'border-primary-600 bg-white shadow-md' : 'border-transparent bg-white/60 hover:bg-white'}`}
                        >
                          <div className="font-bold text-gray-900 text-sm">{m} Month{m > 1 ? 's' : ''}</div>
                          <div className={`text-xs font-bold mt-0.5 ${selectedPlan === m ? 'text-primary-700' : 'text-gray-500'}`}>₦{(planPrices[m] || 0).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mb-2"><span className="text-sm font-medium">{selectedPlan}-Month Plan</span><span className="text-2xl font-bold">₦{planPrice.toLocaleString()}</span></div>
                    <p className="text-xs text-gray-500 mb-3">Covers {selectedPlan} month{selectedPlan > 1 ? 's' : ''} of the platform. Upload receipt of ₦{planPrice.toLocaleString()} payment to the Palmpay account above.</p>

                    <div className="border-2 border-dashed rounded-xl p-4 bg-white mb-3">
                      <label className="block text-xs font-bold mb-2">Payment Receipt * (Palmpay {platformInfo.owner.accountNumber})</label>
                      <input type="file" ref={fileReceiptRef} accept="image/*,image/heic,image/heif,application/pdf,.pdf,video/*" onChange={(e)=>{const f=e.target.files[0]; if(f){setReceiptFile(f); const r=new FileReader(); r.onload=(ev)=>setReceiptPreview(ev.target.result); r.readAsDataURL(f);}}} className="hidden" />
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
