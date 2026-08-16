'use client';

import { HiUserGroup, HiBadgeCheck, HiCalendar, HiCurrencyDollar } from 'react-icons/hi';
import { HiOutlineArrowRight } from 'react-icons/hi2';
import GroupBadge from '@/components/GroupBadge';

export default function GroupCard({ group, compact = false }) {

  const scheduleLabels = {
    'Daily': 'Daily',
    'Weekly': 'Weekly',
    'Every 2 Weeks': 'Bi-weekly',
    'Monthly': 'Monthly',
    'Custom': 'Custom',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden card-hover">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-50 rounded-xl flex items-center justify-center">
              <span className="text-primary-700 font-bold text-lg">{group.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <span className="truncate">{group.name}</span>
                <GroupBadge verified={group.groupVerified} className="w-5 h-5 shrink-0" />
              </h3>
              <p className="text-xs text-gray-500 font-mono">ID: {group.id}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <span>by {group.adminName || '—'}</span>
                {group.adminVerified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0" title="Verified account" />}
              </p>
            </div>
          </div>
          {group.badgeTier && <GroupBadge tier={group.badgeTier} className="w-8 h-8 shrink-0" />}
        </div>

        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{group.description}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <HiCurrencyDollar className="w-4 h-4 text-primary-500" />
            <span>₦{group.contributionAmount?.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <HiCalendar className="w-4 h-4 text-primary-500" />
            <span>{scheduleLabels[group.contributionSchedule] || group.contributionSchedule}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <HiUserGroup className="w-4 h-4 text-primary-500" />
            <span>{group.currentMembers}/{group.maxMembers} members</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className={`w-2 h-2 rounded-full ${
              group.healthScore >= 85 ? 'bg-green-500' : group.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
            }`}></span>
            <span>Health: {group.healthScore}%</span>
          </div>
        </div>

        {!compact && (
          <a
            href={`/groups/${group.id}`}
            className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-primary-50 text-gray-700 hover:text-primary-700 border border-gray-200 hover:border-primary-200 rounded-xl py-2.5 text-sm font-medium transition-all"
          >
            View Details
            <HiOutlineArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
