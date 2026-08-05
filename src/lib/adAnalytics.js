'use client';

// 📊 Ad analytics — honest, privacy-safe counters.
// • A "view" is recorded when a media item actually appears on screen (slideshow slot / ad card).
// • A "click" is recorded when someone opens the business page from an ad.
// • Each viewer counts ONCE per ad media per DAY (a daily-unique reach model — matches "how many
//   ACCOUNTS viewed this ad"), and the advertiser's own views of their own ad are never counted.
// • Everything is fire-and-forget: a failed write never touches the UI.

const LS_PREFIX = 'pr_ae_';

function todayKey() {
  try { return new Date().toISOString().slice(0, 10); } catch { return ''; }
}

function viewerEmail() {
  try {
    return (JSON.parse(localStorage.getItem('payround_user') || '{}').email || '').toLowerCase() || null;
  } catch { return null; }
}

// Light housekeeping: drop stale dedupe keys from previous days so storage stays clean
let pruned = false;
function pruneOldKeys() {
  if (pruned) return;
  pruned = true;
  try {
    const today = todayKey();
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith(LS_PREFIX) && !k.endsWith(`_${today}`)) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/** Record one analytics event. kind: 'view' | 'click'. mediaIndex: index inside the ad's media list (null = whole-ad). */
export async function trackAdEvent(kind, ad, mediaIndex = null) {
  try {
    if (typeof window === 'undefined' || !ad || !ad.id) return;
    pruneOldKeys();
    const viewer = viewerEmail();
    // Never count the advertiser looking at their own ad
    const owner = (ad.submitter_email || '').toLowerCase();
    if (viewer && owner && viewer === owner) return;
    const day = todayKey();
    const key = `${LS_PREFIX}${kind}_${ad.id}_${mediaIndex === null || mediaIndex === undefined ? 'a' : mediaIndex}_${day}`;
    if (localStorage.getItem(key)) return; // already counted for this viewer today
    localStorage.setItem(key, '1');
    const { supabase } = await import('@/lib/supabase');
    if (!supabase) return;
    await supabase.from('ad_events').insert({ ad_id: String(ad.id), kind, media_index: mediaIndex, viewer });
  } catch {}
}

/** Fetch raw events for one ad. Returns null on failure, [] when none yet. */
export async function fetchAdEvents(adId) {
  try {
    if (!adId) return [];
    const { supabase } = await import('@/lib/supabase');
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('ad_events')
      .select('kind, media_index, viewer, created_at')
      .eq('ad_id', String(adId))
      .limit(50000);
    if (error) return null;
    return data || [];
  } catch { return null; }
}

/** Turn raw rows into rich stats: totals, unique accounts, per-media, per-day, tap-through. */
export function aggregateAdEvents(rows) {
  const views = (rows || []).filter(r => r.kind === 'view');
  const clicks = (rows || []).filter(r => r.kind === 'click');
  const uniq = (rs) => new Set(rs.map(r => r.viewer).filter(Boolean)).size;
  const guests = (rs) => rs.filter(r => !r.viewer).length;

  const byMedia = new Map();
  for (const v of views) {
    const k = v.media_index === null || v.media_index === undefined ? 0 : Number(v.media_index) || 0;
    if (!byMedia.has(k)) byMedia.set(k, { views: 0, viewers: new Set(), guests: 0 });
    const b = byMedia.get(k);
    b.views += 1;
    if (v.viewer) b.viewers.add(v.viewer); else b.guests += 1;
  }

  const byDay = new Map();
  for (const v of views) {
    const d = (v.created_at || '').slice(0, 10) || '';
    if (!d) continue;
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }

  const uniqueAccounts = uniq(views);
  const uniqueClickers = uniq(clicks);

  return {
    totalViews: views.length,
    uniqueAccounts,
    guestViews: guests(views),
    totalClicks: clicks.length,
    uniqueClickers,
    tapRate: uniqueAccounts > 0 ? Math.round((uniqueClickers / uniqueAccounts) * 100) : 0,
    perMedia: [...byMedia.entries()].sort((a, b) => a[0] - b[0])
      .map(([idx, b]) => ({ idx, views: b.views, accounts: b.viewers.size, guests: b.guests })),
    perDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}
