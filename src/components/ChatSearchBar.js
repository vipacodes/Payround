'use client';

import { useState, useEffect } from 'react';
import { HiSearch, HiX, HiChevronUp, HiChevronDown, HiCalendar } from 'react-icons/hi';
import toast from 'react-hot-toast';

// 🔍 WhatsApp-style "search in this chat": keyword matches with 1-of-N chevron
// navigation + 📅 jump-to-date, matched words glow inside bubbles, and the current
// match gets a golden ring. Shared by DMs, group rooms and the Support chat.

// Highlights every occurrence of q inside message text
export function Mark({ text, q }) {
  const needle = (q || '').trim();
  if (!needle || !text) return <>{text}</>;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let parts;
  try { parts = String(text).split(new RegExp(`(${esc})`, 'ig')); } catch { return <>{text}</>; }
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <mark key={i} className="bg-yellow-300 text-inherit rounded px-0.5">{p}</mark>
        : <span key={i}>{p}</span>))}
    </>
  );
}

export function useChatSearch(msgs) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(0);
  const [flash, setFlash] = useState('');

  const q = query.trim().toLowerCase();
  const matchIdxs = q
    ? (msgs || []).map((m, i) => ((m.body || '').toLowerCase().includes(q) ? i : -1)).filter(i => i >= 0)
    : [];
  const total = matchIdxs.length;
  const activeId = total ? msgs[matchIdxs[Math.min(pos, total - 1)]]?.id : '';

  const scrollMid = (id) => {
    try {
      const el = document.querySelector(`[data-mid="${CSS.escape(String(id))}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {}
  };

  // when the query changes, land on the NEWEST match (WhatsApp behaviour)
  useEffect(() => {
    if (!open || !q || !total) return;
    const last = total - 1;
    setPos(last);
    scrollMid(msgs[matchIdxs[last]].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, total, open]);

  const goto = (delta) => {
    if (!total) return;
    const nxt = (pos + delta + total) % total;
    setPos(nxt);
    scrollMid(msgs[matchIdxs[nxt]].id);
  };

  const jumpToDate = (dateStr) => {
    if (!dateStr) return;
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const idx = (msgs || []).findIndex(m => {
      const t = new Date(m.created_at).getTime();
      return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
    });
    if (idx < 0) { toast(`No messages on ${start.toLocaleDateString()} 📅`, { icon: '🗓' }); return; }
    setOpen(true);
    setQuery('');
    setPos(0);
    const id = msgs[idx].id;
    setFlash('');
    setTimeout(() => { scrollMid(id); setFlash(String(id)); }, 60);
    setTimeout(() => setFlash(''), 2600);
  };

  const close = () => { setOpen(false); setQuery(''); setPos(0); setFlash(''); };
  const toggle = () => (open ? close() : setOpen(true));

  return { open, query, setQuery, pos, total, activeId, flash: String(flash || ''), goto, jumpToDate, close, toggle };
}

export default function ChatSearchBar({ cs, dark = false }) {
  if (!cs.open) return null;
  return (
    <div className={`flex items-center gap-1 px-3 py-2 border-b ${dark ? 'border-gray-800 bg-gray-900/95' : 'border-gray-100 bg-yellow-50/70'}`}>
      <HiSearch className="w-4 h-4 text-gray-400 shrink-0" />
      <input
        autoFocus
        value={cs.query}
        onChange={e => cs.setQuery(e.target.value)}
        placeholder="Search in this chat…"
        maxLength={60}
        className={`flex-1 min-w-0 bg-transparent text-sm focus:outline-none ${dark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
      />
      {cs.query.trim() && (
        <span className={`text-[10px] font-bold shrink-0 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {cs.total ? `${Math.min(cs.pos, cs.total - 1) + 1} of ${cs.total}` : '0 found'}
        </span>
      )}
      <button type="button" onClick={() => cs.goto(-1)} disabled={!cs.total} aria-label="Previous match"
        className={`p-1 rounded-full disabled:opacity-30 ${dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-yellow-100'}`}>
        <HiChevronUp className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => cs.goto(1)} disabled={!cs.total} aria-label="Next match"
        className={`p-1 rounded-full disabled:opacity-30 ${dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-yellow-100'}`}>
        <HiChevronDown className="w-4 h-4" />
      </button>
      <label title="Jump to a date 📅" className={`relative p-1 rounded-full cursor-pointer ${dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-yellow-100'}`}>
        <HiCalendar className="w-4 h-4" />
        <input type="date" aria-label="Jump to date" onChange={e => cs.jumpToDate(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
      <button type="button" onClick={cs.close} aria-label="Close search"
        className={`p-1 rounded-full ${dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-yellow-100'}`}>
        <HiX className="w-4 h-4" />
      </button>
    </div>
  );
}
