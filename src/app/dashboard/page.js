'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DashboardCard from '@/components/DashboardCard';
import RotationTable from '@/components/RotationTable';
import ProgressBar from '@/components/ProgressBar';
import AnnouncementCard from '@/components/AnnouncementCard';
import Calculator from '@/components/Calculator';
import { groups, getGroupById, getGroupStats } from '@/lib/data';
import {
  HiUserGroup, HiCurrencyDollar, HiCalendar, HiBell,
  HiChartBar, HiCheckCircle, HiClock, HiExclamation,
  HiArrowRight, HiUser, HiCalculator, HiDocumentText
} from 'react-icons/hi';
import { HiOutlineArrowRight } from 'react-icons/hi2';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [memberData, setMemberData] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('payround_user');
      if (!stored) {
        router.push('/login');
        return;
      }
      const parsed = JSON.parse(stored);
      setUser(parsed);

      // Load demo data - first group
      const group = groups[0];
      if (group) {
        setActiveGroup(group);
        setStats(getGroupStats(group.id));
        
        // Find member data or use first member as sample
        const member = group.members?.find(m => m.id === 'member2') || group.members?.[0] || null;
        setMemberData(member);
      }
    } catch (e) {
      console.error('Dashboard error:', e);
      router.push('/login');
    }
  }, []);

  if (!user || !activeGroup) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'rotation', label: 'Rotation' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'calculator', label: 'Calculator' },
    { id: 'rules', label: 'Rules' },
  ];

  const getMemberStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-medium"><HiCheckCircle className="w-3.5 h-3.5" /> Paid</span>;
      case 'pending':
        return <span className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2.5 py-1 rounded-full text-xs font-medium"><HiClock className="w-3.5 h-3.5" /> Pending Verification</span>;
      case 'overdue':
        return <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2.5 py-1 rounded-full text-xs font-medium"><HiExclamation className="w-3.5 h-3.5" /> Overdue</span>;
      case 'not_due':
        return <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full text-xs font-medium"><HiClock className="w-3.5 h-3.5" /> Not Yet Due</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Welcome back, {user.name} 👋
            </h1>
            <p className="text-gray-500 mt-1">Here&apos;s your savings overview</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/groups/search')}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-all"
            >
              <HiUserGroup className="w-4 h-4" />
              Join Group
            </button>
            <button
              onClick={() => router.push('/groups/create')}
              className="flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
            >
              <HiCurrencyDollar className="w-4 h-4" />
              Create Group
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <DashboardCard
            icon={<HiUserGroup className="w-5 h-5" />}
            label="Active Groups"
            value={user.memberGroups.length || 1}
            subtext={`Member of ${activeGroup.name}`}
            color="primary"
          />
          <DashboardCard
            icon={<HiCurrencyDollar className="w-5 h-5" />}
            label="Total Contributed"
            value={`₦${(memberData?.totalPaid || 0).toLocaleString()}`}
            color="gold"
            subtext={memberData?.contributions?.length || 0}
          />
          <DashboardCard
            icon={<HiChartBar className="w-5 h-5" />}
            label={`Rotation #${memberData?.rotationNo || '-'}`}
            value={memberData?.payoutStatus === 'next' ? 'You\'re Next! 🎯' : memberData?.payoutStatus === 'received' ? 'Received ✅' : 'Waiting'}
            color={memberData?.payoutStatus === 'next' ? 'purple' : memberData?.payoutStatus === 'received' ? 'green' : 'blue'}
            subtext={`Expected: ${memberData?.expectedPayout || 'N/A'}`}
          />
          <DashboardCard
            icon={<HiBell className="w-5 h-5" />}
            label="Next Payment Due"
            value={memberData?.contributions?.length > 0 
              ? (memberData.contributions[memberData.contributions.length - 1]?.status === 'paid' ? 'All Good' : 'Due Soon')
              : 'Due Soon'
            }
            color={memberData?.contributions?.length > 0 && memberData.contributions[memberData.contributions.length - 1]?.status === 'paid' ? 'green' : 'red'}
          />
        </div>

        {/* Group Info Banner */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-5 md:p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">{activeGroup.name}</h3>
              <p className="text-primary-100 text-sm">ID: {activeGroup.id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-primary-100">Group Health</p>
              <p className="text-2xl font-bold">{activeGroup.healthScore}%</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 mb-6 pb-1 scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-200 hover:text-primary-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Member Progress */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Progress</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-primary-50 rounded-xl">
                    <p className="text-xs text-primary-600 font-medium">Rotation Number</p>
                    <p className="text-2xl font-bold text-primary-900 mt-1">#{memberData?.rotationNo}</p>
                  </div>
                  <div className="p-4 bg-gold-50 rounded-xl">
                    <p className="text-xs text-gold-600 font-medium">Total Paid</p>
                    <p className="text-2xl font-bold text-gold-900 mt-1">₦{(memberData?.totalPaid || 0).toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <p className="text-xs text-purple-600 font-medium">Payout Status</p>
                    <p className="text-base font-bold text-purple-900 mt-1 capitalize">{memberData?.payoutStatus === 'next' ? 'Next to Receive 🎯' : memberData?.payoutStatus === 'received' ? 'Received ✅' : 'Waiting'}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <p className="text-xs text-blue-600 font-medium">Expected Payout</p>
                    <p className="text-lg font-bold text-blue-900 mt-1">{memberData?.expectedPayout || 'N/A'}</p>
                  </div>
                </div>

                <ProgressBar
                  value={memberData?.contributions?.filter(c => c.status === 'paid').length || 0}
                  max={activeGroup.totalCycles}
                  label="Contribution Progress"
                  color="primary"
                />
              </div>

              {/* Payment History */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
                {memberData?.contributions?.length > 0 ? (
                  <div className="space-y-2">
                    {memberData.contributions.map((contribution, index) => (
                      <div key={index} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Cycle {index + 1}</p>
                          <p className="text-xs text-gray-500">{contribution.paidDate || 'Not paid'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">₦{contribution.amount.toLocaleString()}</span>
                          {getMemberStatusBadge(contribution.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No payment history yet.</p>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Latest Announcement */}
              {activeGroup.announcements?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">Latest Announcement</h3>
                    <button onClick={() => setActiveTab('announcements')} className="text-xs text-primary-600 font-medium">View all</button>
                  </div>
                  <AnnouncementCard announcement={activeGroup.announcements[activeGroup.announcements.length - 1]} />
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => router.push(`/groups/${activeGroup.id}/payment`)}
                    className="w-full flex items-center gap-3 p-3 bg-primary-50 text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-100 transition-all"
                  >
                    <HiCurrencyDollar className="w-5 h-5" />
                    Make Payment
                  </button>
                  <button
                    onClick={() => setActiveTab('rotation')}
                    className="w-full flex items-center gap-3 p-3 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100 transition-all"
                  >
                    <HiUserGroup className="w-5 h-5" />
                    View Rotation
                  </button>
                  <button
                    onClick={() => setActiveTab('calculator')}
                    className="w-full flex items-center gap-3 p-3 bg-gold-50 text-gold-700 rounded-xl text-sm font-medium hover:bg-gold-100 transition-all"
                  >
                    <HiCalculator className="w-5 h-5" />
                    Calculate
                  </button>
                  <button
                    onClick={() => router.push(`/groups/${activeGroup.id}`)}
                    className="w-full flex items-center gap-3 p-3 bg-gray-50 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 transition-all"
                  >
                    <HiDocumentText className="w-5 h-5" />
                    Group Details
                  </button>
                </div>
              </div>

              {/* Payment Status */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Current Cycle Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Members Paid</span>
                    <span className="text-sm font-medium text-gray-900">{stats?.paidThisCycle || 0} / {stats?.totalMembers || 0}</span>
                  </div>
                  <ProgressBar value={stats?.paidThisCycle || 0} max={stats?.totalMembers || 1} size="sm" showPercent={false} />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Cycle</span>
                    <span className="text-sm font-medium text-gray-900">{stats?.currentCycle || 0} / {stats?.totalCycles || 0}</span>
                  </div>
                  <ProgressBar value={stats?.currentCycle || 0} max={stats?.totalCycles || 1} size="sm" color="gold" showPercent={false} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rotation' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Rotation Order</h3>
                <span className="text-xs text-gray-500">{activeGroup.rotationOrder?.length || 0} members</span>
              </div>
              <RotationTable rotationOrder={activeGroup.rotationOrder} />
            </div>
          </div>
        )}

        {activeTab === 'announcements' && (
          <div className="max-w-2xl space-y-4">
            {activeGroup.announcements?.length > 0 ? (
              activeGroup.announcements.map(ann => (
                <AnnouncementCard key={ann.id} announcement={ann} />
              ))
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p className="text-gray-500">No announcements yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="max-w-md">
            <Calculator
              contributionAmount={activeGroup.contributionAmount}
              totalMembers={activeGroup.maxMembers}
            />
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Group Rules</h3>
              <p className="text-sm text-gray-500 mb-4">Rules set by the admin for {activeGroup.name}</p>
              {activeGroup.rules?.length > 0 ? (
                <ul className="space-y-3">
                  {activeGroup.rules.map((rule, index) => (
                    <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                      <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-700">{rule}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No rules have been set yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
