import { useState, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft,
  Map as MapIcon,
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  Target,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { Link } from "react-router-dom";

interface ElectorateCounts {
  [key: string]: number;
}

interface GrowthData {
  [key: string]: number;
}

interface GeographicData {
  by_state: { [key: string]: number };
  by_division: { [key: string]: number };
}

export function WarRoomPage() {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [counts, setCounts] = useState<{
    verified: ElectorateCounts;
    projected: ElectorateCounts;
    metadata?: { verified_max: number; projected_max: number };
  }>({ verified: {}, projected: {} });
  const [growthData, setGrowthData] = useState<GrowthData>({});
  const [geoData, setGeoData] = useState<GeographicData>({
    by_state: {},
    by_division: {},
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<
    "verified" | "projected" | "combined"
  >("combined");
  const [activeView, setActiveView] = useState<"map" | "dashboard">("map");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch GeoJSON
        const geoRes = await fetch("/static/geojson/AUS_ELB_region.json");
        const geoData = await geoRes.json();
        setGeoJsonData(geoData);

        // Fetch Counts
        const countsRes = await fetch("/analytics/electorate-counts");
        const countsData = await countsRes.json();
        setCounts(countsData);

        // Fetch Growth Data
        const growthRes = await fetch("/analytics/growth");
        const growthData = await growthRes.json();
        setGrowthData(growthData);

        // Fetch Geographic Data
        const geoRes2 = await fetch("/analytics/geographic");
        const geoData2 = await geoRes2.json();
        setGeoData(geoData2);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getColor = (count: number, mode: "verified" | "projected") => {
    // Dynamic thresholds based on actual data max
    const maxCount =
      mode === "verified"
        ? counts.metadata?.verified_max || 100
        : counts.metadata?.projected_max || 100;

    // Percentage-based thresholds
    const t100 = maxCount; // 100% (darkest)
    const t60 = maxCount * 0.6; // 60%
    const t35 = maxCount * 0.35; // 35%
    const t20 = maxCount * 0.2; // 20%
    const t10 = maxCount * 0.1; // 10%

    if (mode === "verified") {
      // Green Scale - Dynamic thresholds
      return count >= t100
        ? "#006d2c"
        : count >= t60
          ? "#31a354"
          : count >= t35
            ? "#74c476"
            : count >= t20
              ? "#a1d99b"
              : count >= t10
                ? "#c7e9c0"
                : count > 0
                  ? "#f7fcb9"
                  : "#f7f7f7"; // Greyish for 0
    } else {
      // Yellow/Orange Scale for Projected - Dynamic thresholds
      return count >= t100
        ? "#800026"
        : count >= t60
          ? "#BD0026"
          : count >= t35
            ? "#E31A1C"
            : count >= t20
              ? "#FC4E2A"
              : count >= t10
                ? "#FD8D3C"
                : count > 0
                  ? "#FED976"
                  : "#f7f7f7";
    }
  };

  const style = (feature: any) => {
    const name =
      feature.properties.electorateName ||
      feature.properties.elect_div ||
      feature.properties.Name ||
      feature.properties.NAME;
    const verifiedCount = counts.verified[name] || 0;
    const projectedCount = counts.projected[name] || 0;

    let fillColor = "#f7f7f7";
    let fillOpacity = 0.7;

    if (viewMode === "verified") {
      fillColor = getColor(verifiedCount, "verified");
    } else if (viewMode === "projected") {
      fillColor = getColor(projectedCount, "projected");
    } else {
      // Combined View
      if (verifiedCount > 0) {
        fillColor = getColor(verifiedCount, "verified");
      } else if (projectedCount > 0) {
        fillColor = getColor(projectedCount, "projected");
      }
    }

    return {
      fillColor,
      weight: 1,
      opacity: 1,
      color: "#444",
      dashArray: "3",
      fillOpacity,
    };
  };

  const onEachFeature = (feature: any, layer: any) => {
    const name =
      feature.properties.electorateName ||
      feature.properties.elect_div ||
      feature.properties.Name ||
      feature.properties.NAME;
    const verifiedCount = counts.verified[name] || 0;
    const projectedCount = counts.projected[name] || 0;

    layer.bindTooltip(
      `
            <div style="background: rgba(15, 23, 42, 0.95); padding: 12px; border-radius: 8px; border: 1px solid #475569;">
                <div style="font-size: 16px; font-weight: bold; color: #f1f5f9; margin-bottom: 8px;">${name}</div>
                <div style="color: #4ade80; margin-bottom: 4px;">✓ Verified: ${verifiedCount}</div>
                <div style="color: #fbbf24; margin-bottom: 4px;">○ Projected: ${projectedCount}</div>
                <div style="color: #94a3b8; font-size: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #475569;">
                    Total: ${verifiedCount + projectedCount}
                </div>
            </div>
        `,
      {
        sticky: true,
        className: "custom-tooltip",
      },
    );

    layer.on({
      mouseover: (e: any) => {
        const layer = e.target;
        layer.setStyle({
          weight: 3,
          color: "#fff",
          dashArray: "",
          fillOpacity: 0.9,
        });
        layer.bringToFront();
      },
      mouseout: (e: any) => {
        const layer = e.target;
        layer.setStyle({
          weight: 1,
          color: "#444",
          dashArray: "3",
          fillOpacity: 0.7,
        });
      },
    });
  };

  // Calculate summary statistics
  const totalVerified = Object.values(counts.verified).reduce(
    (a, b) => a + b,
    0,
  );
  const totalProjected = Object.values(counts.projected).reduce(
    (a, b) => a + b,
    0,
  );
  const totalMembers = totalVerified + totalProjected;
  const verificationRate =
    totalMembers > 0
      ? ((totalVerified / totalMembers) * 100).toFixed(1)
      : "0.0";

  // Format growth data for chart
  const growthChartData = Object.entries(growthData)
    .map(([month, count]) => ({
      month,
      members: count,
    }))
    .slice(-12); // Last 12 months

  // Format state data for chart
  const stateChartData = Object.entries(geoData.by_state)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  // Top 10 electorates
  const topElectorates = Object.entries(counts.verified)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="text-slate-400 hover:text-white"
          >
            <Link to="/dashboard">
              <ArrowLeft className="w-6 h-6" />
            </Link>
          </Button>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            War Room
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveView("map")}
              className={`px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeView === "map" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <MapIcon className="w-4 h-4" />
              Map
            </button>
            <button
              onClick={() => setActiveView("dashboard")}
              className={`px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeView === "dashboard" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
          </div>

          {/* Data Mode Toggle (for Map view) */}
          {activeView === "map" && (
            <div className="flex items-center gap-2 bg-slate-850 p-1.5 rounded-lg border border-slate-850/50">
              <button
                onClick={() => setViewMode("verified")}
                className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${viewMode === "verified" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
              >
                Verified
              </button>
              <button
                onClick={() => setViewMode("projected")}
                className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${viewMode === "projected" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`}
              >
                Projected
              </button>
              <button
                onClick={() => setViewMode("combined")}
                className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${viewMode === "combined" ? "bg-primary text-white" : "text-slate-400 hover:text-white"}`}
              >
                Combined
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
          </div>
        ) : activeView === "map" ? (
          <div className="h-full relative">
            {/* Legend */}
            <div className="absolute top-4 right-4 z-[1000] bg-slate-800/95 backdrop-blur-sm p-4 rounded-lg border border-slate-700 shadow-xl">
              <div className="text-sm font-semibold mb-3 text-slate-300">
                Legend
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#006d2c]"></span>
                  <span className="text-xs text-slate-400">
                    Verified (High)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#74c476]"></span>
                  <span className="text-xs text-slate-400">Verified (Med)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#c7e9c0]"></span>
                  <span className="text-xs text-slate-400">Verified (Low)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#800026]"></span>
                  <span className="text-xs text-slate-400">
                    Projected (High)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#FD8D3C]"></span>
                  <span className="text-xs text-slate-400">
                    Projected (Med)
                  </span>
                </div>
              </div>
            </div>

            <MapContainer
              center={[-28.2744, 133.7751]}
              zoom={4}
              style={{ height: "100%", width: "100%", background: "#0f172a" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {geoJsonData && (
                <GeoJSON
                  key={viewMode}
                  data={geoJsonData}
                  style={style}
                  onEachFeature={onEachFeature}
                />
              )}
            </MapContainer>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/80 rounded-lg p-6 border border-slate-750">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-400 text-sm font-semibold">Total Members</div>
                  <Users className="w-5 h-5 text-slate-400" />
                </div>
                <div className="text-3xl font-extrabold text-white">
                  {totalMembers.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-800/80 rounded-lg p-6 border border-slate-750">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-400 text-sm font-semibold">Verified</div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-450" />
                </div>
                <div className="text-3xl font-extrabold text-emerald-400">
                  {totalVerified.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-800/80 rounded-lg p-6 border border-slate-750">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-400 text-sm font-semibold">Projected</div>
                  <Target className="w-5 h-5 text-amber-455" />
                </div>
                <div className="text-3xl font-extrabold text-amber-400">
                  {totalProjected.toLocaleString()}
                </div>
              </div>
              <div className="bg-slate-800/80 rounded-lg p-6 border border-slate-750">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-400 text-sm font-semibold">
                    Verification Rate
                  </div>
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-extrabold text-primary">
                  {verificationRate}%
                </div>
              </div>
            </div>

            {/* Growth Chart */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-200">
                Member Growth
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={growthChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis stroke="#94a3b8" style={{ fontSize: "12px" }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #475569",
                      borderRadius: "6px",
                    }}
                    labelStyle={{ color: "#f1f5f9" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="members"
                    stroke="#3553eb"
                    strokeWidth={2}
                    dot={{ fill: "#3553eb" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* State Distribution */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 className="text-xl font-semibold mb-4 text-slate-200">
                  Distribution by State
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stateChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="state"
                      stroke="#94a3b8"
                      style={{ fontSize: "12px" }}
                    />
                    <YAxis stroke="#94a3b8" style={{ fontSize: "12px" }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: "6px",
                      }}
                      labelStyle={{ color: "#f1f5f9" }}
                    />
                    <Bar dataKey="count" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Electorates */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 className="text-xl font-semibold mb-4 text-slate-200">
                  Top 10 Electorates
                </h2>
                <div className="space-y-3">
                  {topElectorates.map(([name, count], index) => (
                    <div
                      key={name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-slate-500 font-mono text-sm w-6">
                          #{index + 1}
                        </div>
                        <div className="text-slate-200">{name}</div>
                      </div>
                      <div className="text-green-400 font-semibold">
                        {count}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
