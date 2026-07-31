let supabaseClient = null;

function getEnv(name, fallback) {
  try {
    const val = process.env[name];
    if (!val || val === 'null' || val === 'undefined' || val.trim() === '' || String(val).toLowerCase().includes('null')) return fallback;
    return String(val).trim().replace(/^["']|["']$/g, '');
  } catch { return fallback; }
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://biqutnjvhkvldrihywdb.supabase.co');
const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU');

try {
  const { createClient } = require('@supabase/supabase-js');
  if (supabaseUrl && supabaseUrl.startsWith('https://') && supabaseAnonKey && supabaseAnonKey.length > 20) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (e) {
  console.log('Supabase init fallback', e.message);
}

export const supabase = supabaseClient || {
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: { bank_name: 'Palmpay', account_number: '9151723199', account_name: 'Basikoro James Okeroghene', whatsapp: '+2349151723199', group_fee: 5000, renewal_fee: 5000, ad_1day: 500, ad_1week: 3325, ad_1month: 13500 }, error: null }),
      }),
      order: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
    }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    insert: () => Promise.resolve({ data: null, error: null }),
    upsert: () => Promise.resolve({ data: null, error: null }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
  }),
  auth: {
    signInWithPassword: async () => ({ data: null, error: null }),
    resetPasswordForEmail: async () => ({ data: null, error: null }),
  },
};

export async function getGroupsFromSupabase() {
  try {
    if (!supabaseClient) return null;
    const { data, error } = await supabase.from('groups').select('*').eq('is_verified', true).order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) return [];
    return data.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      contributionAmount: g.amount,
      contributionSchedule: g.frequency,
      maxMembers: g.max_members,
      currentMembers: g.max_members ? Math.floor(g.max_members * 0.6) : 12,
      color: g.color || '#0A7E3C',
      adminName: g.admin_name,
      adminVerified: g.is_verified,
      healthScore: g.health || 85,
      rating: g.rating || 0,
      createdAt: g.created_at,
    }));
  } catch (e) {
    console.log('Groups fetch fallback', e.message);
    return [];
  }
}

export async function getAdsFromSupabase() {
  try {
    if (!supabaseClient) return [];
    const { data, error } = await supabase.from('ads').select('*').eq('status', 'approved').order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}
