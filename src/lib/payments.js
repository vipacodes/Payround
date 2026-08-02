// Shared helpers for Ajo rotation math: spots, contribution weeks, payouts.
// A member can hold multiple spots (e.g. #1 and #19) — each spot is an
// independent contribution line and an independent payout slot.
// Cycle length = group.max_members. Spot #k receives its payout at period k.

export function parseSpots(s) {
  return String(s || '')
    .split(',')
    .map(x => parseInt(x.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

export function formatSpots(arr) {
  return [...new Set(arr)].sort((a, b) => a - b).join(',');
}

export function periodDays(frequency) {
  const f = String(frequency || 'weekly').toLowerCase();
  if (f.includes('month')) return 30;
  if (f.includes('bi') || f.includes('two') || f.includes('fortnight')) return 14;
  if (f.includes('day') || f.includes('daily')) return 1;
  return 7; // weekly
}

export function periodLabel(frequency) {
  const f = String(frequency || 'weekly').toLowerCase();
  if (f.includes('month')) return 'month';
  if (f.includes('bi') || f.includes('two') || f.includes('fortnight')) return '2 weeks';
  if (f.includes('day') || f.includes('daily')) return 'day';
  return 'week';
}

// 1-based current period of the cycle, counted from when the group was created.
export function currentPeriod(group) {
  const start = new Date(group?.start_date || group?.created_at || Date.now()).getTime();
  const ms = periodDays(group?.frequency) * 86400000;
  return Math.max(1, Math.floor((Date.now() - start) / ms) + 1);
}

export function cycleLength(group) {
  return Math.max(1, parseInt(group?.max_members, 10) || 1);
}

// Total approved weeks paid for ONE spot (each approved receipt adds `weeks`).
export function paidWeeksForSpot(payments, spot) {
  return (payments || [])
    .filter(p => p.status === 'approved' && parseSpots(p.spots).includes(spot))
    .reduce((sum, p) => sum + (parseInt(p.weeks, 10) || 1), 0);
}

// A spot is "covered" through period N if it has at least N approved weeks.
export function isSpotCurrent(paidWeeks, period) {
  return paidWeeks >= period;
}

// Map spot number -> approved member holding it.
export function buildSpotMap(members) {
  const map = {};
  (members || []).forEach(m => {
    if (m.status !== 'approved') return;
    parseSpots(m.spots).forEach(spot => {
      if (!map[spot]) map[spot] = m; // first holder wins (assignment guarantees uniqueness)
    });
  });
  return map;
}

// Next free spot numbers within 1..max, given already-taken spots.
export function nextFreeSpots(taken, max, count) {
  const out = [];
  for (let s = 1; s <= max && out.length < count; s++) {
    if (!taken.includes(s)) out.push(s);
  }
  return out;
}

// Has this spot's payout already been marked collected?
export function payoutForSpot(payouts, spot) {
  return (payouts || []).find(p => parseInt(p.spot, 10) === spot && p.status === 'collected') || null;
}
