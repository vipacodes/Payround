'use client';

import { HiCheckCircle, HiClock, HiUser, HiArrowRight } from 'react-icons/hi';
import { HiOutlineClock } from 'react-icons/hi2';

export default function RotationTable({ rotationOrder }) {
  if (!rotationOrder || rotationOrder.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Rotation order has not been set yet.</p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'received':
        return (
          <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-medium">
            <HiCheckCircle className="w-3.5 h-3.5" />
            Received Payment
          </span>
        );
      case 'next':
        return (
          <span className="flex items-center gap-1 text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full text-xs font-medium ring-2 ring-primary-200">
            <HiArrowRight className="w-3.5 h-3.5" />
            Next to Receive Payment
          </span>
        );
      case 'waiting':
        return (
          <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full text-xs font-medium">
            <HiOutlineClock className="w-3.5 h-3.5" />
            Waiting
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="overflow-hidden">
      <div className="space-y-2">
        {rotationOrder.map((member, index) => (
          <div
            key={member.memberId || index}
            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
              member.status === 'next'
                ? 'bg-primary-50 border-primary-200 shadow-sm'
                : member.status === 'received'
                ? 'bg-emerald-50/50 border-emerald-100'
                : 'bg-white border-gray-100'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Rotation Number */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                member.status === 'received'
                  ? 'bg-emerald-100 text-emerald-700'
                  : member.status === 'next'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {member.rotationNo}
              </div>

              {/* Member Info */}
              <div>
                <div className="flex items-center gap-2">
                  <HiUser className={`w-4 h-4 ${
                    member.status === 'received' ? 'text-emerald-500' :
                    member.status === 'next' ? 'text-primary-500' : 'text-gray-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    member.status === 'next' ? 'text-primary-900' : 'text-gray-900'
                  }`}>
                    {member.memberName}
                  </span>
                </div>
                {member.status === 'received' && member.receivedDate && (
                  <p className="text-xs text-gray-400 ml-6 mt-0.5">Received on {member.receivedDate}</p>
                )}
              </div>
            </div>

            {getStatusBadge(member.status)}
          </div>
        ))}
      </div>
    </div>
  );
}
