'use client';

import { HiCalendar, HiUser, HiPhotograph, HiVideoCamera } from 'react-icons/hi';

export default function AnnouncementCard({ announcement }) {
  if (!announcement) return null;

  const hasMedia = announcement.media && announcement.media.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-primary-700 font-semibold text-sm">
            {announcement.author?.charAt(0) || 'A'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900">{announcement.title}</h4>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1">
              <HiUser className="w-3.5 h-3.5" />
              {announcement.author}
            </span>
            <span className="flex items-center gap-1">
              <HiCalendar className="w-3.5 h-3.5" />
              {announcement.date}
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{announcement.content}</p>

      {hasMedia && (
        <div className="mt-3 flex flex-wrap gap-2">
          {announcement.media.map((item, index) => (
            <span key={index} className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-lg">
              {item.type === 'image' ? (
                <><HiPhotograph className="w-3.5 h-3.5" /> Image {index + 1}</>
              ) : (
                <><HiVideoCamera className="w-3.5 h-3.5" /> Video {index + 1}</>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
