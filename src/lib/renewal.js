// 🔔 Group plan renewal reminders.
// The group admin gets ONE bell notification per renewal date, 7 days before the plan renews.
// The notification id is deterministic (group + expiry date), so repeat page loads can't
// stack duplicates — the second insert simply conflicts on the primary key and is ignored.
export async function remindRenewalIfSoon(supabase, group) {
  try {
    if (!group || !group.expiry_at || !group.admin_email) return;
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
