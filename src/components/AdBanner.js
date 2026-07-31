'use client';

import { HiExternalLink, HiPhone } from 'react-icons/hi';

export default function AdBanner({ ad, variant = 'card' }) {
  if (!ad || !ad.active) return null;

  if (variant === 'banner') {
    return (
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg mb-1">{ad.businessName}</h3>
            <p className="text-sm text-primary-100">{ad.description}</p>
          </div>
          <div className="flex items-center gap-3">
            {ad.website && (
              <a href={ad.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-white/20 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/30 transition-all">
                <HiExternalLink className="w-4 h-4" />
                Visit
              </a>
            )}
            <a href={`tel:${ad.contact}`} className="flex items-center gap-1.5 bg-white/20 px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/30 transition-all">
              <HiPhone className="w-4 h-4" />
              Call
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 card-hover">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-gold-100 to-gold-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-gold-700 font-bold text-xl">{ad.businessName.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 mb-1">{ad.businessName}</h3>
          <p className="text-sm text-gray-600 mb-3">{ad.description}</p>
          <div className="flex items-center gap-3">
            {ad.website && (
              <a href={ad.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary-600 font-medium hover:text-primary-700">
                <HiExternalLink className="w-3.5 h-3.5" />
                Visit Website
              </a>
            )}
            <a href={`tel:${ad.contact}`} className="flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-gray-700">
              <HiPhone className="w-3.5 h-3.5" />
              {ad.contact}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
