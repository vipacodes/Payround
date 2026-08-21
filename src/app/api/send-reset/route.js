import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { email } = await req.json();
    const em = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      return NextResponse.json({ ok: false, error: 'invalid-email' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://biqutnjvhkvldrihywdb.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU';

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // 🔎 Reset links go ONLY to emails that belong to a PayRound account.
    // account_exists is a SECURITY DEFINER RPC — no table access is exposed.
    const { data: exists, error: existsError } = await supabase.rpc('account_exists', { p_email: em });
    if (existsError) {
      console.error('account_exists', existsError.message);
      return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
    }
    if (!exists) {
      return NextResponse.json({ ok: false, error: 'no-account' }, { status: 404 });
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://payround-omega.vercel.app';
    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      console.error('resetPasswordForEmail', error.message);
      return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sent: true, via: 'supabase' });
  } catch (err) {
    console.error('send-reset error:', err?.message);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
