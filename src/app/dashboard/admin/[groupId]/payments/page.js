'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getGroupById } from '@/lib/data';
import {
  HiArrowLeft, HiCheckCircle, HiClock, HiExclamation,
  HiEye, HiX, HiCheck, HiPhotograph
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function AdminPaymentsPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

  useEffect(() => {
    const found = getGroupById(params.groupId);
    if (found) setGroup(found);
  }, [params.groupId]);

  if (!group) return null;

  const pendingPayments = group.members.filter(m =>
    m.contributions[m.contributions.length - 1]?.status === 'pending'
  );

  const allPayments = group.members.map(m => ({
    member: m,
    lastContribution: m.contributions[m.contributions.length - 1],
  }));

  const handleApprove = (memberId) => {
    toast.success('Payment approved!');
    setSelectedPayment(null);
  };

  const handleReject = (memberId) => {
    toast.error('Payment rejected');
    setSelectedPayment(null);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'overdue': return 'bg-red-50 text-red-700 border-red-200';
      case 'not_due': return 'bg-gray-50 text-gray-500 border-gray-200';
      default: return 'bg-gray-50 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payments - {group.name}</h1>
        <p className="text-gray-500 mb-6">{pendingPayments.length} payment pending verification</p>

        {/* Pending Verification */}
        {pendingPayments.length > 0 && (
          <div className="mb-8">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <HiClock className="w-5 h-5 text-yellow-500" />
              Pending Verification
            </h3>
            <div className="space-y-3">
              {pendingPayments.map(member => (
                <div key={member.id} className="bg-white rounded-2xl border border-yellow-100 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-700 font-semibold">{member.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-500">Rot #{member.rotationNo} • {member.phone}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-full text-xs font-medium">
                      <HiClock className="w-3.5 h-3.5" />
                      Pending
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">Amount: <strong>₦{member.contributions[member.contributions.length - 1]?.amount?.toLocaleString() || 0}</strong></span>
                    <button
                      onClick={() => setSelectedPayment(selectedPayment === member.id ? null : member.id)}
                      className="flex items-center gap-1 text-sm text-primary-600 font-medium hover:text-primary-700"
                    >
                      <HiEye className="w-4 h-4" />
                      View Receipt
                    </button>
                  </div>

                  {selectedPayment === member.id && (
                    <div className="mb-3 p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
                        <div className="text-center">
                          <HiPhotograph className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Receipt Preview</p>
                          <p className="text-xs text-gray-400">(receipt image would appear here)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(member.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-emerald-700 transition-all"
                    >
                      <HiCheck className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(member.id)}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 text-sm font-medium py-2.5 rounded-xl hover:bg-red-100 transition-all border border-red-200"
                    >
                      <HiX className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Payments */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">All Payment Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Cycle</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {group.members.map(member =>
                  member.contributions.map((c, idx) => (
                    <tr key={`${member.id}-${idx}`} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">Cycle {idx + 1}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">₦{c.amount.toLocaleString()}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{c.paidDate || '-'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyle(c.status)}`}>
                          {c.status === 'paid' && <><HiCheckCircle className="w-3 h-3 mr-1" /> Paid</>}
                          {c.status === 'pending' && <><HiClock className="w-3 h-3 mr-1" /> Pending</>}
                          {c.status === 'overdue' && <><HiExclamation className="w-3 h-3 mr-1" /> Overdue</>}
                          {c.status === 'not_due' && 'Not Due'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
