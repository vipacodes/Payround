// Shared notification visibility rules.
// A notification is visible to a user ONLY when:
//   • user_email = their email          -> personal (just for them)
//   • user_email = null + group_id set  -> only members/admins of THAT group
//   • user_email = null + no group_id   -> broadcast (everyone)
export function isVisibleTo(n, myEmail, myGroupIds = []) {
  const em = (myEmail || '').toLowerCase();
  if (n.user_email) return !!em && n.user_email.toLowerCase() === em;
  if (n.group_id) return myGroupIds.includes(n.group_id);
  return true;
}

// Group IDs the user belongs to (as admin or approved member).
export async function getMyGroupIds(supabase, myEmail) {
  const em = (myEmail || '').toLowerCase();
  if (!em) return [];
  const ids = new Set();
  try {
    const { data: adminGs } = await supabase.from('groups').select('id').eq('admin_email', em);
    (adminGs || []).forEach(g => ids.add(g.id));
    const { data: mems } = await supabase.from('members').select('group_id').eq('member_email', em).eq('status', 'approved');
    (mems || []).forEach(m => ids.add(m.group_id));
  } catch {}
  return [...ids];
}

// Delete notifications older than 60 days (storage housekeeping).
export async function purgeOldNotifications(supabase) {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('notifications').delete().lt('created_at', cutoff);
  } catch {}
}

// 🎉 GROUP FULL ALERT — fires the moment the LAST open spot gets taken.
// Every approved member AND the admin get a personal notification saying savings
// have started and week 1 payment is due this week. Deterministic ids mean it
// fires exactly once per group — repeat calls are silently ignored by the DB.
export async function notifyGroupFullIfFilled(supabase, groupId) {
  try {
    const { data: g } = await supabase.from('groups').select('id, name, amount, max_members, admin_email').eq('id', groupId).single();
    if (!g) return;
    const N = Math.max(1, parseInt(g.max_members, 10) || 1);
    const { data: mems } = await supabase.from('members').select('member_email, spots').eq('group_id', groupId).eq('status', 'approved');
    const taken = new Set();
    (mems || []).forEach(m => String(m.spots || '').split(',').map(x => parseInt(x.trim(), 10)).filter(Number.isFinite).forEach(sp => taken.add(sp)));
    if (taken.size < N) return; // not full yet — stay quiet
    const emails = new Set((mems || []).map(m => (m.member_email || '').toLowerCase()).filter(Boolean));
    const adminEmail = (g.admin_email || '').toLowerCase();
    if (adminEmail) emails.add(adminEmail);
    for (const email of emails) {
      try {
        await supabase.from('notifications').insert({
          id: `groupfull-${groupId}-${email}`,
          type: 'group_full',
          group_id: groupId,
          is_read: false,
          user_email: email,
          message: adminEmail && email === adminEmail
            ? `🎉 Your group "${g.name}" is now FULL — all ${N} spots are taken and savings start NOW! Your members just got notified to pay week 1 — watch for their receipts in your Payments tab.`
            : `🎉 "${g.name}" is now FULL — savings start NOW! 🥳 Week 1 begins today: pay ₦${Number(g.amount || 0).toLocaleString()} × your spot(s) this week and upload your receipt from the group page. Payouts follow the spot order.`,
        });
      } catch {}
    }
  } catch {}
}
