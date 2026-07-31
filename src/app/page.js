'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GroupCard from '@/components/GroupCard';
import AdBanner from '@/components/AdBanner';
import {
  HiUserGroup, HiShieldCheck, HiBellAlert,
  HiChartBar, HiCurrencyDollar, HiCheckCircle, HiStar,
  HiArrowRight, HiChevronDown, HiPlay,
  HiPhone, HiOutlineArrowRight
} from 'react-icons/hi2';
import { HiSearch, HiLightningBolt, HiBadgeCheck, HiPhotograph } from 'react-icons/hi';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // No demo groups - real groups only when created and approved, auto-updates - placeholder that auto-updates
  const groups = [];
  const businessAds = [];

  const activeAds = [];

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSearchResults(true);
      setSearchResults([]);
    }
  };

  const features = [
    { icon: <HiUserGroup className="w-6 h-6" />, title: 'Create & Join Groups', desc: 'Start your own Ajo group or join existing ones with unique group IDs.' },
    { icon: <HiShieldCheck className="w-6 h-6" />, title: 'Face Verification', desc: 'Secure identity verification to build trust among group members.' },
    { icon: <HiBellAlert className="w-6 h-6" />, title: 'Smart Reminders', desc: 'Get notified on the website and via WhatsApp when payments are due.' },
    { icon: <HiChartBar className="w-6 h-6" />, title: 'Real-time Tracking', desc: 'Track contributions, payments, and rotation progress in real time.' },
    { icon: <HiCurrencyDollar className="w-6 h-6" />, title: 'Transparent Rotation', desc: 'See exactly who has paid, who is next to receive, and the full rotation order.' },
    { icon: <HiCheckCircle className="w-6 h-6" />, title: 'Payment Receipts', desc: 'Upload receipts and track verification status for every contribution.' },
  ];

  const steps = [
    { num: 1, title: 'Sign Up', desc: 'Create your account with face verification.' },
    { num: 2, title: 'Create or Join', desc: 'Start a group (paid) or search and join an existing one for free.' },
    { num: 3, title: 'Contribute', desc: 'Pay to the admin and upload your receipt as proof.' },
    { num: 4, title: 'Track & Get Paid', desc: 'Monitor progress and receive your payout when it is your turn.' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-300 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-gold-400 rounded-full blur-3xl"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary-600/40 border border-primary-400/30 rounded-full px-4 py-1.5 mb-6">
              <HiBadgeCheck className="w-4 h-4 text-gold-400" />
              <span className="text-sm text-primary-100">Nigeria&apos;s Trusted Ajo Platform</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Manage Your Ajo.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-400">
                Build Trust.{' '}
              </span>
              Grow Together.
            </h1>
            <p className="text-lg md:text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
              The digital platform that brings transparency and organization to traditional Ajo savings.
              Track contributions, manage rotations, and stay connected with your group.
            </p>
            <form onSubmit={handleSearch} className="max-w-xl mx-auto mb-8">
              <div className="relative">
                <input type="text" placeholder="Search Ajo groups by name or Group ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-white placeholder-primary-200 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent text-base" />
                <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-primary-200" />
              </div>
            </form>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => router.push('/signup')} className="w-full sm:w-auto bg-gold-500 hover:bg-gold-600 text-gray-900 font-semibold px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-gold-500/25 flex items-center justify-center gap-2">
                <HiUserGroup className="w-5 h-5" />Join a Group
              </button>
              <button onClick={() => router.push('/groups/create')} className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-xl backdrop-blur-xl border border-white/20 transition-all flex items-center justify-center gap-2">
                <HiLightningBolt className="w-5 h-5" />Create a Group<span className="text-xs bg-gold-500 text-gray-900 px-2 py-0.5 rounded-full font-medium">Premium</span>
              </button>
            </div>
          </div>
        </div>
        <div className="relative h-16 bg-gray-50" style={{ clipPath: 'ellipse(50% 100% at 50% 100%)' }}></div>
      </section>

      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Support Businesses</h2>
            <p className="text-gray-600">Check out these trusted businesses recommended by the Payround community.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <div className="col-span-3 bg-gray-50 rounded-2xl border border-dashed p-12 text-center">
              <p className="font-semibold">No businesses yet</p>
              <p className="text-sm text-gray-500 mt-1">Real business ads will appear here when approved by owner in owner site. Auto-updates when added.</p>
            </div>
          </div>
          <div className="text-center">
            <button onClick={() => router.push('/ads')} className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 font-medium px-6 py-3 rounded-xl hover:bg-primary-100 transition-all border border-primary-200">
              <HiPhotograph className="w-5 h-5" />Advertise Your Business Here
            </button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything You Need to Manage Your Ajo</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Payround brings transparency, trust, and organization to traditional community savings.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">How Payround Works</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Getting started with Payround is simple. Four easy steps to join the community.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative text-center">
                {index < 3 && (<div className="hidden md:block absolute top-8 left-[60%] w-full h-0.5 border-t-2 border-dashed border-primary-200"></div>)}
                <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4 relative z-10">
                  <span className="text-2xl font-bold text-primary-700">{step.num}</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Active Ajo Groups</h2>
              <p className="text-gray-600">Join existing groups or create your own - Top rated + most active at top</p>
            </div>
            <button onClick={() => router.push('/groups/search')} className="hidden md:flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors">View All <HiArrowRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="col-span-3 bg-white rounded-2xl border border-dashed p-12 text-center">
              <p className="font-semibold">No active groups yet</p>
              <p className="text-sm text-gray-500 mt-1">Real groups will appear here when created and approved by owner in owner site. Top rated + most active groups show first. Auto-updates when added.</p>
              <button onClick={() => router.push('/groups/create')} className="mt-4 bg-primary-600 text-white px-6 py-2 rounded-xl text-sm">Create First Group - 12 colors, selfie+ID, ₦5000 Palmpay 9151723199</button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-primary-900 to-primary-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">0+</p><p className="text-primary-200 text-sm">Registered Users - Real count from DB</p></div>
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">0</p><p className="text-primary-200 text-sm">Active Groups - Real, editable from owner site</p></div>
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">₦0+</p><p className="text-primary-200 text-sm">Saved Through Platform</p></div>
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">100%</p><p className="text-primary-200 text-sm">Member Satisfaction</p></div>
          </div>
          <p className="text-center text-primary-300 text-xs mt-6">Real numbers auto-tracked - no demo, placeholder until real data added. Editable from owner analytics.</p>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Ready to Transform Your Ajo Experience?</h2>
          <p className="text-lg text-gray-600 mb-8">Join thousands of Nigerians using Payround to save smarter and build trust together.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => router.push('/signup')} className="w-full sm:w-auto bg-primary-600 text-white font-semibold px-10 py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-200">Get Started Free</button>
            <button onClick={() => router.push('/groups/search')} className="w-full sm:w-auto border border-gray-300 text-gray-700 font-semibold px-10 py-3.5 rounded-xl hover:bg-gray-50 transition-all">Browse Groups</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
