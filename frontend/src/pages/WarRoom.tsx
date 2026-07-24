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
} from "recharts";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, BarChart3, Users, TrendingUp, Target } from "lucide-react";
import { analyticsApi } from "../services/api";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ElectorateCounts { [key: string]: number; }

interface GeoJsonFeature {
  properties: {
    electorateName?: string;
    elect_div?: string;
    Name?: string;
    NAME?: string;
  };
}

interface LeafletLayer {
  bindTooltip: (content: string, options?: { sticky?: boolean }) => void;
  on: (eventHandlers: {
    mouseover: (e: LeafletEvent) => void;
    mouseout: (e: LeafletEvent) => void;
  }) => void;
}

interface LeafletEvent {
  target: {
    setStyle: (style: {
      weight: number;
      color: string;
      dashArray: string;
      fillOpacity: number;
    }) => void;
    bringToFront: () => void;
  };
}

/* ─── Colours ────────────────────────────────────────────────────────────── */
function getColor(count: number, mode: "verified" | "projected", max: number): string {
  const t = (pct: number) => max * pct;
  if (mode === "verified") {
    return count >= t(1)   ? "#006d2c"
         : count >= t(0.6) ? "#31a354"
         : count >= t(0.35)? "#74c476"
         : count >= t(0.2) ? "#a1d99b"
         : count >= t(0.1) ? "#c7e9c0"
         : count > 0       ? "#f7fcb9"
         :                   "#e8eaed";
  }
  return count >= t(1)   ? "#800026"
       : count >= t(0.6) ? "#BD0026"
       : count >= t(0.35)? "#E31A1C"
       : count >= t(0.2) ? "#FC4E2A"
       : count >= t(0.1) ? "#FD8D3C"
       : count > 0       ? "#FED976"
       :                   "#e8eaed";
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function WarRoom() {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [counts, setCounts] = useState<{
    verified: ElectorateCounts;
    projected: ElectorateCounts;
    metadata?: { verified_max: number; projected_max: number };
  }>({ verified: {}, projected: {} });
  const [growthData, setGrowthData] = useState<Record<string, number>>({});
  const [geoData, setGeoData] = useState<{
    by_state: Record<string, number>;
    by_division: Record<string, number>;
  }>({ by_state: {}, by_division: {} });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"verified" | "projected" | "combined">("combined");
  const [activeView, setActiveView] = useState<"map" | "analytics">("map");

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [geoJson, electorates, growth, geo] = await Promise.allSettled([
          fetch("/static/geojson/AUS_ELB_region.json").then((r) => r.json()),
          analyticsApi.electorateCounts(),
          analyticsApi.growth(),
          analyticsApi.geographic(),
        ]);

        if (geoJson.status === "fulfilled")      setGeoJsonData(geoJson.value);
        else console.error("GeoJSON fetch failed:", geoJson.reason);
        if (electorates.status === "fulfilled")  setCounts(electorates.value);
        else console.error("analyticsApi.electorateCounts failed:", electorates.reason);
        if (growth.status === "fulfilled")       setGrowthData(growth.value);
        else console.error("analyticsApi.growth failed:", growth.reason);
        if (geo.status === "fulfilled")          setGeoData(geo.value);
        else console.error("analyticsApi.geographic failed:", geo.reason);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const style = (feature?: GeoJsonFeature) => {
    if (!feature?.properties) {
      return { fillColor: "#e8eaed", weight: 1, opacity: 1, color: "#334155", dashArray: "3", fillOpacity: 0.75 };
    }
    const name =
      feature.properties.electorateName ||
      feature.properties.elect_div ||
      feature.properties.Name ||
      feature.properties.NAME ||
      "";
    const vCount = counts.verified[name] || 0;
    const pCount = counts.projected[name] || 0;
    const vMax = counts.metadata?.verified_max || 100;
    const pMax = counts.metadata?.projected_max || 100;

    let fillColor = "#e8eaed";
    if (viewMode === "verified")  fillColor = getColor(vCount, "verified",  vMax);
    else if (viewMode === "projected") fillColor = getColor(pCount, "projected", pMax);
    else fillColor = vCount > 0 ? getColor(vCount, "verified", vMax) : getColor(pCount, "projected", pMax);

    return { fillColor, weight: 1, opacity: 1, color: "#334155", dashArray: "3", fillOpacity: 0.75 };
  };

  const onEachFeature = (feature: GeoJsonFeature, layer: LeafletLayer) => {
    if (!feature?.properties) return;
    const name =
      feature.properties.electorateName ||
      feature.properties.elect_div ||
      feature.properties.Name ||
      feature.properties.NAME ||
      "";
    const v = counts.verified[name] || 0;
    const p = counts.projected[name] || 0;

    const escapedName = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    layer.bindTooltip(
      `<div style="background:rgba(15,23,42,0.96);padding:12px;border-radius:8px;border:1px solid #334155;font-family:Inter,sans-serif">
        <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:8px">${escapedName}</div>
        <div style="color:#4ade80;margin-bottom:3px;font-size:13px">Members: ${v}</div>
        <div style="color:#fbbf24;font-size:13px">Projected: ${p}</div>
        <div style="color:#64748b;font-size:11px;margin-top:8px;border-top:1px solid #334155;padding-top:6px">Total: ${v + p}</div>
      </div>`,
      { sticky: true },
    );

    layer.on({
      mouseover: (e: LeafletEvent) => {
        e.target.setStyle({ weight: 2.5, color: "#f8fafc", dashArray: "", fillOpacity: 0.9 });
        e.target.bringToFront();
      },
      mouseout: (e: LeafletEvent) => {
        e.target.setStyle({ weight: 1, color: "#334155", dashArray: "3", fillOpacity: 0.75 });
      },
    });
  };

  const totalVerified  = Object.values(counts.verified).reduce((a, b) => a + b, 0);
  const totalProjected = Object.values(counts.projected).reduce((a, b) => a + b, 0);
  const totalMembers   = totalVerified + totalProjected;
  const verRate = totalMembers > 0 ? ((totalVerified / totalMembers) * 100).toFixed(1) : "0.0";

  const growthChartData = Object.entries(growthData)
    .map(([month, members]) => ({ month, members }))
    .slice(-12);

  const stateChartData = Object.entries(geoData.by_state)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  const topElectorates = Object.entries(counts.verified)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  /* ── Tab button style ──────────────────────────────────────────────────── */
  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 7,
    border: "none",
    background: active ? "oklch(100% 0 0 / 0.12)" : "transparent",
    color: active ? "oklch(96% 0.006 240)" : "oklch(60% 0.015 240)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 150ms ease-out, color 150ms ease-out",
  });

  const modeBtn = (mode: typeof viewMode, active: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 6,
    border: "none",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? (mode === "verified" ? "#16a34a" : mode === "projected" ? "#d97706" : "var(--civic-teal)") : "transparent",
    color: active ? "#fff" : "oklch(60% 0.015 240)",
    transition: "background-color 150ms ease-out, color 150ms ease-out",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--navy)", color: "oklch(90% 0.008 240)" }}>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--navy-border)",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: 18,
            color: "oklch(97% 0.006 240)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          War Room
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 2, background: "oklch(100% 0 0 / 0.06)", padding: 3, borderRadius: 9 }}>
            <button onClick={() => setActiveView("map")} style={tabStyle(activeView === "map")}>
              <MapIcon size={14} strokeWidth={2} /> Map
            </button>
            <button onClick={() => setActiveView("analytics")} style={tabStyle(activeView === "analytics")}>
              <BarChart3 size={14} strokeWidth={2} /> Analytics
            </button>
          </div>

          {/* Mode toggle (map only) */}
          {activeView === "map" && (
            <div style={{ display: "flex", gap: 2, background: "oklch(100% 0 0 / 0.06)", padding: 3, borderRadius: 9 }}>
              {(["verified", "projected", "combined"] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)} style={modeBtn(m, viewMode === m)}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {loading ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="animate-spin-slow" style={{ width: 32, height: 32 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--civic-teal)" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
          </div>
        ) : activeView === "map" ? (
          <div style={{ height: "100%", position: "relative" }}>
            {/* Legend */}
            <div
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                zIndex: 1000,
                background: "rgba(15,23,42,0.95)",
                border: "1px solid var(--navy-border)",
                borderRadius: 10,
                padding: "14px 16px",
                backdropFilter: "blur(8px)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(55% 0.015 240)", marginBottom: 10 }}>
                Legend
              </div>
              {[
                { color: "#006d2c", label: "Members (High)" },
                { color: "#74c476", label: "Members (Med)" },
                { color: "#c7e9c0", label: "Members (Low)" },
                { color: "#800026", label: "Projected (High)" },
                { color: "#FD8D3C", label: "Projected (Med)" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: "oklch(65% 0.015 240)" }}>{label}</span>
                </div>
              ))}
            </div>

            <MapContainer
              center={[-28.2744, 133.7751]}
              zoom={4}
              style={{ height: "100%", width: "100%", background: "#0f172a" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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
          <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { icon: Users,      label: "Members",      value: totalMembers.toLocaleString("en-AU"),  color: "oklch(97% 0.006 240)" },
                { icon: Target,     label: "Verified",     value: totalVerified.toLocaleString("en-AU"), color: "#4ade80" },
                { icon: TrendingUp, label: "Projected",    value: totalProjected.toLocaleString("en-AU"),color: "#fbbf24" },
                { icon: BarChart3,  label: "Enrolment Rate", value: `${verRate}%`,                       color: "#2dd4bf" },
              ].map(({ icon: Icon, label, value, color }) => (
                <div
                  key={label}
                  style={{
                    background: "oklch(100% 0 0 / 0.04)",
                    border: "1px solid var(--navy-border)",
                    borderRadius: 12,
                    padding: "18px 20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(50% 0.015 240)" }}>{label}</span>
                    <Icon size={14} strokeWidth={2} style={{ color: "oklch(50% 0.015 240)" }} />
                  </div>
                  <div style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 600, fontSize: 26, color, letterSpacing: "-0.02em" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Growth chart */}
            {growthChartData.length > 0 && (
              <div style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--navy-border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 600, fontSize: 14, color: "oklch(90% 0.008 240)", margin: "0 0 16px" }}>
                  Member Growth
                </h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={growthChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" stroke="#475569" style={{ fontSize: 11 }} />
                    <YAxis stroke="#475569" style={{ fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                      labelStyle={{ color: "#f1f5f9", fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="members" stroke="#3553eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* State distribution */}
              {stateChartData.length > 0 && (
                <div style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--navy-border)", borderRadius: 12, padding: 20 }}>
                  <h2 style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 600, fontSize: 14, color: "oklch(90% 0.008 240)", margin: "0 0 16px" }}>
                    Members by State
                  </h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stateChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="state" stroke="#475569" style={{ fontSize: 11 }} />
                      <YAxis stroke="#475569" style={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                        labelStyle={{ color: "#f1f5f9", fontSize: 12 }}
                      />
                      <Bar dataKey="count" fill="#3553eb" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top electorates */}
              {topElectorates.length > 0 && (
                <div style={{ background: "oklch(100% 0 0 / 0.04)", border: "1px solid var(--navy-border)", borderRadius: 12, padding: 20 }}>
                  <h2 style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 600, fontSize: 14, color: "oklch(90% 0.008 240)", margin: "0 0 16px" }}>
                    Top 10 Electorates
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {topElectorates.map(([name, count], i) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "oklch(42% 0.015 260)", width: 20, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: "oklch(80% 0.01 240)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>
                          {count.toLocaleString("en-AU")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
