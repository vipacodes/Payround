'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RotationTable from '@/components/RotationTable';
import AnnouncementCard from '@/components/AnnouncementCard';
import Calculator from '@/components/Calculator';
import { groups, getGroupById } from '@/lib/data';
import {
  HiShieldCheck, HiUserGroup, HiCalendar, HiCurrencyDollar,
  HiUser, HiArrowRight, HiCheckCircle, HiClock, HiStar,
  HiBadgeCheck, HiPhone, HiMail, HiDocumentText,
  HiCalculator
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function GroupDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const found = getGroupById(params.id);
    if (found) {
      setGroup(found);
    }
  }, [params.id]);

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiUserGroup className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Group Not Found</h2>
          <p className="text-gray-500 mb-4">The group you&apos;re looking for doesn&apos;t exist.</p>
          <button
            onClick={() => router.push('/groups/search')}
            className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
          >
            Browse Groups
          </button>
        </div>
      </div>
    );
  }

  const scheduleLabels = {
    'Daily': 'Daily',
    'Weekly': 'Weekly',
    'Every 2 Weeks': 'Every 2 Weeks',
    'Monthly': 'Monthly',
    'Custom': 'Custom Schedule',
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'rotation', label: 'Rotation' },
    { id: 'rules', label: 'Rules' },
    { id: 'calculator', label: 'Calculator' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Group Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Icon */}
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-primary-700 font-bold text-3xl">{group.name.charAt(0)}</span>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{group.name}</h1>
                {group.adminVerified && (
                  <span className="flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full">
                    <HiShieldCheck className="w-3.5 h-3.5" />
                    Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 font-mono mb-3">Group ID: {group.id}</p>
              <p className="text-gray-600 mb-4">{group.description}</p>

              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-primary-50 rounded-xl">
                  <p className="text-xs text-primary-600">Contribution</p>
                  <p className="text-base font-bold text-primary-900">₦{group.contributionAmount?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gold-50 rounded-xl">
                  <p className="text-xs text-gold-600">Schedule</p>
                  <p className="text-base font-bold text-gold-900">{scheduleLabels[group.contributionSchedule]}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-600">Members</p>
                  <p className="text-base font-bold text-blue-900">{group.currentMembers}/{group.maxMembers}</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl">
                  <p className="text-xs text-purple-600">Health Score</p>
                  <p className="text-base font-bold text-purple-900">{group.healthScore}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Profile */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Group Admin</h4>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-bold">{group.adminName.charAt(0)}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-900">{group.adminName}</span>
                    {group.adminVerified && <HiBadgeCheck className="w-4 h-4 text-primary-500" />}
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><HiShieldCheck className="w-3 h-3" /> Admin</p>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <a href={`tel:${group.adminPhone}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600">
                  <HiPhone className="w-4 h-4" /> {group.adminPhone}
                </a>
                <a href={`mailto:${group.adminEmail}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600">
                  <HiMail className="w-4 h-4" /> Email
                </a>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="mt-3 p-4 bg-gray-50 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Payment Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500">Bank</p>
                <p className="text-sm font-medium text-gray-900">{group.bankName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Account Name</p>
                <p className="text-sm font-medium text-gray-900">{group.accountName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Account Number</p>
                <p className="text-sm font-medium text-gray-900 font-mono">{group.accountNumber}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 mb-6 pb-1">
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
          <div className="space-y-6">
            {/* Constitution */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">About This Group</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{group.constitution}</p>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Group Progress</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-700">{group.currentCycle}</p>
                  <p className="text-xs text-gray-500">Current Cycle</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-700">{group.totalCycles}</p>
                  <p className="text-xs text-gray-500">Total Cycles</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-700">{group.currentMembers}</p>
                  <p className="text-xs text-gray-500">Active Members</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-700">{group.pendingRequests?.length || 0}</p>
                  <p className="text-xs text-gray-500">Pending Requests</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => router.push(`/groups/${group.id}/join`)}
                className="flex-1 bg-primary-600 text-white font-semibold py-4 rounded-2xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 text-center"
              >
                Join This Group
              </button>
              <button
                onClick={() => router.push(`/groups/${group.id}/payment`)}
                className="flex-1 bg-white border border-gray-200 text-gray-700 font-semibold py-4 rounded-2xl hover:bg-gray-50 transition-all text-center"
              >
                Make Payment
              </button>
            </div>
          </div>
        )}

        {activeTab === 'rotation' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Rotation Order</h3>
            <p className="text-sm text-gray-500 mb-4">
              Members are assigned rotation numbers. Once you receive your payout, the next person in line gets their turn.
            </p>
            <RotationTable rotationOrder={group.rotationOrder} />
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Group Rules</h3>
            {group.rules?.length > 0 ? (
              <ul className="space-y-3">
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
              <p className="text-sm text-gray-500">No rules have been set yet.</p>
            )}
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="max-w-md">
            <Calculator contributionAmount={group.contributionAmount} totalMembers={group.maxMembers} />
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
