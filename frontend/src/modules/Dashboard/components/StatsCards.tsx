interface StatsCardsProps {
  stats: {
    total: number;
    verified: number;
    pending: number;
    failed: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  // Safety checks to prevent NaN
  const safeTotal = Number(stats?.total) || 0;
  const safeVerified = Number(stats?.verified) || 0;
  const safePending = Number(stats?.pending) || 0;
  const safeFailed = Number(stats?.failed) || 0;

  const verifiedPercent =
    safeTotal > 0 ? Math.round((safeVerified / safeTotal) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Total Members */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              Total Members
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {safeTotal.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">👥</span>
          </div>
        </div>
      </div>

      {/* Verified */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              Verified
            </div>
            <div className="text-3xl font-bold text-green-600">
              {safeVerified.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
        </div>
        <div className="mt-2 text-sm text-slate-500">
          {verifiedPercent}% of total
        </div>
      </div>

      {/* Pending Check */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              Pending Check
            </div>
            <div className="text-3xl font-bold text-yellow-600">
              {safePending.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">⏳</span>
          </div>
        </div>
      </div>

      {/* Failed Checks */}
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              Failed Checks
            </div>
            <div className="text-3xl font-bold text-red-600">
              {safeFailed.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">✗</span>
          </div>
        </div>
      </div>
    </div>
  );
}
