'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getGroupById } from '@/lib/data';
import {
  HiCheckCircle, HiUser, HiPhone, HiMail,
  HiLocationMarker, HiBriefcase, HiUserGroup,
  HiDocumentText, HiArrowLeft
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function JoinGroupPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState('rules'); // rules | form | success
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    occupation: '',
    nextOfKin: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const found = getGroupById(params.id);
    if (found) {
      setGroup(found);
    }
  }, [params.id]);

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAgree = () => {
    setStep('form');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setStep('success');
      toast.success('Join request submitted!');
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
            <span className="text-primary-700 font-bold text-lg">{group.name.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Join {group.name}</h1>
            <p className="text-sm text-gray-500">ID: {group.id}</p>
          </div>
        </div>

        {step === 'rules' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <HiDocumentText className="w-6 h-6 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Group Rules</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Please read the rules carefully before joining.
            </p>

            {group.rules?.length > 0 ? (
              <ul className="space-y-3 mb-6">
                {group.rules.map((rule, index) => (
                  <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span className="text-sm text-gray-700">{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 mb-6">No specific rules have been set for this group.</p>
            )}

            <label className="flex items-start gap-3 p-4 bg-primary-50 rounded-xl mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to follow the group rules and understand the contribution obligations.
              </span>
            </label>

            <button
              onClick={handleAgree}
              disabled={!agreed}
              className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'form' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Your Details</h2>
            <p className="text-sm text-gray-500 mb-6">
              Fill in your information. This will be visible to you and the admin only.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <div className="relative">
                  <HiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Enter your full name"
                    className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.name ? 'border-red-300' : 'border-gray-200'}`}
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
                  <div className="relative">
                    <HiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="08031234567"
                      className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.phone ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                  <div className="relative">
                    <HiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      placeholder="you@example.com"
                      className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.email ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Residential Address</label>
                <div className="relative">
                  <HiLocationMarker className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Your home address"
                    className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Occupation</label>
                  <div className="relative">
                    <HiBriefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.occupation}
                      onChange={(e) => updateField('occupation', e.target.value)}
                      placeholder="Your occupation"
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Next of Kin</label>
                  <div className="relative">
                    <HiUserGroup className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.nextOfKin}
                      onChange={(e) => updateField('nextOfKin', e.target.value)}
                      placeholder="Next of kin name"
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 mt-2"
              >
                Submit Request
              </button>
            </form>

            <p className="text-xs text-gray-400 mt-4 text-center">
              Your details are encrypted and only visible to you and the group admin.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiCheckCircle className="w-12 h-12 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted! 🎉</h2>
            <p className="text-gray-500 mb-2">
              Your request to join <strong>{group.name}</strong> has been sent to the admin.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              You will be notified once the admin approves your request.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => router.push('/groups/search')}
                className="border border-gray-200 text-gray-700 font-medium px-6 py-3 rounded-xl hover:bg-gray-50 transition-all"
              >
                Browse More Groups
              </button>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
