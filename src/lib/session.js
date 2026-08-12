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
  const { data: row } = await supabase
    .from('users')
    .select('id,name,email,phone,role,is_verified')
    .eq('email', email)
    .maybeSingle();
  const profile = row || {
    id: user.id,
    name: user.user_metadata?.name || email.split('@')[0],
    email,
    phone: user.user_metadata?.phone || '',
    role: 'member',
    is_verified: false,
  };
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
