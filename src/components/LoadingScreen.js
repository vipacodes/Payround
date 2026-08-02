'use client';

// Branded loading animation — shown while the app (or a page) is loading.
// Looks great when launched as an installed phone app.
export default function LoadingScreen({ label = 'Loading…' }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5 px-4">
      <div className="relative">
        <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center shadow-xl shadow-primary-200 animate-bounce">
          <span className="text-white font-bold text-3xl">P</span>
        </div>
        <div className="absolute inset-0 w-16 h-16 rounded-2xl border-4 border-primary-300 animate-ping opacity-40"></div>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-2.5 h-2.5 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}></span>
        ))}
      </div>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
    </div>
  );
}
