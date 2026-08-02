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
