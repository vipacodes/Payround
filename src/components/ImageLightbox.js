'use client';

// Fullscreen photo viewer — tap any profile photo to expand it, tap backdrop or ✕ to close.
export default function ImageLightbox({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Expanded photo"
    >
      <img
        src={src}
        alt={alt || 'photo'}
        className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl leading-none flex items-center justify-center"
      >
        ×
      </button>
    </div>
  );
}
