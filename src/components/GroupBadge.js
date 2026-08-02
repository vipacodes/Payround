'use client';

import { HiBadgeCheck } from 'react-icons/hi';

// Check marks shown next to a GROUP's name — every one of them is granted by PayRound,
// never awarded automatically by the app:
//   • Blue check  -> the group was personally checked and given the blue mark (groups.is_verified)
//   • Tier check  -> Bronze / Silver / Gold tier, shown as a colored check (groups.badge_tier)
export const tierCheckClass = {
  bronze: 'text-amber-700 dark:text-amber-500',
  silver: 'text-slate-400 dark:text-slate-300',
  gold: 'text-yellow-500 dark:text-yellow-400',
};

export default function GroupBadge({ verified = false, tier = '', className = 'w-4 h-4 shrink-0' }) {
  const t = (tier || '').toLowerCase();
  const showTier = t === 'bronze' || t === 'silver' || t === 'gold';
  if (!verified && !showTier) return null;
  return (
    <>
      {verified && (
        <HiBadgeCheck className={`${className} text-blue-500`} title="Blue check — given by PayRound" />
      )}
      {showTier && (
        <HiBadgeCheck
          className={`${className} ${tierCheckClass[t]}`}
          title={`${t.charAt(0).toUpperCase() + t.slice(1)} check — given by PayRound`}
        />
      )}
    </>
  );
}
