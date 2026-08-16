'use client';

import { HiBadgeCheck, HiStar } from 'react-icons/hi';

const tierDetails = {
  bronze: { label: 'Bronze', level: 'Tier 1' },
  silver: { label: 'Silver', level: 'Tier 2' },
  gold: { label: 'Gold', level: 'Tier 3' },
};

/**
 * Shared group trust marks.
 * - verified: keeps the familiar blue PayRound verification check.
 * - tier: uses a separate metallic award so Bronze, Silver and Gold are
 *   immediately distinguishable from verification and from one another.
 */
export default function GroupBadge({ verified = false, tier = '', className = 'w-4 h-4 shrink-0' }) {
  const normalizedTier = String(tier || '').toLowerCase();
  const hasTier = Boolean(tierDetails[normalizedTier]);
  const activeTier = hasTier ? normalizedTier : 'bronze';
  const details = tierDetails[activeTier];
  const tierSize = /(?:^|\s)(?:w|h)-8(?:\s|$)/.test(className)
    ? 'lg'
    : /(?:^|\s)(?:w|h)-6(?:\s|$)/.test(className)
      ? 'md'
      : /(?:^|\s)(?:w|h)-4(?:\s|$)/.test(className)
        ? 'sm'
        : 'base';

  if (!verified && !hasTier) return null;

  return (
    <span className="group-badge-set">
      {verified && (
        <HiBadgeCheck
          className={`${className} text-blue-500 badge-emboss shrink-0`}
          role="img"
          aria-label="Verified PayRound group"
          title="Verified PayRound group"
        />
      )}
      {hasTier && (
        <span
          className={`group-tier-badge group-tier-badge--${activeTier} group-tier-badge--${tierSize}`}
          role="img"
          aria-label={`${details.label} group badge, ${details.level}`}
          title={`${details.label} group badge • ${details.level}`}
        >
          <span className="group-tier-badge__crest" aria-hidden="true">
            <HiStar />
          </span>
          <span className="group-tier-badge__name" aria-hidden="true">{details.label}</span>
        </span>
      )}
    </span>
  );
}
