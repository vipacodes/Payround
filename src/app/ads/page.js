'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AdBanner from '@/components/AdBanner';
import { HiPhotograph, HiCheckCircle, HiSparkles, HiRefresh, HiTrash, HiClock, HiCreditCard } from 'react-icons/hi';
import toast from 'react-hot-toast';

const MAX_MEDIA = 5;

// ✨ Local "AI" description writer — builds a tailored advert from the business name + the photos/videos uploaded.
const AI_PATTERNS = [
  { keys: ['fashion', 'cloth', 'wear', 'outfit', 'dress', 'thrift', 'okrika', 'shoe', 'sneaker', 'bag', 'tailor'], topic: 'quality fashion pieces' },
  { keys: ['hair', 'salon', 'barber', 'wig', 'braid', 'lash', 'nail'], topic: 'top-notch beauty & hair services' },
  { keys: ['food', 'restaurant', 'chops', 'snack', 'cake', 'bakery', 'meal', 'cook'], topic: 'delicious, freshly-made meals' },
  { keys: ['cream', 'soap', 'skincare', 'glow', 'cosmetic', 'makeup', 'beauty', 'oil'], topic: 'original skincare & beauty products' },
  { keys: ['phone', 'gadget', 'laptop', 'accessor', 'electronic', 'charger', 'tech'], topic: 'genuine gadgets & accessories' },
  { keys: ['thrift', 'shoes'], topic: 'quality thrift finds' },
];

function aiDescriptions(name, mediaCount, hasVideo) {
  const n = (name || 'My Business').trim();
  const lower = n.toLowerCase();
  const hit = AI_PATTERNS.find(p => p.keys.some(k => lower.includes(k)));
  const topic = hit ? hit.topic : 'quality products & trusted service';
  const proof = mediaCount > 0
    ? ` You can see ${mediaCount === 1 ? 'a real sample' : `${mediaCount} real samples`} in the photos${hasVideo ? ' and video' : ''} attached — what you see is exactly what you get.`
    : '';
  return [
    `🔥 ${n} — ${topic} you can trust!${proof}\n💯 Great quality at prices that respect your pocket.\n🚚 Fast response & quick delivery — order today!\n📲 Chat us on WhatsApp now to place your order.`,
    `Looking for ${topic}? ${n} has you covered! ✨${proof}\n✔ Affordable prices\n✔ Honest service\n✔ Quick delivery anywhere\nSend us a message on WhatsApp — we reply fast! 💬`,
    `Welcome to ${n}! 🎉 Your home of ${topic}.${proof}\nJoin our happy customers today — quality guaranteed, prices you'll love, and service with a smile. 😊\n👉 Tap the WhatsApp button to order now!`,
  ];
}

export default function AdsPage() {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ businessName: '', description: '', contact: '', whatsapp: '', website: '' });
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const [planDays, setPlanDays] = useState(7);
  const [receipt, setReceipt] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [sending, setSending] = useState(false);
  const [aiIdx, setAiIdx] = useState(0);
  const [aiUsed, setAiUsed] = useState(false);

  const [settings, setSettings] = useState(null); // owner bank + ad prices (owner-editable)
  const [myEmail, setMyEmail] = useState('');
  const [myAds, setMyAds] = useState([]);
  const [activeAds, setActiveAds] = useState([]);
  const [viewImg, setViewImg] = useState('');

  const plans = [
    { days: 1, label: '1 Day', price: Number(settings?.ad_1day || 500) },
    { days: 7, label: '1 Week', price: Number(settings?.ad_1week || 3325) },
    { days: 30, label: '1 Month', price: Number(settings?.ad_1month || 13500) },
  ];
  const plan = plans.find(p => p.days === planDays) || plans[1];

  const loadMyAds = useCallback(async (email) => {
    if (!email) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.from('ads').select('*').eq('submitter_email', email).order('submitted_at', { ascending: false });
      setMyAds(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      let email = '';
      try { email = (JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase(); } catch {}
      setMyEmail(email);
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: s } = await supabase.from('owner_settings').select('bank_name, account_number, account_name, ad_1day, ad_1week, ad_1month').eq('id', 1).single();
        if (s) setSettings(s);
      } catch {}
      loadMyAds(email);
      try {
        const { getAdsFromSupabase } = await import('@/lib/supabase');
        setActiveAds(await getAdsFromSupabase());
      } catch {}
    })();
  }, [loadMyAds]);

  const pickMedia = async (files) => {
    setMediaError('');
    if (mediaFiles.length >= MAX_MEDIA) { setMediaError(`Maximum is ${MAX_MEDIA} photos/videos per ad.`); return; }
    const list = [];
    for (const file of Array.from(files || [])) {
      if (mediaFiles.length + list.length >= MAX_MEDIA) { setMediaError(`Maximum is ${MAX_MEDIA} photos/videos per ad — extra files skipped.`); break; }
      const isVideo = file.type.startsWith('video/');
      if (!isVideo && !file.type.startsWith('image/')) { setMediaError('Only images and videos are allowed.'); continue; }
      if (isVideo && file.size > 6 * 1024 * 1024) { setMediaError(`"${file.name}" is over 6MB — videos must be 6MB or less.`); continue; }
      try {
        if (isVideo) {
          const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
          list.push(dataUrl);
        } else {
          const { compressImage } = await import('@/lib/image');
          list.push(await compressImage(file, 1000, 0.82));
        }
      } catch { setMediaError('One file could not be read — try another.'); }
    }
    setMediaFiles(prev => [...prev, ...list].slice(0, MAX_MEDIA));
  };

  const useAiDescription = (regen) => {
    if (!formData.businessName.trim()) { toast.error('Type your business name first — the AI writes from it.'); return; }
    const variants = aiDescriptions(formData.businessName, mediaFiles.length, mediaFiles.some(m => m.startsWith('data:video')));
    const next = regen ? (aiIdx + 1) % variants.length : aiIdx % variants.length;
    setAiIdx(next);
    setFormData(prev => ({ ...prev, description: variants[next] }));
    setAiUsed(true);
    toast.success(regen ? '✨ New version written — edit it freely!' : '✨ Description written — edit anything you like!');
  };

  const pickReceipt = async (file) => {
    setReceiptError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) { setReceiptError('Receipt must be an image (screenshot of your transfer).'); return; }
    try {
      const { compressImage } = await import('@/lib/image');
      setReceipt(await compressImage(file, 1000, 0.82));
    } catch { setReceiptError('Could not read that image — try another.'); }
  };

  const statusOf = (ad) => {
    if (ad.status === 'approved') {
      if (ad.expires_at && new Date(ad.expires_at).getTime() < Date.now()) return 'expired';
      return 'live';
    }
    if (ad.status === 'declined') return 'declined';
    return ad.payment_receipt_url ? 'review' : 'await_receipt';
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  };

  const daysLeft = (ad) => {
    if (!ad.expires_at) return null;
    const left = Math.ceil((new Date(ad.expires_at).getTime() - Date.now()) / 86400000);
    return Math.max(0, left);
  };

  // Real submission — everything persisted in one go; receipt optional (can be added later from My Ads)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.businessName.trim() || !formData.description.trim()) { toast.error('Business name and description are required.'); return; }
    if (!formData.contact.trim()) { toast.error('Contact phone is required.'); return; }
    if (mediaFiles.length === 0) { toast.error('Add at least 1 photo or video of your business.'); return; }
    if (!receipt && !window.confirm(`No payment receipt attached!\n\nYour ad will be SAVED as "Awaiting payment". Pay ₦${plan.price.toLocaleString()} to the PayRound account shown and upload the receipt later from "My Ads" on this page — nothing will be lost.\n\nSave the ad now without the receipt?`)) return;
    setSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const cover = mediaFiles[0];
      const { error } = await supabase.from('ads').insert({
        id: `ad-${Date.now()}`,
        business_name: formData.businessName.trim(),
        description: formData.description.trim(),
        phone: formData.contact.trim(),
        contact: formData.contact.trim(),
        whatsapp: formData.whatsapp.trim() || formData.contact.trim(),
        website: formData.website.trim() || null,
        media_urls: JSON.stringify(mediaFiles),
        media_url: cover,
        media_type: cover.startsWith('data:video') ? 'video' : 'image',
        duration_days: plan.days,
        price: plan.price,
        payment_receipt_url: receipt || null,
        receipt_uploaded_at: receipt ? new Date().toISOString() : null,
        submitter_email: myEmail || 'visitor',
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(receipt ? 'Ad + receipt submitted! PayRound will confirm your payment and set it LIVE. 🎉' : 'Ad saved! 💾 Pay and upload your receipt anytime from My Ads below.');
      setSubmitted(true);
      setFormData({ businessName: '', description: '', contact: '', whatsapp: '', website: '' });
      setMediaFiles([]);
      setReceipt('');
      setAiUsed(false); setAiIdx(0);
      loadMyAds(myEmail);
      setTimeout(() => { setShowForm(false); setSubmitted(false); }, 2500);
    } catch (err) {
      toast.error(`Could not submit: ${err.message || 'try again'}`);
    }
    setSending(false);
  };

  // Upload/replace the payment receipt on a saved ad
  const uploadReceiptFor = async (ad, file) => {
    if (!file || !file.type.startsWith('image/')) { toast.error('Receipt must be an image.'); return; }
    const t = toast.loading('Uploading receipt…');
    try {
      const { compressImage } = await import('@/lib/image');
      const dataUrl = await compressImage(file, 1000, 0.82);
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').update({ payment_receipt_url: dataUrl, receipt_uploaded_at: new Date().toISOString() }).eq('id', ad.id);
      if (error) throw error;
      toast.success('Receipt uploaded! PayRound will review and set your ad LIVE. 🎉', { id: t });
      loadMyAds(myEmail);
    } catch (err) { toast.error(`Upload failed: ${err.message || 'try again'}`, { id: t }); }
  };

  const deleteAd = async (ad) => {
    if (!window.confirm(`Delete the ad "${ad.business_name}" permanently? This cannot be undone.`)) return;
    const t = toast.loading('Deleting…');
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('ads').delete().eq('id', ad.id);
      if (error) throw error;
      toast.success('Ad deleted.', { id: t });
      loadMyAds(myEmail);
    } catch (err) { toast.error(`Could not delete: ${err.message || 'try again'}`, { id: t }); }
  };

  const bank = { name: settings?.bank_name || 'Opay', number: settings?.account_number || '9151723199', holder: settings?.account_name || 'Basikoro James Okeroghene' };

  const StatusChip = ({ ad }) => {
    const s = statusOf(ad);
    const map = {
      await_receipt: ['💰 AWAITING PAYMENT', 'bg-amber-100 text-amber-800'],
      review: ['⏳ PAYMENT UNDER REVIEW', 'bg-blue-100 text-blue-800'],
      live: ['🟢 LIVE', 'bg-emerald-100 text-emerald-800'],
      expired: ['⌛ EXPIRED', 'bg-gray-200 text-gray-600'],
      declined: ['❌ DECLINED', 'bg-red-100 text-red-700'],
    };
    const [txt, cls] = map[s];
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{txt}</span>;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Advertise Your Business</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Reach thousands of Payround users across Nigeria. Pick how long your advert runs, pay, upload your receipt — and you&apos;re LIVE.
          </p>
        </div>

        {/* 📋 MY ADS — the advertiser's own saved ads (persist until THEY delete them) */}
        {myEmail && myAds.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📋 My Ads ({myAds.length})</h2>
            <p className="text-xs text-gray-500 mb-3">Your ads stay saved here forever — unless you delete them yourself. Left to pay? Your details are safe — come back and upload the receipt anytime.</p>
            <div className="space-y-3">
              {myAds.map(ad => {
                let media = [];
                try { const m = JSON.parse(ad.media_urls || '[]'); if (Array.isArray(m)) media = m; } catch {}
                const cover = media[0] || ad.media_url || '';
                const left = daysLeft(ad);
                const pendingDelete = statusOf(ad) !== 'live';
                return (
                  <div key={ad.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex gap-3">
                      {cover && (
                        <button onClick={() => setViewImg(cover)} className="shrink-0" title="Tap to view">
                          {String(cover).startsWith('data:video')
                            ? <video src={cover} muted playsInline className="w-16 h-16 rounded-xl object-cover border bg-black" />
                            : <img src={cover} alt="" className="w-16 h-16 rounded-xl object-cover border" />}
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm truncate">{ad.business_name}</p>
                          <StatusChip ad={ad} />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          ⏱ {ad.duration_days || '?'} day{(ad.duration_days || 0) > 1 ? 's' : ''} · ₦{Number(ad.price || 0).toLocaleString()} · {media.length || 1} photo/video{(media.length || 1) > 1 ? 's' : ''}
                        </p>
                        <p className="text-[11px] text-gray-400">📅 Created: {fmtDate(ad.submitted_at)}</p>
                        {statusOf(ad) === 'live' && ad.expires_at && (
                          <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">📺 Showing until {new Date(ad.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{left !== null ? ` — ${left} day${left === 1 ? '' : 's'} left` : ''}</p>
                        )}
                        {statusOf(ad) === 'review' && (
                          <p className="text-[11px] text-blue-700 mt-0.5">✅ Receipt uploaded{ad.receipt_uploaded_at ? ` ${fmtDate(ad.receipt_uploaded_at)}` : ''} — waiting for PayRound to confirm payment.</p>
                        )}
                        {statusOf(ad) === 'await_receipt' && (
                          <p className="text-[11px] text-amber-700 mt-0.5">💡 Pay ₦{Number(ad.price || 0).toLocaleString()} to {bank.name} {bank.number} ({bank.holder}) then upload your receipt below.</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {ad.payment_receipt_url ? (
                        <button onClick={() => setViewImg(ad.payment_receipt_url)} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">🧾 View receipt</button>
                      ) : statusOf(ad) === 'await_receipt' ? (
                        <label className="text-[11px] font-semibold text-white bg-amber-500 px-3 py-1.5 rounded-full cursor-pointer hover:bg-amber-600 transition-colors">
                          📤 Upload payment receipt
                          <input type="file" accept="image/*" className="hidden" onChange={e => { uploadReceiptFor(ad, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                      ) : null}
                      {pendingDelete && (
                        <button onClick={() => deleteAd(ad)} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors">🗑 Delete ad</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Ads */}
        {activeAds.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Featured Businesses</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeAds.map(ad => (
                <AdBanner key={ad.id} ad={ad} />
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        {!showForm && (
          <div className="text-center bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-8 md:p-12">
            <HiPhotograph className="w-12 h-12 text-primary-200 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">Advertise Your Business Here</h2>
            <p className="text-primary-100 mb-2 max-w-lg mx-auto">
              Get your business in front of active savers across Nigeria. From just <b className="text-gold-400">₦{plans[0].price.toLocaleString()}/day</b>.
            </p>
            <p className="text-primary-200 text-xs mb-6">Pay straight to the PayRound account, upload your receipt — advert goes live after payment is confirmed.</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-gold-500 text-gray-900 font-semibold px-8 py-3.5 rounded-xl hover:bg-gold-600 transition-all shadow-xl shadow-gold-500/25"
            >
              Submit Your Ad Now
            </button>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Advertise Your Business</h3>

              {submitted ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <HiCheckCircle className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-1">Ad Saved! 🎉</h4>
                  <p className="text-sm text-gray-500">Track it in <b>My Ads</b> at the top of this page.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name *</label>
                    <input
                      type="text"
                      value={formData.businessName}
                      onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                      placeholder="Your business name"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* 📸 Media — right under the business name (max 5) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Photos / Videos * (max {MAX_MEDIA})</label>
                    <p className="text-[11px] text-gray-500 mb-1.5">💡 The Sponsored area has <b>2 portrait slots</b> and <b>1 landscape slot</b> — upload both tall and wide shots to show everywhere. Photos display up to 5s, videos up to 10s.</p>
                    <label className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-primary-300 hover:bg-primary-50/40 transition-all">
                      <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { pickMedia(e.target.files); e.target.value = ''; }} />
                      <HiPhotograph className="w-6 h-6 text-gray-400" />
                      <span className="text-xs text-gray-500">Tap to add photos or short videos (images auto-compressed, videos ≤ 6MB) — {mediaFiles.length}/{MAX_MEDIA} added</span>
                    </label>
                    {mediaError && <p className="text-xs text-red-500 mt-1">{mediaError}</p>}
                    {mediaFiles.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {mediaFiles.map((m, i) => (
                          <div key={i} className="relative w-16 h-16">
                            {m.startsWith('data:video')
                              ? <video src={m} muted playsInline className="w-16 h-16 rounded-lg object-cover border bg-black" />
                              : <img src={m} alt="" className="w-16 h-16 rounded-lg object-cover border" />}
                            <button type="button" onClick={() => setMediaFiles(prev => prev.filter((_, x) => x !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] shadow">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ✨ Description with optional AI writer */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-gray-700">Description *</label>
                      <button
                        type="button"
                        onClick={() => useAiDescription(aiUsed)}
                        className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full hover:bg-purple-100 transition-colors"
                      >
                        {aiUsed ? <><HiRefresh className="w-3 h-3" /> Regenerate</> : <><HiSparkles className="w-3 h-3" /> ✨ Write it for me (AI)</>}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-1.5">Type it yourself — or let our AI write one automatically from your business name &amp; the photos/videos you uploaded above. You can edit the result freely.</p>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder='Describe your business… or tap "✨ Write it for me (AI)" above'
                      rows={4}
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Phone *</label>
                    <input
                      type="tel"
                      value={formData.contact}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
                      placeholder="08012345678"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp Number *</label>
                    <input
                      type="tel"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                      placeholder="e.g. 09151723199 — customers can chat you on WhatsApp"
                      required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Website (optional)</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                      placeholder="https://yourbusiness.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* ⏱ Duration — price shown beside each timeframe */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5"><HiClock className="inline w-4 h-4 mr-1 -mt-0.5" />How long should your ad run? *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {plans.map(p => (
                        <button
                          type="button"
                          key={p.days}
                          onClick={() => setPlanDays(p.days)}
                          className={`rounded-xl border-2 p-3 text-center transition-all ${planDays === p.days ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-100' : 'border-gray-200 bg-white hover:border-primary-200'}`}
                        >
                          <p className={`text-sm font-bold ${planDays === p.days ? 'text-primary-700' : 'text-gray-800'}`}>{p.label}</p>
                          <p className={`text-xs font-semibold mt-0.5 ${planDays === p.days ? 'text-primary-600' : 'text-gray-500'}`}>₦{p.price.toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 💳 Pay the PayRound account */}
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/70 p-4">
                    <p className="text-[11px] font-bold text-emerald-800 mb-1"><HiCreditCard className="inline w-4 h-4 mr-1 -mt-0.5" />PAY ₦{plan.price.toLocaleString()} TO THE PAYROUND ACCOUNT</p>
                    <div className="text-xs text-gray-900 space-y-0.5">
                      <p><span className="text-gray-500">Bank:</span> <b>{bank.name}</b></p>
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-500">Account No:</span> <b className="font-mono text-sm tracking-wide">{bank.number}</b>
                        <button type="button" onClick={() => { try { navigator.clipboard.writeText(bank.number); toast.success('Account number copied! 📋'); } catch {} }} className="text-[10px] font-semibold text-emerald-700 border border-emerald-200 bg-white px-2 py-0.5 rounded-full">Copy</button>
                      </p>
                      <p><span className="text-gray-500">Name:</span> <b>{bank.holder}</b></p>
                    </div>
                    <p className="text-[10px] text-emerald-700 mt-2">Use your business name as the transfer remark. Your ad goes LIVE as soon as PayRound confirms the payment.</p>
                  </div>

                  {/* 🧾 Receipt */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Receipt (screenshot of your transfer)</label>
                    {receipt ? (
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => setViewImg(receipt)}><img src={receipt} alt="receipt" className="w-20 h-20 rounded-xl object-cover border" /></button>
                        <button type="button" onClick={() => setReceipt('')} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">✕ Remove</button>
                      </div>
                    ) : (
                      <label className="w-full border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-xl p-4 flex flex-col items-center gap-1 cursor-pointer hover:border-emerald-300 transition-all">
                        <input type="file" accept="image/*" className="hidden" onChange={e => { pickReceipt(e.target.files?.[0]); e.target.value = ''; }} />
                        <span className="text-lg">🧾</span>
                        <span className="text-xs text-gray-600 text-center">Tap to upload your transfer receipt<br /><span className="text-[10px] text-gray-400">Not paid yet? No wahala — submit now, your ad stays saved, upload the receipt anytime from My Ads.</span></span>
                      </label>
                    )}
                    {receiptError && <p className="text-xs text-red-500 mt-1">{receiptError}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
                  >
                    {sending ? 'Submitting…' : receipt ? 'Submit Ad + Receipt for Review' : 'Save Ad (upload receipt later)'}
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">Your ad details are stored safely — leaving this page to go pay will NOT delete anything.</p>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* full-screen image viewer */}
      {viewImg && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewImg('')}>
          <button className="absolute top-4 right-4 text-white text-2xl font-bold bg-white/10 w-10 h-10 rounded-full">✕</button>
          {String(viewImg).startsWith('data:video')
            ? <video src={viewImg} controls autoPlay playsInline className="max-h-[85vh] max-w-full rounded-xl" onClick={e => e.stopPropagation()} />
            : <img src={viewImg} alt="view" className="max-h-[85vh] max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />}
        </div>
      )}

      <Footer />
    </div>
  );
}
