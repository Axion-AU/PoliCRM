import { useState, useEffect } from "react";
import { eraApi } from "../services/api";
import { 
  Home, 
  Users, 
  Trophy, 
  TrendingUp, 
  ChevronDown,
  ChevronUp,
  Star,
  MapPin,
  ChevronRight,
  Filter
} from "lucide-react";
import { Link } from "react-router-dom";

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

interface VolunteerCandidate {
  member_id: number;
  member_name: string;
  email: string;
  phone: string;
  household_address: string;
  household_conversion_rate: number;
  household_size: number;
  members_converted: number;
  federal_division: string;
}

function HouseholdCard({ household, rank }: { household: TopHousehold; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  
  const getRankStyle = () => {
    if (rank === 1) return "bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/30";
    if (rank === 2) return "bg-slate-400/20 text-slate-400";
    if (rank === 3) return "bg-orange-600/20 text-orange-500";
    return "bg-secondary text-muted-foreground";
  };

  const getConversionColor = () => {
    if (household.conversion_rate >= 100) return "text-green-400";
    if (household.conversion_rate >= 50) return "text-blue-400";
    return "text-amber-400";
  };

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-4 flex items-start gap-4 hover:bg-secondary/30 transition-colors text-left"
      >
        {/* Rank Badge */}
        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getRankStyle()}`}>
          {rank}
        </span>
        
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{household.address}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{household.locality}, {household.postcode}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">{household.federal_division}</span>
          </div>
        </div>
        
        {/* Stats */}
        <div className="text-right shrink-0">
          <div className={`text-xl font-bold ${getConversionColor()}`}>
            {household.conversion_rate}%
          </div>
          <div className="flex items-center justify-end gap-1.5 text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{household.member_count}/{household.total_electors}</span>
          </div>
        </div>

        {/* Expand Icon */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded Content - Member List */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-secondary/20">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Members at this address ({household.member_names.length})
          </div>
          <div className="space-y-1.5">
            {household.member_names.map((name, idx) => (
              <Link
                key={idx}
                to={`/members?search=${encodeURIComponent(name)}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-background hover:bg-secondary transition-colors group"
              >
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-medium">
                  {name.charAt(0)}
                </div>
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  {name}
                </span>
                <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HouseholdAnalytics() {
  const [stats, setStats] = useState<HouseholdStats | null>(null);
  const [topHouseholds, setTopHouseholds] = useState<TopHousehold[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"households" | "volunteers">("households");
  const [minElectors, setMinElectors] = useState(2);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, topData, volunteerData] = await Promise.all([
          eraApi.getHouseholdStats(),
          eraApi.getTopHouseholds(50, minElectors),
          eraApi.getVolunteerCandidates(50, 50),
        ]);
        setStats(statsData);
        setTopHouseholds(topData);
        setVolunteers(volunteerData);
      } catch (error) {
        console.error("Failed to fetch household data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [minElectors]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-foreground mb-4">Household Analytics</h1>
        <div className="card p-12 text-center">
          <Home className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No Data Available</h2>
          <p className="text-muted-foreground">
            Upload ERA files to enable household conversion tracking.
          </p>
        </div>
      </div>
    );
  }

  const tierTotal = Object.values(stats.tier_breakdown).reduce((a, b) => a + b, 0);

  // Filter to only show meaningful conversions (2+ electors)
  const meaningfulHouseholds = topHouseholds.filter(h => h.total_electors >= minElectors);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Household Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Campaign intelligence from household conversion patterns
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Households</div>
              <div className="text-xl font-bold text-foreground">
                {stats.total_households_with_members.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Electors Reached</div>
              <div className="text-xl font-bold text-foreground">
                {stats.total_electors_in_member_households.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 text-green-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg Conversion</div>
              <div className="text-xl font-bold text-foreground">
                {stats.average_conversion_rate}%
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Full Conversions</div>
              <div className="text-xl font-bold text-foreground">
                {stats.tier_breakdown["100%"] || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Breakdown */}
      <div className="card p-4 mb-6">
        <h2 className="font-semibold text-foreground mb-3 text-sm">Conversion Tier Distribution</h2>
        <div className="flex gap-2 mb-2">
          {[
            { key: "100%", color: "bg-green-500", label: "Full" },
            { key: "50-99%", color: "bg-blue-500", label: "Majority" },
            { key: "1-49%", color: "bg-amber-500", label: "Partial" },
          ].map((tier) => (
            <div
              key={tier.key}
              className="flex-1 h-6 rounded-lg overflow-hidden bg-secondary"
            >
              <div
                className={`${tier.color} h-full transition-all duration-500`}
                style={{
                  width: `${tierTotal > 0 ? ((stats.tier_breakdown[tier.key] || 0) / tierTotal) * 100 : 0}%`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-green-500" />
            <span>100%: {stats.tier_breakdown["100%"] || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-blue-500" />
            <span>50-99%: {stats.tier_breakdown["50-99%"] || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-amber-500" />
            <span>1-49%: {stats.tier_breakdown["1-49%"] || 0}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("households")}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === "households"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trophy className="w-4 h-4 inline mr-2" />
            Top Households ({meaningfulHouseholds.length})
          </button>
          <button
            onClick={() => setActiveTab("volunteers")}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === "volunteers"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Star className="w-4 h-4 inline mr-2" />
            Advocates ({volunteers.length})
          </button>
        </div>

        {activeTab === "households" && (
          <div className="flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Min household size:</span>
            <select
              value={minElectors}
              onChange={(e) => setMinElectors(Number(e.target.value))}
              className="bg-secondary border border-border rounded-md px-2 py-1 text-sm text-foreground"
            >
              <option value={2}>2+ electors</option>
              <option value={3}>3+ electors</option>
              <option value={4}>4+ electors</option>
              <option value={5}>5+ electors</option>
            </select>
          </div>
        )}
      </div>

      {/* Households Grid */}
      {activeTab === "households" && (
        <div className="space-y-3">
          {meaningfulHouseholds.length === 0 ? (
            <div className="card p-12 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Households Found</h3>
              <p className="text-muted-foreground">
                No households match the current filter criteria.
              </p>
            </div>
          ) : (
            meaningfulHouseholds.map((h, idx) => (
              <HouseholdCard key={idx} household={h} rank={idx + 1} />
            ))
          )}
        </div>
      )}

      {/* Volunteers List */}
      {activeTab === "volunteers" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Volunteer Candidates</h3>
            <p className="text-sm text-muted-foreground">
              Members from high-converting households (50%+) - natural advocates for recruiting
            </p>
          </div>
          {volunteers.length === 0 ? (
            <div className="p-12 text-center">
              <Star className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Advocates Found</h3>
              <p className="text-muted-foreground">
                No members from high-converting households yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {volunteers.map((v) => (
                <Link
                  key={v.member_id}
                  to={`/members?search=${encodeURIComponent(v.member_name)}`}
                  className="px-5 py-4 flex items-center gap-4 hover:bg-secondary/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500/15 text-green-400 flex items-center justify-center">
                    <Star className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {v.member_name}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {v.household_address}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-muted-foreground">
                      {v.members_converted}/{v.household_size} converted
                    </div>
                    <div className="text-lg font-bold text-green-400">
                      {v.household_conversion_rate}%
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
