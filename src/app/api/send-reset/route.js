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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://payround-omega.vercel.app';
    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: `${origin}/auth/callback?next=/settings`,
    });
    if (error) {
      console.error('resetPasswordForEmail', error.message);
      return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
    }
    // Always 200 to avoid email enumeration
    return NextResponse.json({ ok: true, sent: true, via: 'supabase' });
  } catch (err) {
    console.error('send-reset error:', err?.message);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
