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
  const [logoPreview, setLogoPreview] = useState(null);
  const fileInputRef = useRef(null);
  const fileSelfieRef = useRef(null);
  const fileIdRef = useRef(null);
  const fileReceiptRef = useRef(null);

  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
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
    }
    if (step < 5) setStep(step + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };
  const handleRemoveLogo = () => {
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStartTrial = () => {
    if (trialUsed) { toast.error('You have already used your one-time 7-day trial. Payment required.'); return; }
    if (!selfieFile || !idFile) { toast.error('Selfie + ID mandatory before trial'); return; }
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
      toast.success(`Group ${groupId} created on trial!`);
      router.push(`/groups/${groupId}`);
    }, 1500);
  };

  const handlePay = () => {
    if (!selfieFile || !idFile) { toast.error('Selfie + ID mandatory'); return; }
    if (!receiptFile) { toast.error('Upload receipt of ₦5000 to Palmpay 9151723199 Basikoro James Okeroghene'); return; }
    toast.success('Payment receipt uploaded - pending Payround approval.');
    setPaid(true);
    setTimeout(() => {
      const groupId = 'PR' + Math.floor(10000 + Math.random() * 90000);
      const groups = JSON.parse(localStorage.getItem('payround_groups_custom') || '[]');
      groups.push({ id: groupId, ...formData, color: selectedColor, status: 'pending_owner', hasReceipt: true, createdAt: new Date().toISOString() });
      localStorage.setItem('payround_groups_custom', JSON.stringify(groups));
      const waMsg = `New Group Request: ${formData.name} by user, ₦5000 paid to Palmpay 9151723199, needs approval. Selfie+ID attached.`;
      const waLink = `https://wa.me/2349151723199?text=${encodeURIComponent(waMsg)}`;
      window.open(waLink, '_blank');
      toast.success(`Group ${groupId} saved pending Payround approval`);
      router.push(`/`);
    }, 1500);
  };

  const addRule = () => setFormData(prev => ({ ...prev, rules: [...prev.rules, ''] }));
  const updateRule = (index, value) => { const newRules = [...formData.rules]; newRules[index]=value; setFormData(prev=>({...prev, rules:newRules})); };
  const removeRule = (index) => { if (formData.rules.length>1) setFormData(prev=>({...prev, rules: prev.rules.filter((_,i)=>i!==index)})); };
  const updateField = (field, value) => setFormData(prev=>({...prev, [field]:value}));

  const creationFee = 5000;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gold-200">
            <HiLightningBolt className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create an Ajo Group</h1>
          <p className="text-gray-500 mt-1">Set up your group in 5 steps - Selfie + ID mandatory, Color picker 12 options</p>
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

              <div>
                <label className="block text-sm font-medium mb-1.5">Group Logo (optional)</label>
                <input type="file" ref={fileInputRef} accept="image/*,image/heic,image/heif" onChange={(e)=>{const file=e.target.files[0]; if(file){const reader=new FileReader(); reader.onload=(ev)=>setLogoPreview(ev.target.result); reader.readAsDataURL(file);}}} className="hidden" />
                {logoPreview ? (<div className="relative"><img src={logoPreview} alt="Logo" className="w-32 h-32 object-cover rounded-2xl border" /><button onClick={()=>{setLogoPreview(null); if(fileInputRef.current) fileInputRef.current.value='';}} className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center"><HiTrash className="w-3.5 h-3.5" /></button></div>) : (<div onClick={()=>fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center cursor-pointer hover:border-primary-400"><HiUserGroup className="w-8 h-8 text-gray-400 mx-auto mb-2" /><p className="text-sm text-gray-500">Upload logo</p></div>)}
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
              <p className="text-sm text-gray-500">Members will send contributions to this account - not Owner account.</p>
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
              <div className="flex items-center gap-2 mb-2"><HiShieldCheck className="w-6 h-6 text-primary-600" /><h2 className="text-lg font-semibold">Review & Pay to Payround</h2></div>
              
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="font-bold text-sm">Pay to Payround</div>
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
                    <div className="flex justify-between mb-2"><span className="text-sm font-medium">Pay ₦5000 Now</span><span className="text-2xl font-bold">₦{creationFee.toLocaleString()}</span></div>
                    <p className="text-xs text-gray-500 mb-3">Upload receipt of ₦5000 payment to Palmpay account above.</p>
                    
                    <div className="border-2 border-dashed rounded-xl p-4 bg-white mb-3">
                      <label className="block text-xs font-bold mb-2">Payment Receipt * (Palmpay {platformInfo.owner.accountNumber})</label>
                      <input type="file" ref={fileReceiptRef} accept="image/*,image/heic,image/heif,application/pdf,.pdf,video/*" onChange={(e)=>{const f=e.target.files[0]; if(f){setReceiptFile(f); const r=new FileReader(); r.onload=(ev)=>setReceiptPreview(ev.target.result); r.readAsDataURL(f);}}} className="hidden" />
                      {receiptPreview ? (<div className="relative w-24 h-24"><img src={receiptPreview} className="w-24 h-24 rounded-xl object-cover border" /><button type="button" onClick={()=>{setReceiptFile(null); setReceiptPreview(null);}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center">×</button></div>) : (<div onClick={()=>fileReceiptRef.current?.click()} className="border rounded-xl p-4 text-center cursor-pointer"><HiPhotograph className="w-6 h-6 mx-auto text-gray-400"/><p className="text-xs mt-1">Upload Receipt</p></div>)}
                    </div>

                    <button onClick={handlePay} className="w-full bg-black text-white font-bold py-3.5 rounded-xl shadow-xl flex items-center justify-center gap-2">Pay ₦{creationFee.toLocaleString()} & Create</button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><HiCheckCircle className="w-10 h-10 text-emerald-500" /></div>
                  <p className="text-lg font-semibold">{startedTrial ? '🎉 Trial Started!' : 'Pending Verification'}</p>
                  <p className="text-sm text-gray-500">{startedTrial ? 'Your trial has begun.' : 'Receipt uploaded. Payround will review and approve.'}</p>
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
