'use client';

import { useState } from 'react';
import { HiShare, HiX, HiDuplicate } from 'react-icons/hi';
import toast from 'react-hot-toast';

const SITE = 'https://payround-omega.vercel.app';

export function siteUrl(path = '/') {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
  } catch {}
  return `${SITE}${path}`;
}

export function payroundInviteUrl() {
  let ref = '';
  try {
    const u = JSON.parse(localStorage.getItem('payround_user') || '{}');
    ref = String(u.id || '').slice(0, 8);
  } catch {}
  return ref ? siteUrl(`/signup?ref=${ref}`) : siteUrl('/signup');
}

function enc(s) {
  return encodeURIComponent(s || '');
}

export default function ShareButton({
  url,
  title = 'PayRound',
  text = 'Join me on PayRound — save together with people you can see.',
  label = 'Share',
  compact = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const link = url || siteUrl('/');
  const fullText = `${text}\n${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — long-press the link instead.');
    }
  };

  const nativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: link });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    setOpen(true);
  };

  const go = (href) => {
    try { window.open(href, '_blank', 'noopener,noreferrer'); } catch { window.location.href = href; }
    setOpen(false);
  };

  const apps = [
    { id: 'copy', label: 'Copy link', icon: '📋', onClick: () => { copy(); setOpen(false); } },
    { id: 'wa', label: 'WhatsApp', icon: '💬', onClick: () => go(`https://wa.me/?text=${enc(fullText)}`) },
    { id: 'wab', label: 'WhatsApp Business', icon: '💼', onClick: () => go(`https://api.whatsapp.com/send?text=${enc(fullText)}`) },
    { id: 'fb', label: 'Facebook', icon: '📘', onClick: () => go(`https://www.facebook.com/sharer/sharer.php?u=${enc(link)}`) },
    { id: 'x', label: 'X / Twitter', icon: '🐦', onClick: () => go(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(link)}`) },
    { id: 'tg', label: 'Telegram', icon: '✈️', onClick: () => go(`https://t.me/share/url?url=${enc(link)}&text=${enc(text)}`) },
    { id: 'sms', label: 'SMS / Messages', icon: '📱', onClick: () => go(`sms:?body=${enc(fullText)}`) },
    { id: 'more', label: 'More apps', icon: '⋯', onClick: nativeShare },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || (compact
          ? 'inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-full hover:bg-primary-100'
          : 'inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-primary-600 px-4 py-2.5 rounded-full hover:bg-primary-700 shadow-md shadow-primary-200')}
        title={label}
      >
        <HiShare className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Share">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-t-3xl sm:rounded-3xl w-full sm:w-[420px] max-h-[88vh] overflow-y-auto shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Share</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{title}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close">
                <HiX className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-[11px] text-gray-500 break-all">{link}</p>
              <button type="button" onClick={copy} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary-700">
                <HiDuplicate className="w-3.5 h-3.5" /> Copy this link
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {apps.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={a.onClick}
                  className="flex items-center gap-2 text-left px-3 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-800"
                >
                  <span className="text-lg">{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
