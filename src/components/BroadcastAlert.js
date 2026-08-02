'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { HiSpeakerphone, HiX } from 'react-icons/hi';

// Shows the general announcement published from the PayRound admin.
// Pops up at the top of the screen for ~10 seconds every page load,
// until the announcement is cleared by PayRound.
export default function BroadcastAlert() {
  const [announcement, setAnnouncement] = useState(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('owner_settings')
          .select('announcement_text, announcement_media_url, announcement_updated_at')
          .eq('id', 1)
          .single();
        if (error || !data) return;
        if (!mounted) return;
        if (data.announcement_text || data.announcement_media_url) {
          setAnnouncement(data);
          setVisible(true);
        }
      } catch (e) {
        // stay silent if settings are not reachable
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Auto-hide after ~10 seconds with a small countdown bar
  useEffect(() => {
    if (!visible) return;
    const DURATION = 10000;
    const started = Date.now();
    const tick = setInterval(() => {
      const pct = 100 - ((Date.now() - started) / DURATION) * 100;
      setProgress(Math.max(0, pct));
    }, 100);
    const hide = setTimeout(() => setVisible(false), DURATION);
    return () => { clearInterval(tick); clearTimeout(hide); };
  }, [visible]);

  if (!visible || !announcement) return null;

  const media = announcement.announcement_media_url;
  const isVideo = media && /\.(mp4|webm|mov|m4v|ogg)$/i.test(media.split('?')[0]);

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-1.5rem)] max-w-md animate-slide-down">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-primary-500 overflow-hidden">
        <div className="bg-primary-600 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <HiSpeakerphone className="w-5 h-5" />
            <span className="text-sm font-bold">Announcement from PayRound</span>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-white/90 hover:text-white p-1"
            aria-label="Close announcement"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {announcement.announcement_text && (
            <p className="text-sm text-gray-800 whitespace-pre-line">{announcement.announcement_text}</p>
          )}
          {media && (
            <div className="mt-3 rounded-xl overflow-hidden bg-gray-50 border">
              {isVideo ? (
                <video src={media} controls autoPlay muted playsInline className="w-full max-h-64 object-contain" />
              ) : (
                <img src={media} alt="Announcement" className="w-full max-h-64 object-contain" />
              )}
            </div>
          )}
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-primary-500 transition-all duration-100" style={{ width: `${progress}%` }}></div>
        </div>
      </div>
    </div>
  );
}
