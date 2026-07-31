'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { groups, getGroupStats } from '@/lib/data';
import {
  HiUserGroup, HiCurrencyDollar, HiUser, HiCheckCircle,
  HiExclamation, HiClock, HiArrowRight, HiShieldCheck,
  HiCog, HiBan, HiEye, HiEyeOff
} from 'react-icons/hi';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  if (!user) return null;

  // For demo, show all groups the user is admin of
  const adminGroups = groups.filter(g => g.adminId === user.id);

  // If no admin groups, show helper
  if (adminGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiShieldCheck className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Admin Groups</h2>
          <p className="text-gray-500 mb-6">You don&apos;t have any groups where you are the admin.</p>
          <button
            onClick={() => router.push('/groups/create')}
            className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
          >
            Create a Group
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  // Show first admin group for demo
  const activeGroup = adminGroups[0];
  const stats = getGroupStats(activeGroup.id);

  const statusBadge = (status) => {
    switch (status) {
      case 'paid': return <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg text-xs font-medium"><HiCheckCircle className="w-3 h-3" /> Paid</span>;
      case 'pending': return <span className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded-lg text-xs font-medium"><HiClock className="w-3 h-3" /> Pending</span>;
      case 'overdue': return <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-lg text-xs font-medium"><HiExclamation className="w-3 h-3" /> Overdue</span>;
      case 'not_due': return <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-1 rounded-lg text-xs font-medium"><HiClock className="w-3 h-3" /> Not Due</span>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Admin Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center">
              <HiShieldCheck className="w-8 h-8 text-primary-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-500">Managing: <strong>{activeGroup.name}</strong> (ID: {activeGroup.id})</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/dashboard/admin/${activeGroup.id}`)}
              className="flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-all"
            >
              <HiCog className="w-4 h-4" />
              Full Admin Panel
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
            <HiUserGroup className="w-5 h-5 text-primary-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{stats?.totalMembers || 0}</p>
            <p className="text-sm text-gray-500">Total Members</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
            <HiCheckCircle className="w-5 h-5 text-emerald-600 mb-2" />
            <p className="text-2xl font-bold text-emerald-700">{stats?.paidThisCycle || 0}</p>
            <p className="text-sm text-gray-500">Paid This Cycle</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
            <HiExclamation className="w-5 h-5 text-red-600 mb-2" />
            <p className="text-2xl font-bold text-red-700">{stats?.outstanding || 0}</p>
            <p className="text-sm text-gray-500">Outstanding</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
            <HiCurrencyDollar className="w-5 h-5 text-gold-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">₦{(stats?.totalCollected || 0).toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total Collected</p>
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Member Payment Records</h3>
            <span className="text-xs text-gray-500">{activeGroup.members.length} members</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Rot #</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Total Paid</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeGroup.members.map((member) => {
                  const lastContribution = member.contributions[member.contributions.length - 1];
                  return (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-700 font-semibold text-xs">{member.name.charAt(0)}</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{member.phone}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">#{member.rotationNo}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">₦{member.totalPaid.toLocaleString()}</td>
                      <td className="px-5 py-4">{lastContribution ? statusBadge(lastContribution.status) : '-'}</td>
                      <td className="px-5 py-4">
                        <button className="text-primary-600 text-sm font-medium hover:text-primary-700">
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Join Requests */}
        {activeGroup.pendingRequests && activeGroup.pendingRequests.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              Pending Join Requests ({activeGroup.pendingRequests.length})
            </h3>
            <div className="space-y-3">
              {activeGroup.pendingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.name}</p>
                    <p className="text-xs text-gray-500">{req.phone} • {req.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-primary-600 text-white text-xs font-medium rounded-xl hover:bg-primary-700 transition-all">
                      Approve
                    </button>
                    <button className="px-4 py-2 bg-red-50 text-red-600 text-xs font-medium rounded-xl hover:bg-red-100 transition-all">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickActionButton
            icon={<HiUserGroup className="w-5 h-5" />}
            label="Members"
            onClick={() => router.push(`/dashboard/admin/${activeGroup.id}/members`)}
          />
          <QuickActionButton
            icon={<HiCurrencyDollar className="w-5 h-5" />}
            label="Approve Payments"
            onClick={() => router.push(`/dashboard/admin/${activeGroup.id}/payments`)}
          />
          <QuickActionButton
            icon={<HiExclamation className="w-5 h-5" />}
            label="Announcements"
            onClick={() => router.push(`/dashboard/admin/${activeGroup.id}/announcements`)}
          />
          <QuickActionButton
            icon={<HiCog className="w-5 h-5" />}
            label="Group Settings"
            onClick={() => router.push(`/dashboard/admin/${activeGroup.id}`)}
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}

function QuickActionButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 p-5 card-hover flex flex-col items-center gap-2 text-center"
    >
      <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
}
