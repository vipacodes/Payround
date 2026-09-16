// 🔔 Group plan renewal reminders.
// The group admin gets ONE bell notification per renewal date, 7 days before the plan renews.
// The notification id is deterministic (group + expiry date), so repeat page loads can't
// stack duplicates — the second insert simply conflicts on the primary key and is ignored.
//
// 🚫 QUIET UNTIL THE GROUP IS RUNNING: renewal reminders and expired-plan notices are
// sent ONLY while the group is genuinely functional — every spot 1..N is held by an
// approved member AND at least one contribution receipt has been approved. Groups that
// are still recruiting (or were created but never used) never nag their owner to renew.

import { parseSpots } from '@/lib/payments';

// A group is "truly running" when:
//   1. its size (max_members) is known,
//   2. ALL spots 1..N are held by approved members (the group is full), and
//   3. at least one payment receipt has been approved (a real contribution came in).
// Any doubt (missing data, RLS, network) → false, which keeps the owner's bell quiet.
async function groupIsRunning(supabase, group) {
  try {
    let g = group || {};
    let N = parseInt(g.max_members, 10);
    if (!Number.isFinite(N) || N < 1) {
      // Caller passed a partial group row — re-read the size straight from the DB.
      const { data: fresh } = await supabase.from('groups').select('id, max_members').eq('id', g.id).maybeSingle();
      if (!fresh) return false;
      N = parseInt(fresh.max_members, 10);
    }
    if (!Number.isFinite(N) || N < 1) return false; // unknown size → stay quiet

    const { data: mems } = await supabase.from('members')
      .select('spots')
      .eq('group_id', g.id)
      .eq('status', 'approved');
    const taken = new Set();
    (mems || []).forEach(m => parseSpots(m.spots).forEach(sp => {
      if (sp >= 1 && sp <= N) taken.add(sp);
    }));
    if (taken.size < N) return false; // still recruiting — not full yet

    const { count } = await supabase.from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', g.id)
      .eq('status', 'approved');
    return typeof count === 'number' && count > 0; // first contribution received
  } catch {
    return false;
  }
}

export async function remindRenewalIfSoon(supabase, group) {
  try {
    if (!group || !group.expiry_at || !group.admin_email) return;
    // 🚫 Group not functional yet (contributions never started)? Never ask for renewal money.
    if (!(await groupIsRunning(supabase, group))) return;
    const expMs = new Date(group.expiry_at).getTime();
    if (!isFinite(expMs)) return;
    const daysLeft = Math.ceil((expMs - Date.now()) / 86400000);
    if (daysLeft > 7) return; // not inside the 7-day reminder window yet
    const ymd = new Date(expMs).toISOString().slice(0, 10);
    const when = new Date(expMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const price = group.plan_price ? `₦${Number(group.plan_price).toLocaleString()} ` : '';
    await supabase.from('notifications').insert({
      id: `renewal-${group.id}-${ymd}`,
      type: 'renewal_reminder',
      group_id: group.id,
      is_read: false,
      user_email: (group.admin_email || '').toLowerCase(),
      message: daysLeft <= 0
        ? `🔴 Your group "${group.name}" plan expired on ${when}. Renew with ${price}via Palmpay 9151723199 (Basikoro James Okeroghene) and create a renewal receipt through PayRound so your group stays live.`
        : `⏰ Renewal reminder: your group "${group.name}" plan renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${when}). Pay ${price}via Palmpay 9151723199 (Basikoro James Okeroghene) and create a renewal receipt through PayRound to extend your plan.`,
    });
  } catch {}
}
