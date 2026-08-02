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

// ---- Dates --------------------------------------------------------------
// Period k runs [start + (k-1)*periodMs, start + k*periodMs). Your contribution
// for period k is due at the START of that period. Spot #k's payout lands at
// the start of period k too.

export function periodMsOf(group) {
  return periodDays(group?.frequency) * 86400000;
}

export function groupStartMs(group) {
  return new Date(group?.start_date || group?.created_at || Date.now()).getTime();
}

export function periodStartDate(group, period) {
  return new Date(groupStartMs(group) + (Math.max(1, period) - 1) * periodMsOf(group));
}

// Next contribution due date for a member holding `spots` (paid weeks tracked per spot).
// Returns { date, dueNow:boolean } or null when the member holds no spots.
export function nextDueForMember(group, payments, spots) {
  if (!spots || spots.length === 0) return null;
  const period = currentPeriod(group);
  // The member's payment covers ALL their spots — use the least-paid spot
  const minPaid = Math.min(...spots.map(s => paidWeeksForSpot(payments, s)));
  if (minPaid >= period) {
    return { date: periodStartDate(group, period + 1), dueNow: false };
  }
  return { date: periodStartDate(group, period), dueNow: true };
}

// Next cash-out for a member: earliest uncollected payout among their spots.
export function nextCashOutForMember(group, payouts, spots) {
  if (!spots || spots.length === 0) return null;
  const period = currentPeriod(group);
  const pending = (spots || [])
    .filter(s => !payoutForSpot(payouts, s))
    .sort((a, b) => a - b);
  if (pending.length === 0) return null;
  const dueNow = pending.find(s => s <= period);
  if (dueNow !== undefined) return { spot: dueNow, date: periodStartDate(group, dueNow), dueNow: true };
  const next = pending[0];
  return { spot: next, date: periodStartDate(group, next), dueNow: false };
}

// Next payout to be collected for a managed group (admin view): earliest
// uncollected spot that has a holder.
export function nextPayoutForGroup(group, payouts, spotMap) {
  const period = currentPeriod(group);
  const N = cycleLength(group);
  const open = [];
  for (let s = 1; s <= N; s++) {
    if (!spotMap[s]) continue; // no holder yet
    if (payoutForSpot(payouts, s)) continue; // already collected
    open.push(s);
  }
  if (open.length === 0) return null;
  const held = open.filter(s => s <= period);
  if (held.length > 0) return { spot: held[0], date: periodStartDate(group, held[0]), dueNow: true };
  return { spot: open[0], date: periodStartDate(group, open[0]), dueNow: false };
}

// ---------------------------------------------------------------------------
// 🏁 BUSINESS RULE: savings start when the group is FULL.
// The rotation clock begins the moment the LAST spot is taken (the newest
// approved member), unless an explicit start_date is set on the group.
// Returns the start timestamp (ms), or null while the group isn't full yet.
export function savingsStartMs(group, members) {
  if (group?.start_date) {
    const t = new Date(group.start_date).getTime();
    if (Number.isFinite(t)) return t;
  }
  const N = cycleLength(group);
  const holders = (members || []).filter(m => m.status === 'approved' && parseSpots(m.spots).length > 0);
  const taken = new Set(holders.flatMap(m => parseSpots(m.spots)));
  if (taken.size < N) return null;
  const stamps = holders.map(m => new Date(m.approved_at || 0).getTime()).filter(Number.isFinite);
  const latest = stamps.length ? Math.max(...stamps) : 0;
  return latest > 0 ? latest : new Date(group?.created_at || Date.now()).getTime();
}

// Returns a copy of the group whose start_date is the TRUE savings start, so every
// rotation helper (currentPeriod, nextDue, nextCashOut, nextPayout) runs on the
// right clock. Returns null while the group isn't full — show "starts when full".
export function withRotationClock(group, members) {
  const start = savingsStartMs(group, members);
  return start ? { ...group, start_date: new Date(start).toISOString() } : null;
}
