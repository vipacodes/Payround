import { supabase } from '@/lib/supabase';

export const USER_KEY = 'payround_user';

export function readLocalUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocalUser(user) {
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
  }));
}

export async function persistProfileFromAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    writeLocalUser(null);
    return null;
  }
  const email = user.email.toLowerCase();
  try {
    const { data: td } = await supabase.rpc('account_takedown', { p_email: email });
    if (td?.taken_down) {
      await signOutEverywhere();
      return null;
    }
  } catch {}
  let { data: row } = await supabase
    .from('users')
    .select('id,name,email,phone,role,is_verified')
    .eq('email', email)
    .maybeSingle();
  let pendingRef = '';
  try { pendingRef = (localStorage.getItem('payround_pending_ref') || sessionStorage.getItem('payround_pending_ref') || '').trim(); } catch {}
  if (!row) {
    const fresh = {
      id: user.id,
      email,
      name: user.user_metadata?.name || email.split('@')[0],
      phone: user.user_metadata?.phone || '',
      role: 'member',
      is_verified: false,
      referred_by: pendingRef || null,
    };
    const { error } = await supabase.from('users').insert(fresh);
    if (!error) row = fresh;
    else {
      const retry = await supabase.from('users').insert({
        email, name: fresh.name, phone: fresh.phone, role: 'member', referred_by: pendingRef || null,
      });
      if (!retry.error) {
        const again = await supabase.from('users').select('id,name,email,phone,role,is_verified').eq('email', email).maybeSingle();
        row = again.data;
      }
    }
  }
  const profile = row || {
    id: user.id,
    name: user.user_metadata?.name || email.split('@')[0],
    email,
    phone: user.user_metadata?.phone || '',
    role: 'member',
    is_verified: false,
  };
  if (pendingRef) {
    try {
      await supabase.rpc('apply_referral', { p_new_email: email, p_ref: pendingRef });
      localStorage.removeItem('payround_pending_ref');
      sessionStorage.removeItem('payround_pending_ref');
    } catch {}
  }
  writeLocalUser(profile);
  return profile;
}

export async function signOutEverywhere() {
  try { await supabase.auth.signOut(); } catch {}
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('payround_must_change_pw');
  } catch {}
}
