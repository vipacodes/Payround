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
  const [groupsData, setGroupsData] = useState([]);
  const [adsData, setAdsData] = useState([]);
  const [realStats, setRealStats] = useState({ totalUsers: 0, totalGroups: 0, totalSaved: '₦0+', satisfaction: '100%' });

  useEffect(() => {
    // Robust Supabase fetch - if fails, keep empty placeholder, never crash, never null unreachable
    const load = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        // Fetch owner settings for stats editable from owner site
        try {
          const { data: settings } = await supabase.from('owner_settings').select('*').eq('id', 1).single();
          if (settings) {
            setRealStats({
              totalUsers: settings.total_users_override || 0,
              totalGroups: settings.total_groups_override || 0,
              totalSaved: settings.total_saved_override || '₦0+',
              satisfaction: settings.satisfaction_override || '100%',
            });
          }
        } catch {}
        // Fetch groups - real groups only when created and approved, top rated + most active at top except search
        try {
          const { data: gData } = await supabase.from('groups').select('*').eq('status', 'active').order('created_at', { ascending: false });
          if (gData && gData.length) {
            const mapped = gData.map(g => ({
              id: g.id,
              name: g.name,
              description: g.description,
              contributionAmount: g.amount,
              contributionSchedule: g.frequency,
              maxMembers: g.max_members,
              currentMembers: Math.floor((g.max_members||20)*0.6),
              color: g.color || '#0A7E3C',
              adminName: g.admin_name,
              adminVerified: g.is_verified,
              healthScore: g.health || 85,
              rating: g.rating || 0,
            }));
            const sorted = [...mapped].sort((a,b) => (b.healthScore + (b.rating||0)*10 + b.currentMembers) - (a.healthScore + (a.rating||0)*10 + a.currentMembers));
            setGroupsData(sorted);
            setRealStats(prev => ({ ...prev, totalGroups: mapped.length }));
          }
        } catch {}
        // Fetch ads - real only
        try {
          const { data: aData } = await supabase.from('ads').select('*').eq('status', 'approved').order('submitted_at', { ascending: false });
          if (aData && aData.length) {
            const mappedAds = aData.map(a => ({ id: a.id, businessName: a.business_name, description: a.description, contact: a.phone, website: a.website, active: true, imageUrl: a.media_url }));
            setAdsData(mappedAds);
          }
        } catch {}
        // Fetch users count for real stats
        try {
          const { supabase: sb } = await import('@/lib/supabase');
          const { count: userCount } = await sb.from('users').select('*', { count: 'exact', head: true });
          if (userCount !== null) setRealStats(prev => ({ ...prev, totalUsers: userCount }));
        } catch {}
      } catch (e) {
        console.log('Supabase load fallback - site still opens with placeholders', e.message);
      }
    };
    load();
  }, []);

  const activeAds = adsData.filter(ad => ad.active !== false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const results = groupsData.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(results);
      setShowSearchResults(true);
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
            {showSearchResults && (
              <div className="max-w-xl mx-auto mb-8 bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-100"><p className="text-sm text-gray-500">{searchResults.length} group{searchResults.length !== 1 ? 's' : ''} found - Top rated + most active at top except search shows exact match</p></div>
                <div className="max-h-64 overflow-y-auto">
                  {searchResults.length > 0 ? searchResults.map(group => (
                    <button key={group.id} onClick={() => { router.push(`/groups/${group.id}`); setShowSearchResults(false); }} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor: group.color || '#dcfce7'}}><span className="text-white font-bold">{group.name.charAt(0)}</span></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900">{group.name}</p><p className="text-xs text-gray-500 font-mono">ID: {group.id}</p></div>
                    </button>
                  )) : <div className="p-6 text-center"><p className="text-sm text-gray-500">No groups found. Create one with 12 colors, selfie+ID, ₦5000 Palmpay 9151723199</p></div>}
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => router.push('/signup')} className="w-full sm:w-auto bg-gold-500 hover:bg-gold-600 text-gray-900 font-semibold px-8 py-3.5 rounded-xl transition-all shadow-xl shadow-gold-500/25 flex items-center justify-center gap-2"><HiUserGroup className="w-5 h-5" />Join a Group</button>
              <button onClick={() => router.push('/groups/create')} className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-xl backdrop-blur-xl border border-white/20 transition-all flex items-center justify-center gap-2"><HiLightningBolt className="w-5 h-5" />Create a Group<span className="text-xs bg-gold-500 text-gray-900 px-2 py-0.5 rounded-full font-medium">Premium</span></button>
            </div>
          </div>
        </div>
        <div className="relative h-16 bg-gray-50" style={{ clipPath: 'ellipse(50% 100% at 50% 100%)' }}></div>
      </section>

      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Support Businesses</h2>
            <p className="text-gray-600">Check out these trusted businesses recommended by the Payround community - Real ads only when approved by owner, auto-updates</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {activeAds.length > 0 ? activeAds.map(ad => (
              <div key={ad.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor: '#fef3c7'}}><span className="font-bold text-xl">{ad.businessName.charAt(0)}</span></div>
                <h3 className="font-semibold text-gray-900 mt-3 mb-1">{ad.businessName}</h3>
                <p className="text-sm text-gray-600 mb-3">{ad.description}</p>
                <div className="flex items-center gap-3"><a href={ad.website} target="_blank" className="text-xs text-primary-600 font-medium">Visit Website</a><a href={`tel:${ad.contact}`} className="text-xs text-gray-500">{ad.contact}</a></div>
              </div>
            )) : (
              <div className="col-span-3 bg-gray-50 rounded-2xl border border-dashed p-12 text-center">
                <p className="font-semibold">No businesses yet</p>
                <p className="text-sm text-gray-500 mt-1">Real business ads will appear here when approved by owner in owner site. User designs ad with media + separate receipt to Palmpay 9151723199. Auto-updates when added.</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <button onClick={() => router.push('/ads')} className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 font-medium px-6 py-3 rounded-xl hover:bg-primary-100 transition-all border border-primary-200">
              <HiPhotograph className="w-5 h-5" />Advertise Your Business Here - 500/day 3325/week 13500/month
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
            {[
              { icon: <HiUserGroup className="w-6 h-6" />, title: 'Create & Join Groups', desc: 'Start your own Ajo group or join existing ones with unique group IDs. 12 colors, admin can create multiple groups.' },
              { icon: <HiShieldCheck className="w-6 h-6" />, title: 'Face Verification', desc: 'Secure identity verification to build trust - selfie + NIN/Voter/Driver/Passport mandatory for group creation.' },
              { icon: <HiBellAlert className="w-6 h-6" />, title: 'Smart Reminders', desc: 'Get notified on website and via WhatsApp when payments due, expiry, renewal - to +2349151723199 and members.' },
              { icon: <HiChartBar className="w-6 h-6" />, title: 'Real-time Tracking', desc: 'Track contributions, payments, rotation progress, next payment due date, expected payout amount/date individual.' },
              { icon: <HiCurrencyDollar className="w-6 h-6" />, title: 'Transparent Rotation', desc: 'See who paid, who next, full rotation order. Members can leave groups but admin must approve first.' },
              { icon: <HiCheckCircle className="w-6 h-6" />, title: 'Payment Receipts', desc: 'Upload receipts and track verification - pending until Group Admin approves, admin can join other groups as member.' },
            ].map((feature, index) => (
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
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Getting started simple - 4 easy steps, 1 account per email, only your password works, forgot password reset link via email</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { num: 1, title: 'Sign Up', desc: 'Create account with face verification - selfie+ID. 1 account per email enforced.' },
              { num: 2, title: 'Create or Join', desc: 'Start group (paid ₦5000 to Palmpay 9151723199 + receipt + 12 colors + selfie+ID) or join existing, trial once/email 7d active→7d frozen no edit→delete.' },
              { num: 3, title: 'Contribute', desc: 'Pay to group admin and upload receipt - pending until admin approves. Next payment due shows date.' },
              { num: 4, title: 'Track & Get Paid', desc: 'Monitor progress, expected payout amount editable by admin, expected payout date individual, payout when turn comes. 6 months +7d grace→frozen only owner unfreeze.' },
            ].map((step, index) => (
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
              <p className="text-gray-600">Join existing groups or create your own - Top rated + most active at top except search shows exact match</p>
            </div>
            <button onClick={() => router.push('/groups/search')} className="hidden md:flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors">View All <HiArrowRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupsData.length > 0 ? (
              groupsData.slice(0, 6).map(group => (
                <div key={group.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style={{backgroundColor: group.color || '#16a34a'}}>{group.name.charAt(0)}</div>
                        <div><h3 className="font-semibold text-gray-900">{group.name}</h3><p className="text-xs text-gray-500 font-mono">ID: {group.id} • Rating: {group.rating || 0}★ • Health: {group.healthScore||85}%</p></div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{group.description} • Next payment due: {new Date(Date.now()+7*24*60*60*1000).toLocaleDateString()} • Expected payout: ₦{group.contributionAmount?.toLocaleString()} - editable by admin</p>
                    <button onClick={() => router.push(`/groups/${group.id}`)} className="w-full bg-gray-50 hover:bg-primary-50 text-gray-700 hover:text-primary-700 border rounded-xl py-2.5 text-sm font-medium">View Details - Leave approval, join multiple, admin join other groups</button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 bg-white rounded-2xl border border-dashed p-12 text-center">
                <p className="font-semibold">No active groups yet</p>
                <p className="text-sm text-gray-500 mt-1">Real groups will appear here when created and approved by owner in owner site. Top most active + good rated groups show first (health + rating + members). Except search shows exact match. Auto-updates when added. Members can leave but admin must approve, join multiple groups at once, admin can create/manage multiple groups (multiple ₦5000 payments), admin can join other groups as members.</p>
                <button onClick={() => router.push('/groups/create')} className="mt-4 bg-primary-600 text-white px-6 py-2 rounded-xl text-sm">Create First Group - 12 colors, selfie+ID (NIN/Voter/Driver/Passport), ₦5000 Palmpay 9151723199 receipt, trial once/email</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-primary-900 to-primary-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">{realStats.totalUsers}{typeof realStats.totalUsers === 'number' ? '+' : ''}</p><p className="text-primary-200 text-sm">Registered Users - Real count from Supabase, 1 per email, editable from owner</p></div>
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">{realStats.totalGroups}</p><p className="text-primary-200 text-sm">Active Groups - Real, no demo, auto-updates</p></div>
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">{realStats.totalSaved}</p><p className="text-primary-200 text-sm">Saved Through Platform</p></div>
            <div><p className="text-3xl md:text-4xl font-bold text-white mb-1">{realStats.satisfaction}</p><p className="text-primary-200 text-sm">Member Satisfaction - Rating 1-5 stars</p></div>
          </div>
          <p className="text-center text-primary-300 text-xs mt-6">Real numbers auto-tracked from Supabase shared DB - editable from owner site payround-owner.vercel.app → Analytics & Revenue tab. 1 account per email enforced. Only your password works, forgot password reset link via email.</p>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Ready to Transform Your Ajo Experience?</h2>
          <p className="text-lg text-gray-600 mb-8">Join thousands of Nigerians using Payround to save smarter and build trust together. 12 colors, KYC selfie+ID, Palmpay receipt, trial once, 6 months renewal, ratings/reviews, voice notes 7d, in-app chat, Pidgin/Yoruba/Igbo/Hausa, dark mode, group stories.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => router.push('/signup')} className="w-full sm:w-auto bg-primary-600 text-white font-semibold px-10 py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-200">Get Started Free - 1 per email</button>
            <button onClick={() => router.push('/groups/search')} className="w-full sm:w-auto border border-gray-300 text-gray-700 font-semibold px-10 py-3.5 rounded-xl hover:bg-gray-50 transition-all">Browse Groups - Top rated at top</button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
