'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getGroupById } from '@/lib/data';
import {
  HiArrowLeft, HiUser, HiCheckCircle, HiClock,
  HiExclamation, HiSearch, HiPhone, HiMail,
  HiLocationMarker, HiBriefcase, HiCurrencyDollar
} from 'react-icons/hi';

export default function AdminMembersPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    const found = getGroupById(params.groupId);
    if (found) setGroup(found);
  }, [params.groupId]);

  if (!group) return null;

  const filteredMembers = group.members.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.phone.includes(searchQuery)
  );

  const getStatusBadge = (status) => {
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Members - {group.name}</h1>
        <p className="text-gray-500 mb-6">{group.members.length} registered members</p>

        <div className="relative mb-6 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Member List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filteredMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => setSelectedMember(selectedMember?.id === member.id ? null : member)}
                  className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left ${
                    selectedMember?.id === member.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-700 font-semibold text-sm">{member.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">Rot #{member.rotationNo} • {member.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">₦{member.totalPaid.toLocaleString()}</span>
                    {getStatusBadge(member.contributions[member.contributions.length - 1]?.status)}
                  </div>
                </button>
              ))}
              {filteredMembers.length === 0 && (
                <div className="p-8 text-center text-gray-500">No members found.</div>
              )}
            </div>
          </div>

          {/* Member Details */}
          <div>
            {selectedMember ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-primary-700 font-bold text-2xl">{selectedMember.name.charAt(0)}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedMember.name}</h3>
                  <p className="text-sm text-gray-500">Rotation #{selectedMember.rotationNo}</p>
                </div>

                <div className="space-y-3">
                  <DetailRow icon={<HiPhone className="w-4 h-4" />} label="Phone" value={selectedMember.phone} />
                  <DetailRow icon={<HiMail className="w-4 h-4" />} label="Email" value={selectedMember.email} />
                  <DetailRow icon={<HiLocationMarker className="w-4 h-4" />} label="Address" value={selectedMember.address} />
                  <DetailRow icon={<HiBriefcase className="w-4 h-4" />} label="Occupation" value={selectedMember.occupation} />
                  <DetailRow icon={<HiUser className="w-4 h-4" />} label="Next of Kin" value={selectedMember.nextOfKin} />
                  <DetailRow icon={<HiCurrencyDollar className="w-4 h-4" />} label="Total Paid" value={`₦${selectedMember.totalPaid.toLocaleString()}`} />
                  <DetailRow icon={<HiCurrencyDollar className="w-4 h-4" />} label="Total Received" value={`₦${(selectedMember.totalReceived || 0).toLocaleString()}`} />
                  <DetailRow icon={<HiCheckCircle className="w-4 h-4" />} label="Payout Status" value={selectedMember.payoutStatus === 'next' ? 'Next to Receive 🎯' : selectedMember.payoutStatus === 'received' ? 'Received ✅' : 'Waiting'} />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <HiUser className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a member to view their details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
      <span className="text-gray-400 w-5">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value || 'N/A'}</p>
      </div>
    </div>
  );
}
