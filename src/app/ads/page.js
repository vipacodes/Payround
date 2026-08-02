'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AdBanner from '@/components/AdBanner';
import { HiPhotograph, HiPhone, HiExternalLink, HiMail, HiCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function AdsPage() {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    description: '',
    contact: '',
    website: '',
  });

  const [activeAds, setActiveAds] = useState([]);
  const [sending, setSending] = useState(false);

  // Only ads the owner has approved are shown — to everyone (members and visitors)
  useEffect(() => {
    (async () => {
      try {
        const { getAdsFromSupabase } = await import('@/lib/supabase');
        setActiveAds(await getAdsFromSupabase());
      } catch {}
    })();
  }, []);

  // Real submission — goes to the ads table for PayRound's review
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.businessName.trim() || !formData.description.trim()) { toast.error('Business name and description are required.'); return; }
    setSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      let email = '';
      try { email = (JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase(); } catch {}
      const { error } = await supabase.from('ads').insert({
        id: `ad-${Date.now()}`,
        business_name: formData.businessName.trim(),
        description: formData.description.trim(),
        contact: formData.contact.trim(),
        website: formData.website.trim() || null,
        submitter_email: email || 'visitor',
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Ad request submitted! PayRound will review it shortly.');
      setSubmitted(true);
      setFormData({ businessName: '', description: '', contact: '', website: '' });
      setTimeout(() => setShowForm(false), 2000);
    } catch (err) {
      toast.error(`Could not submit: ${err.message || 'try again'}`);
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Advertise Your Business</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Reach thousands of Payround users across Nigeria. Promote your business to our growing community.
          </p>
        </div>

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
        {!showForm && !submitted && (
          <div className="text-center bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-8 md:p-12">
            <HiPhotograph className="w-12 h-12 text-primary-200 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">Advertise Your Business Here</h2>
            <p className="text-primary-100 mb-6 max-w-lg mx-auto">
              Get your business in front of active savers and financial communities across Nigeria. Affordable rates, maximum visibility.
            </p>
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
                  <h4 className="font-semibold text-gray-900 mb-1">Request Submitted! 🎉</h4>
                  <p className="text-sm text-gray-500">We&apos;ll review and contact you within 48 hours.</p>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe your business and what you offer..."
                      rows={3}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Website (optional)</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                      placeholder="https://yourbusiness.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50"
                  >
                    {sending ? 'Submitting…' : 'Submit for Review'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
