// 🔊 Tiny UI sounds — synthesized live with the Web Audio API.
// No audio files to download (works instantly, even on slow networks) and each
// sound is under ~0.4s so the app never feels noisy. Users can switch all
// sounds off in Settings (stored in localStorage 'payround_sounds').

let ctx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

// Browsers refuse audio before the user touches the screen — the first tap
// anywhere quietly "unlocks" our audio engine.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { try { getCtx(); } catch {} }, { passive: true });
}

export function soundsEnabled() {
  try { return localStorage.getItem('payround_sounds') !== 'off'; } catch { return true; }
}
export function setSoundsEnabled(on) {
  try { localStorage.setItem('payround_sounds', on ? 'on' : 'off'); } catch {}
}

function tone(freq, t0, dur, type = 'sine', vol = 0.14) {
  const c = getCtx();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    const start = c.currentTime + t0;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(start);
    o.stop(start + dur + 0.05);
  } catch {}
}

export const sounds = {
  // 🔔 New notification arrived
  ding() { if (!soundsEnabled()) return; tone(880, 0, 0.14); tone(1318, 0.1, 0.2); },
  // 💬 New message (direct or group chat)
  pop() { if (!soundsEnabled()) return; tone(520, 0, 0.06, 'triangle', 0.11); tone(780, 0.05, 0.09, 'triangle', 0.09); },
  // 📤 You sent a message
  send() { if (!soundsEnabled()) return; tone(660, 0, 0.05, 'triangle', 0.1); tone(990, 0.05, 0.1, 'triangle', 0.08); },
  // ✅ Something succeeded (receipt uploaded, join request sent, approval done)
  success() { if (!soundsEnabled()) return; tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.24); },
  // 💰 Money moment — payout marked collected / your payout landed
  cash() {
    if (!soundsEnabled()) return;
    tone(1047, 0, 0.09, 'triangle', 0.09);
    tone(1319, 0.08, 0.09, 'triangle', 0.09);
    tone(1568, 0.16, 0.12, 'triangle', 0.09);
    tone(2093, 0.26, 0.3, 'sine', 0.11);
  },
  // ⚠️ Something went wrong
  error() { if (!soundsEnabled()) return; tone(220, 0, 0.16, 'sawtooth', 0.06); tone(185, 0.12, 0.24, 'sawtooth', 0.06); },
};
