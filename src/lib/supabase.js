import { createClient } from '@supabase/supabase-js';

function getEnv(name) {
  try {
    const val = process.env[name];
    if (!val || val === 'null' || val === 'undefined' || String(val).trim() === '') return '';
    return String(val).trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

// Anon key is a public client key (safe in the browser). RLS is what protects data.
const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL') || 'https://biqutnjvhkvldrihywdb.supabase.co';
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU';

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export async function getGroupsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('public_groups')
      .select('*')
      .order('id', { ascending: false });
    if (error) {
      const fallback = await supabase.from('groups').select('id,name,description,amount,frequency,max_members,color,status,admin_name,is_verified,health,created_at').eq('is_verified', true).order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return mapGroups(fallback.data);
    }
    return mapGroups(data);
  } catch (e) {
    console.log('Groups fetch fallback', e.message);
    return [];
  }
}

function mapGroups(data) {
  if (!data || !data.length) return [];
  return data.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    contributionAmount: g.amount,
    contributionSchedule: g.frequency,
    maxMembers: g.max_members,
    currentMembers: g.max_members ? Math.floor(g.max_members * 0.6) : 0,
    color: g.color || '#0A7E3C',
    adminName: g.admin_name,
    adminVerified: g.is_verified,
    healthScore: g.health || 85,
    rating: g.rating || 0,
    createdAt: g.created_at,
  }));
}

export async function getAdsFromSupabase() {
  try {
    const { data, error } = await supabase.from('ads').select('id,business_name,description,website,media_url,media_urls,media_type,status,expires_at,submitted_at').eq('status', 'approved').order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data || []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > Date.now());
  } catch {
    return [];
  }
}
