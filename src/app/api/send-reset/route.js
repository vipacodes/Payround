import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fallbacks keep the route working even when env vars are missing server-side.
// (The anon key is a PUBLIC key by design — the same one already shipped in the client bundle.)
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://biqutnjvhkvldrihywdb.supabase.co';
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXV0bmp2aGt2bGRyaWh5d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk1NjMsImV4cCI6MjEwMTA1NTU2M30.zLffszHcCGRFmnGW0iXSp6BNJ_BMPqQv1W6TXQNxYLU';

const TEMP_MINUTES = 20;
const COOLDOWN_MS = 2 * 60 * 1000; // never spam one inbox — one fresh code per 2 minutes

function genTempPassword() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return `PR-${out}`;
}

async function supa(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { ok: res.ok, status: res.status, json };
}

const emailHtml = (name, code) => `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:16px">
    <div style="text-align:center;margin-bottom:16px">
      <div style="display:inline-block;background:#16a34a;color:#fff;font-weight:bold;font-size:28px;width:56px;height:56px;line-height:56px;border-radius:16px">P</div>
      <h2 style="color:#14532d;margin:8px 0 0">Pay<span style="color:#16a34a">round</span></h2>
    </div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px">
      <p style="color:#111827;margin:0 0 8px">Hi${name ? ' <b>' + name + '</b>' : ''} 👋</p>
      <p style="color:#374151;margin:0 0 16px">Your temporary PayRound password is:</p>
      <div style="text-align:center;background:#f0fdf4;border:2px dashed #22c55e;border-radius:12px;padding:16px;margin-bottom:16px">
        <span style="font-family:monospace;font-size:30px;font-weight:bold;letter-spacing:4px;color:#14532d">${code}</span>
      </div>
      <p style="color:#374151;margin:0 0 6px">⏳ It works for <b>${TEMP_MINUTES} minutes</b>, one time only.</p>
      <p style="color:#374151;margin:0 0 16px">Log in with it — PayRound will ask you to set your own new password immediately.</p>
      <div style="text-align:center">
        <a href="https://payround-omega.vercel.app/login" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:10px">Log in now →</a>
      </div>
    </div>
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:14px">If you didn't request this, ignore this email — your old password still works.</p>
  </div>`;

const emailText = (name, code) => `Hi${name ? ' ' + name : ''},

Your temporary PayRound password is: ${code}

It works for ${TEMP_MINUTES} minutes, one time only. Log in at https://payround-omega.vercel.app/login — you'll be asked to set your own new password immediately.

If you didn't request this, ignore this email — your old password still works.

— PayRound`;

async function sendEmail(to, name, code) {
  const subject = '🔑 Your PayRound temporary password';
  // 1) Gmail SMTP (any recipient) — GMAIL_USER + GMAIL_APP_PASSWORD (16-char app password)
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const nodemailer = (await import('nodemailer')).default;
    const tr = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await tr.sendMail({ from: `PayRound <${process.env.GMAIL_USER}>`, to, subject, text: emailText(name, code), html: emailHtml(name, code) });
    return 'gmail';
  }
  // 2) Resend API — RESEND_API_KEY (+ EMAIL_FROM, needs verified domain for outside emails)
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'PayRound <onboarding@resend.dev>',
        to,
        subject,
        text: emailText(name, code),
        html: emailHtml(name, code),
      }),
    });
    if (!res.ok) throw new Error(`Resend rejected: ${await res.text()}`);
    return 'resend';
  }
  return null; // no mail service configured
}

export async function POST(req) {
  try {
    const { email } = await req.json();
    const em = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      return NextResponse.json({ ok: false, error: 'invalid-email' }, { status: 400 });
    }
    // account must exist
    const found = await supa(`users?email=eq.${encodeURIComponent(em)}&select=id,name,email,reset_expires`);
    if (!found.ok) throw new Error('lookup failed');
    const user = Array.isArray(found.json) ? found.json[0] : null;
    if (!user) return NextResponse.json({ ok: false, error: 'no-account' }, { status: 404 });

    // anti-spam cooldown — don't hammer an inbox
    if (user.reset_expires) {
      const age = Date.now() - (new Date(user.reset_expires).getTime() - TEMP_MINUTES * 60000);
      if (age < COOLDOWN_MS) return NextResponse.json({ ok: false, error: 'cooldown' }, { status: 429 });
    }

    const code = genTempPassword();
    const expires = new Date(Date.now() + TEMP_MINUTES * 60000).toISOString();
    const saved = await supa(`users?email=eq.${encodeURIComponent(em)}`, {
      method: 'PATCH',
      body: JSON.stringify({ reset_code: code, reset_expires: expires }),
    });
    if (!saved.ok) throw new Error('save failed');

    const firstName = String(user.name || '').split(' ')[0] || '';
    try {
      const via = await sendEmail(em, firstName, code);
      if (via) {
        return NextResponse.json({ ok: true, sent: true, via });
      }
    } catch (mailErr) {
      console.error('mail send failed:', mailErr?.message);
      // fall through to dev fallback so the user is never locked out
    }
    // No email service connected (or send failed) — return code so the app shows it on-screen as a bridge
    return NextResponse.json({ ok: true, sent: false, dev_fallback: true, code });
  } catch (err) {
    console.error('send-reset error:', err?.message);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
