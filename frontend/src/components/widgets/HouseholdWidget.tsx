import { useState, useEffect } from "react";
import { eraApi } from "../../services/api";
import { Home, Users, Trophy, TrendingUp } from "lucide-react";

interface HouseholdStats {
  total_households_with_members: number;
  total_electors_in_member_households: number;
  total_members_matched: number;
  average_conversion_rate: number;
  tier_breakdown: Record<string, number>;
}

interface TopHousehold {
  address: string;
  locality: string;
  postcode: string;
  federal_division: string;
  total_electors: number;
  member_count: number;
  conversion_rate: number;
  member_names: string[];
}

export function HouseholdWidget() {
  const [stats, setStats] = useState<HouseholdStats | null>(null);
  const [topHouseholds, setTopHouseholds] = useState<TopHousehold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, topData] = await Promise.all([
          eraApi.getHouseholdStats(),
          eraApi.getTopHouseholds(5),
        ]);
        setStats(statsData);
        setTopHouseholds(topData);
      } catch (error) {
        console.error("Failed to fetch household data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-500/15 rounded-lg text-purple-400">
            <Home className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-foreground">Household Intelligence</h2>
        </div>
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-500/15 rounded-lg text-purple-400">
            <Home className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-foreground">Household Intelligence</h2>
        </div>
        <div className="text-center text-muted-foreground py-8">
          No household data available. Upload ERA files to enable.
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/15 rounded-lg text-purple-400">
            <Home className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-foreground">Household Intelligence</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400 font-medium">{stats.average_conversion_rate}%</span>
            <span className="text-muted-foreground">avg</span>
          </div>
          <a
            href="/household-analytics"
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            View All →
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">
            {stats.total_households_with_members.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Households</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">
            {stats.total_members_matched.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Members Matched</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-green-400">
            {stats.tier_breakdown["100%"]}
          </div>
          <div className="text-xs text-muted-foreground">Full Conversions</div>
        </div>
      </div>

      {/* Tier Breakdown */}
      <div className="px-6 py-3 border-b border-border">
        <div className="flex gap-2">
          <div className="flex-1 bg-green-500/20 rounded-full h-2">
            <div
              className="bg-green-500 h-full rounded-full"
              style={{
                width: `${
                  stats.total_households_with_members > 0
                    ? (stats.tier_breakdown["100%"] / stats.total_households_with_members) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <div className="flex-1 bg-blue-500/20 rounded-full h-2">
            <div
              className="bg-blue-500 h-full rounded-full"
              style={{
                width: `${
                  stats.total_households_with_members > 0
                    ? (stats.tier_breakdown["50-99%"] / stats.total_households_with_members) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <div className="flex-1 bg-amber-500/20 rounded-full h-2">
            <div
              className="bg-amber-500 h-full rounded-full"
              style={{
                width: `${
                  stats.total_households_with_members > 0
                    ? (stats.tier_breakdown["1-49%"] / stats.total_households_with_members) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>100%: {stats.tier_breakdown["100%"]}</span>
          <span>50-99%: {stats.tier_breakdown["50-99%"]}</span>
          <span>1-49%: {stats.tier_breakdown["1-49%"]}</span>
        </div>
      </div>

      {/* Top Converting Households */}
      <div className="px-6 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Top Converting Households
          </span>
        </div>
        <div className="space-y-2">
          {topHouseholds.slice(0, 5).map((h, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0
                      ? "bg-amber-500/20 text-amber-400"
                      : idx === 1
                        ? "bg-slate-400/20 text-slate-400"
                        : idx === 2
                          ? "bg-orange-600/20 text-orange-500"
                          : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="truncate text-foreground">
                  {h.address.substring(0, 30)}...
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {h.member_count}/{h.total_electors}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    h.conversion_rate >= 100
                      ? "text-green-400"
                      : h.conversion_rate >= 50
                        ? "text-blue-400"
                        : "text-amber-400"
                  }`}
                >
                  {h.conversion_rate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
