'use client';

// Privacy-safe ad-placement analytics.
// • A view is sent only after the placement is confirmed in the viewport.
// • A click is sent only from a sponsored placement link.
// • The server validates the ad, derives signed-in identity from the JWT, excludes
//   advertiser self-activity, and stores only pseudonymous account/guest tokens.
// • Views are appearances, not daily-deduplicated reach. Reach is calculated from
//   distinct pseudonymous viewers and legacy identity-less rows never become people.

function guestViewerToken() {
  try {
    let value = localStorage.getItem('pr_guest');
    if (!value) {
      const random = typeof crypto !== 'undefined' && crypto.getRandomValues
        ? Array.from(crypto.getRandomValues(new Uint32Array(3))).map(n => n.toString(36)).join('')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      value = random.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      localStorage.setItem('pr_guest', value);
    }
    return `g:${value}`;
  } catch {
    return null;
  }
}

/** Record one server-validated placement event. kind: view | click. */
export async function trackAdEvent(kind, ad, mediaIndex = null) {
  try {
    if (typeof window === 'undefined' || !ad?.id || !['view', 'click'].includes(kind)) return false;
    const { supabase } = await import('@/lib/supabase');
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('record_ad_event', {
      p_ad_id: String(ad.id),
      p_kind: kind,
      p_media_index: mediaIndex === null || mediaIndex === undefined ? null : Number(mediaIndex),
      p_viewer_token: guestViewerToken(),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Fetch protected analytics for an ad owned by the caller (owner can fetch any ad). */
export async function fetchAdEvents(adId) {
  try {
    if (!adId) return [];
    const { supabase } = await import('@/lib/supabase');
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('get_ad_analytics', { p_ad_id: String(adId) });
    if (error) return null;
    return data || [];
  } catch {
    return null;
  }
}

/** Turn raw rows into appearances, distinct known reach, per-media and per-day totals. */
export function aggregateAdEvents(rows) {
  const views = (rows || []).filter(r => r.kind === 'view');
  const clicks = (rows || []).filter(r => r.kind === 'click');

  const people = (rs) => new Set(rs.map(r => r.viewer).filter(Boolean));
  const accounts = (rs) => new Set(rs.map(r => r.viewer).filter(v => v && !v.startsWith('g:')));
  const guestDevices = (rs) => new Set(rs.map(r => r.viewer).filter(v => v && v.startsWith('g:')));
  const legacyGuests = (rs) => rs.filter(r => !r.viewer).length;

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

  // A sponsored click is itself proof that the placement reached that viewer. Use
  // the union so an immediate tap cannot produce an impossible >100% tap rate if
  // the browser navigates before its IntersectionObserver callback is delivered.
  const reached = [...views, ...clicks];
  const peopleReached = people(reached).size;
  const uniqueClickers = people(clicks).size;

  return {
    totalViews: views.length,
    peopleReached,
    accountsReached: accounts(reached).size,
    guestDevices: guestDevices(reached).size,
    legacyGuests: legacyGuests(views),
    totalClicks: clicks.length,
    uniqueClickers,
    legacyClickGuests: legacyGuests(clicks),
    tapRate: peopleReached > 0 ? Math.round((uniqueClickers / peopleReached) * 100) : 0,
    perMedia: [...byMedia.entries()].sort((a, b) => a[0] - b[0])
      .map(([idx, b]) => ({ idx, views: b.views, people: b.viewers.size, guests: b.guests })),
    perDay: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}
