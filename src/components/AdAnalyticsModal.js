'use client';

import { useState, useEffect } from 'react';
import { fetchAdEvents, aggregateAdEvents } from '@/lib/adAnalytics';
import { parseAdMedia, isVideoSrc } from './AdBanner';

const fmtDay = (iso) => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
};
const fmtDayShort = (d) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch { return d; }
};

// 📊 Ad analytics modal — unlocked for the advertiser AFTER the ad's paid run ends.
// Bright, forced-readable styling (inline colors) so nothing ever fades on dark screens.
export default function AdAnalyticsModal({ ad, onClose }) {
  const [state, setState] = useState('loading'); // loading | ok | empty | error
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await fetchAdEvents(ad?.id);
      if (!alive) return;
      if (rows === null) setState('error');
      else if (!rows.length) setState('empty');
      else { setStats(aggregateAdEvents(rows)); setState('ok'); }
    })();
    return () => { alive = false; };
  }, [ad?.id]);

  const media = parseAdMedia(ad?.media_urls);
  const days = Number(ad?.duration_days) || null;
  const maxPerDay = state === 'ok' ? Math.max(1, ...stats.perDay.map(d => d[1])) : 1;
  const bestDay = state === 'ok' && stats.perDay.length
    ? stats.perDay.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;

  return (
    <div className="fixed inset-0 z-[96] bg-black/70 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* ===== header ===== */}
        <div className="rounded-t-3xl px-5 pt-5 pb-4" style={{ background: 'linear-gradient(135deg,#059669 0%,#047857 55%,#065f46 100%)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold tracking-widest mb-1" style={{ color: '#a7f3d0' }}>📊 AD ANALYTICS</p>
              <h3 className="text-lg font-extrabold leading-tight truncate" style={{ color: '#ffffff' }}>{ad?.business_name || 'Your ad'}</h3>
              <p className="text-[11px] mt-1" style={{ color: '#d1fae5' }}>
                ⌛ Run ended{ad?.expires_at ? ` ${fmtDay(ad.expires_at)}` : ''}
                {ad?.approved_at ? ` · started ${fmtDay(ad.approved_at)}` : ''}
                {days ? ` · ${days}-day plan · ₦${Number(ad?.price || 0).toLocaleString()}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}>✕ Close</button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {state === 'loading' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
              </div>
              <div className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
              <p className="text-center text-xs font-semibold" style={{ color: '#334155' }}>Counting your views… ⏳</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-8">
              <p className="font-bold text-sm" style={{ color: '#111827' }}>Analytics could not load just now 😕</p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>Check your internet and try again — nothing is lost.</p>
            </div>
          )}

          {state === 'empty' && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📭</div>
              <p className="font-bold text-sm" style={{ color: '#111827' }}>No views were counted for this run</p>
              <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: '#475569' }}>
                Analytics started counting recently, so runs that ended earlier may have no numbers. New ads count confirmed on-screen appearances and privacy-safe reach — even without taps. 🚀
              </p>
            </div>
          )}

          {state === 'ok' && stats && (
            <>
              {/* ===== big numbers ===== */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl p-3.5" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <p className="text-xl mb-0.5">👥</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#047857' }}>{stats.peopleReached.toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#065f46' }}>PEOPLE REACHED</p>
                  <p className="text-[10px]" style={{ color: '#047857' }}>
                    {stats.accountsReached > 0 ? `${stats.accountsReached} account${stats.accountsReached === 1 ? '' : 's'}` : 'no logged-in accounts yet'}{stats.guestDevices > 0 ? ` · ${stats.guestDevices} guest device${stats.guestDevices === 1 ? '' : 's'}` : ''} saw this ad
                  </p>
                </div>
                <div className="rounded-2xl p-3.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <p className="text-xl mb-0.5">👀</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#1d4ed8' }}>{stats.totalViews.toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#1e40af' }}>TOTAL VIEWS</p>
                  <p className="text-[10px]" style={{ color: '#1d4ed8' }}>every on-screen appearance — no tap needed (each photo/video counts separately)</p>
                </div>
                <div className="rounded-2xl p-3.5" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p className="text-xl mb-0.5">👆</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#b45309' }}>{stats.uniqueClickers.toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#92400e' }}>SPONSORED CLICKS</p>
                  <p className="text-[10px]" style={{ color: '#b45309' }}>distinct people who tapped an ad action</p>
                </div>
                <div className="rounded-2xl p-3.5" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                  <p className="text-xl mb-0.5">⚡</p>
                  <p className="text-2xl font-black leading-none" style={{ color: '#6d28d9' }}>{stats.tapRate}%</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#5b21b6' }}>TAP RATE</p>
                  <p className="text-[10px]" style={{ color: '#6d28d9' }}>known viewers who tapped a sponsored action</p>
                </div>
              </div>

              {/* ===== per-media breakdown ===== */}
              {stats.perMedia.length > 0 && (
                <div>
                  <p className="text-xs font-extrabold mb-2" style={{ color: '#111827' }}>🖼 EACH PHOTO & VIDEO</p>
                  <div className="space-y-2">
                    {stats.perMedia.map((m) => {
                      const src = media[m.idx];
                      const isVid = src ? isVideoSrc(src) : false;
                      return (
                        <div key={m.idx} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0" style={{ background: '#0f172a' }}>
                            {src ? (isVid
                              ? <video src={src} muted playsInline preload="metadata" className="w-full h-full object-contain" />
                              : <img src={src} alt="" className="w-full h-full object-contain" />)
                              : <div className="w-full h-full flex items-center justify-center text-white text-xs">🖼</div>}
                            {isVid && <span className="absolute bottom-0 right-0 text-[8px] text-white px-1 rounded-tl" style={{ background: 'rgba(0,0,0,0.65)' }}>▶</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-extrabold" style={{ color: '#0f172a' }}>{isVid ? 'Video' : 'Photo'} {m.idx + 1}</p>
                            <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round((m.views / Math.max(1, stats.totalViews)) * 100))}%`, background: 'linear-gradient(90deg,#34d399,#059669)' }} />
                            </div>
                            <p className="text-[10px] mt-1 font-semibold" style={{ color: '#334155' }}>
                              {m.views.toLocaleString()} view{m.views === 1 ? '' : 's'} · {m.people.toLocaleString()} {m.people === 1 ? 'person' : 'people'}{m.guests ? ` · +${m.guests} guest view${m.guests === 1 ? '' : 's'}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== views per day ===== */}
              {stats.perDay.length > 0 && (
                <div>
                  <p className="text-xs font-extrabold mb-1" style={{ color: '#111827' }}>📅 VIEWS PER DAY</p>
                  {bestDay && (
                    <p className="text-[10px] font-semibold mb-2" style={{ color: '#047857' }}>🏆 Best day: {fmtDayShort(bestDay[0])} — {bestDay[1].toLocaleString()} view{bestDay[1] === 1 ? '' : 's'}</p>
                  )}
                  <div className="rounded-2xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="flex items-end gap-1 h-24">
                      {stats.perDay.slice(-31).map(([d, v]) => (
                        <div key={d} className="flex-1 flex flex-col items-center justify-end h-full" title={`${fmtDayShort(d)} — ${v} views`}>
                          <span className="text-[8px] font-bold mb-0.5" style={{ color: '#047857' }}>{v > 0 && stats.perDay.length <= 14 ? v : ''}</span>
                          <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, Math.round((v / maxPerDay) * 100))}%`, background: v === maxPerDay ? 'linear-gradient(180deg,#fbbf24,#f59e0b)' : 'linear-gradient(180deg,#34d399,#059669)' }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[9px] font-semibold" style={{ color: '#64748b' }}>{fmtDayShort(stats.perDay[0][0])}</span>
                      <span className="text-[9px] font-semibold" style={{ color: '#64748b' }}>{fmtDayShort(stats.perDay[stats.perDay.length - 1][0])}</span>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[10px] leading-relaxed rounded-xl p-2.5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                💡 A view is one confirmed on-screen appearance of a sponsored photo or video. People reached is distinct privacy-safe account and guest-device reach; old identity-less rows stay in total views but are never guessed to be people. Clicks come only from sponsored placement actions, not ordinary business-profile visits.
              </p>

              <button onClick={onClose} className="w-full text-sm font-extrabold py-3 rounded-xl text-white" style={{ background: '#059669' }}>Done 🎉</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
