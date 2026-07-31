'use client';

export default function DashboardCard({ icon, label, value, subtext, color = 'primary', onClick }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600 border-primary-100',
    gold: 'bg-gold-50 text-gold-600 border-gold-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 p-5 card-hover"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl border ${colorMap[color] || colorMap.primary}`}>
          {icon}
        </div>
        {subtext && (
          <span className="text-xs font-medium text-gray-400">{subtext}</span>
        )}
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-0.5">{value}</h3>
      <p className="text-sm text-gray-500">{label}</p>
    </button>
  );
}
