import { supabase } from '@/lib/supabase';

export const USER_KEY = 'payround_user';

// This cache is display/navigation state only. Authorization always comes from
// the verified Supabase session and database policies.
export function readLocalUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocalUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(USER_KEY);
      return;
    }
    localStorage.setItem(USER_KEY, JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role || 'member',
      faceVerified: !!user.is_verified,
      is_approved: !!user.is_approved,
      approval_status: user.approval_status || null,
    }));
  } catch {}
}

export async function persistProfileFromAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user?.email) {
    writeLocalUser(null);
    return null;
  }

  const email = user.email.toLowerCase();
  try {
    const { data: td } = await supabase.rpc('get_my_takedown');
    if (td?.taken_down) {
      await signOutEverywhere();
      return null;
    }
  } catch {}

  const firstProfile = await supabase.rpc('get_my_profile');
  if (firstProfile.error) {
    writeLocalUser(null);
    return null;
  }
  const row = firstProfile.data || null;
  let pendingRef = '';
  try {
    pendingRef = (localStorage.getItem('payround_pending_ref') || sessionStorage.getItem('payround_pending_ref') || '').trim();
  } catch {}

  // Existing legacy profiles are resolved by the verified JWT email in the RPC,
  // preserving their original profile ID, approval, groups and history. Login and
  // session restoration never insert a profile; only the explicit signup flow does.

  // Never invent a temporary replacement identity when profile persistence fails.
  if (!row?.id) {
    writeLocalUser(null);
    return null;
  }

  if (pendingRef) {
    try {
      const { data: referral } = await supabase.rpc('apply_referral', { p_new_email: email, p_ref: pendingRef });
      if (referral?.ok) {
        localStorage.removeItem('payround_pending_ref');
        sessionStorage.removeItem('payround_pending_ref');
      }
    } catch {}
  }

  writeLocalUser(row);
  return row;
}

export async function signOutEverywhere() {
  try { await supabase.auth.signOut(); } catch {}
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('payround_must_change_pw');
  } catch {}
}
