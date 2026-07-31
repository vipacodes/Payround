'use client';

export default function ProgressBar({ value, max, label, showPercent = true, size = 'md', color = 'primary' }) {
  const percent = Math.min(Math.round((value / max) * 100), 100);

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  };

  const colorClasses = {
    primary: 'bg-primary-500',
    gold: 'bg-gold-500',
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-gray-600">{label}</span>
          {showPercent && (
            <span className="text-sm font-medium text-gray-900">{percent}%</span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} ${colorClasses[color] || colorClasses.primary} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {!label && showPercent && (
        <p className="text-xs text-gray-500 mt-1">{value} / {max}</p>
      )}
    </div>
  );
}
