import { PageHeader } from "../components/PageHeader";
import { MembershipBadge, type MembershipStatus } from "../components/MembershipBadge";
import { analyticsApi, personsApi, importApi, statsApi, type ImportJob, type Person, type StatsDashboard } from "../services/api";
import { MemberDetailDrawer } from "../components/MemberDetailDrawer";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Upload,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  Square,
  ArrowRight,
  ShieldCheck,
  UserX,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from "recharts";

/* ─── Phase 1 checklist ─────────────────────────────────────────────────── */
const PHASE1_ITEMS = [
  { done: true,  label: "Unified Person model (UUID primary key)" },
  { done: true,  label: "AES-256-GCM field-level encryption on all PII" },
  { done: true,  label: "SHA-256 blind index on email for encrypted lookup" },
  { done: true,  label: "External identities table (NationBuilder decoupling)" },
  { done: true,  label: "Direct NationBuilder API importer (idempotent)" },
  { done: false, label: "Person update (PATCH /persons/:id) with re-encryption" },
  { done: false, label: "Soft-delete with deleted_at" },
  { done: false, label: "Search by state, zip, or email blind index" },
  { done: false, label: "Cursor-based pagination on GET /persons" },
  { done: false, label: "Party & Branch CRUD (hierarchical)" },
  { done: false, label: "Membership lifecycle (active → lapsed → resigned)" },
  { done: false, label: "Interactions — event sourcing" },
  { done: false, label: "Tags + person_tags junction table" },
];

/* ─── Mock data (shown when backend unreachable) ─────────────────────────── */
const MOCK_RECENT: Array<Person & { membership_status: MembershipStatus }> = [
  { id: "1", given_name: "Amelia",  surname: "Thornton",  primary_state: "VIC", primary_zip: "3000", created_at: "2025-11-01T09:00:00Z", updated_at: "2025-11-20T14:00:00Z", membership_status: "active"   },
  { id: "2", given_name: "Marcus",  surname: "Oduya",     primary_state: "NSW", primary_zip: "2000", created_at: "2025-10-15T11:00:00Z", updated_at: "2025-11-18T09:00:00Z", membership_status: "active"   },
  { id: "3", given_name: "Priya",   surname: "Sharma",    primary_state: "QLD", primary_zip: "4000", created_at: "2025-09-22T08:00:00Z", updated_at: "2025-11-05T10:00:00Z", membership_status: "lapsed"   },
  { id: "4", given_name: "Daniel",  surname: "Kowalski",  primary_state: "WA",  primary_zip: "6000", created_at: "2025-08-10T13:00:00Z", updated_at: "2025-10-30T16:00:00Z", membership_status: "active"   },
  { id: "5", given_name: "Sophie",  surname: "Nakamura",  primary_state: "SA",  primary_zip: "5000", created_at: "2025-07-03T10:00:00Z", updated_at: "2025-11-12T11:00:00Z", membership_status: "resigned" },
];

const MOCK_IMPORTS: ImportJob[] = [
  { id: "j1", source: "nationbuilder", status: "complete", records_total: 3226, records_processed: 3194, records_skipped: 32, filename: "nationbuilder-export-3226", started_at: "2025-11-25T02:00:00Z", completed_at: "2025-11-25T02:18:00Z" },
  { id: "j2", source: "csv",           status: "complete", records_total: 3194, records_processed: 3194, records_skipped: 0,  filename: "nationbuilder-export-3194.csv", started_at: "2025-11-25T01:30:00Z", completed_at: "2025-11-25T01:44:00Z" },
];

const MOCK_SUMMARY = { total_persons: 12847, states_covered: 7, imports_total: 24, last_import_at: "2025-11-25T02:18:00Z" };

const MOCK_STATS: StatsDashboard = {
  total_members: 12847,
  active_members: 10420,
  lapsed_members: 2427,
  verified_count: 8943,
  failed_count: 1240,
  partial_match_count: 984,
  captcha_count: 160,
  unchecked_count: 1520,
  duplicate_count: 324,
  new_members_30d: 482,
  by_state: { NSW: 4890, VIC: 3820, QLD: 1980, WA: 1120, SA: 820, TAS: 180, ACT: 28, NT: 9 }
};

const MOCK_GROWTH = {
  "2025-11": 1520,
  "2025-12": 1840,
  "2026-01": 2100,
  "2026-02": 2480,
  "2026-03": 3120,
  "2026-04": 3890,
  "2026-05": 4820,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function timeAgo(iso?: string): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return "Just now";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function jobStatusColor(s: ImportJob["status"]): string {
  return s === "complete" ? "var(--status-active)" :
         s === "failed"   ? "var(--status-suspended)" :
         s === "running"  ? "var(--civic-teal)" : "var(--slate-muted)";
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [summary, setSummary] = useState<{
    total_persons: number;
    states_covered: number;
    imports_total: number;
    last_import_at?: string;
  }>(MOCK_SUMMARY);
  const [members, setMembers] = useState<typeof MOCK_RECENT>(MOCK_RECENT);
  const [imports, setImports] = useState<ImportJob[]>(MOCK_IMPORTS);
  const [stats, setStats] = useState<StatsDashboard>(MOCK_STATS);
  const [growth, setGrowth] = useState<Record<string, number>>(MOCK_GROWTH);
  const [selectedState, setSelectedState] = useState<string>("ALL");
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [sumRes, memRes, impRes, statRes, growthRes] = await Promise.allSettled([
          analyticsApi.summary(),
          personsApi.list({ limit: 5 }),
          importApi.list(),
          statsApi.dashboard(),
          analyticsApi.growth(),
        ]);

        if (sumRes.status === "fulfilled") setSummary(sumRes.value);
        if (memRes.status === "fulfilled" && memRes.value.data?.length) {
          setMembers(
            memRes.value.data.map((m) => ({ ...m, membership_status: "active" as MembershipStatus }))
          );
        }
        if (impRes.status === "fulfilled") setImports(impRes.value);
        if (statRes.status === "fulfilled") setStats(statRes.value);
        if (growthRes.status === "fulfilled" && Object.keys(growthRes.value).length) setGrowth(growthRes.value);
      } catch (err) {
        console.error("Error loading dashboard metrics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--canvas)" }}>
        <div className="animate-spin-slow" style={{ width: 28, height: 28 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--civic-teal)" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
      </div>
    );
  }

  const doneCount = PHASE1_ITEMS.filter((i) => i.done).length;
  const totalCount = PHASE1_ITEMS.length;

  // Chart data preparations
  const aecBreakdownData = [
    { name: "Pass", value: stats.verified_count, color: "var(--status-active)" },
    { name: "Partial", value: stats.partial_match_count, color: "var(--status-lapsed)" },
    { name: "Fail", value: stats.failed_count, color: "var(--status-suspended)" },
    { name: "Captcha", value: stats.captcha_count, color: "#2dd4bf" },
    { name: "Unchecked", value: stats.unchecked_count, color: "var(--slate-muted)" },
  ];

  const stateChartData = Object.entries(stats.by_state)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);

  const growthChartData = Object.entries(growth).map(([month, count]) => ({
    month,
    members: count,
  }));

  const passRate = stats.total_members > 0 
    ? ((stats.verified_count / stats.total_members) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="page-content" style={{ padding: "32px 40px", maxWidth: "1600px", margin: "0 auto" }}>
      <PageHeader
        title="CRM Dashboard"
        subtitle={`Last import ${timeAgo(summary.last_import_at)}`}
        action={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <select
              className="select-base"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ padding: "8px 32px 8px 12px" }}
            >
              <option value="ALL">All States</option>
              {Object.keys(stats.by_state).map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
            <Link to="/app/import" className="btn-primary" style={{ padding: "8px 16px" }}>
              Import Members <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
        }
      />

      {/* ── Stat row ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {[
          {
            icon: Users,
            label: "Total Members",
            value: stats.total_members.toLocaleString("en-AU"),
            sub: `+${stats.new_members_30d} in last 30d`,
            color: "var(--civic-teal)",
          },
          {
            icon: ShieldCheck,
            label: "AEC Verified Rate",
            value: `${passRate}%`,
            sub: `${stats.verified_count.toLocaleString("en-AU")} validated`,
            color: "var(--status-active)",
          },
          {
            icon: Upload,
            label: "Imports Executed",
            value: summary.imports_total.toString(),
            sub: "NationBuilder sync active",
            color: "var(--status-lapsed)",
          },
          {
            icon: UserX,
            label: "Unchecked Records",
            value: stats.unchecked_count.toLocaleString("en-AU"),
            sub: "Requires compliance verification",
            color: "var(--status-suspended)",
          },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div
            key={label}
            className="transition-base"
            style={{
              padding: "24px",
              background: "var(--canvas-raised)",
              border: "1px solid var(--console-border)",
              borderRadius: 16,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${color}15`,
                  color: color,
                }}
              >
                <Icon size={16} strokeWidth={2.5} />
              </div>
              <span className="stat-label" style={{ fontSize: 12 }}>{label}</span>
            </div>
            <div className="stat-value" style={{ fontSize: 32, fontWeight: 600 }}>{value}</div>
            <div style={{ fontSize: 12, color: "var(--slate-muted)", marginTop: 6 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Analytics Visual Section ─────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))",
          gap: 24,
          marginBottom: 32,
        }}
      >
        {/* Pie: AEC Breakdown */}
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>AEC Verification status</h3>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate-muted)" }}>Compliance</span>
          </div>
          <div style={{ flex: 1, minHeight: 280, display: "flex", alignItems: "center" }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={aecBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {aecBreakdownData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ background: "rgba(15,23,42,0.96)", border: "1px solid var(--console-border)", borderRadius: 8 }}
                  itemStyle={{ color: "#f8fafc", fontSize: 13 }}
                  labelStyle={{ display: "none" }}
                />
                <Legend iconSize={10} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar: State distribution */}
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>Members by State</h3>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate-muted)" }}>Demographics</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stateChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--console-border)" vertical={false} />
              <XAxis dataKey="state" stroke="var(--slate-muted)" style={{ fontSize: 11 }} />
              <YAxis stroke="var(--slate-muted)" style={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{ background: "rgba(15,23,42,0.96)", border: "1px solid var(--console-border)", borderRadius: 8 }}
                itemStyle={{ color: "#f8fafc", fontSize: 13 }}
              />
              <Bar dataKey="count" fill="var(--civic-teal)" radius={[4, 4, 0, 0]} barSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Growth Line Chart ────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--canvas-raised)",
          border: "1px solid var(--console-border)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--navy)" }}>Membership Growth Trend</h3>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate-muted)" }}>Growth Over Time</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={growthChartData}>
            <defs>
              <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--civic-teal)" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="var(--civic-teal)" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--console-border)" vertical={false} />
            <XAxis dataKey="month" stroke="var(--slate-muted)" style={{ fontSize: 11 }} />
            <YAxis stroke="var(--slate-muted)" style={{ fontSize: 11 }} />
            <RechartsTooltip
              contentStyle={{ background: "rgba(15,23,42,0.96)", border: "1px solid var(--console-border)", borderRadius: 8 }}
              itemStyle={{ color: "#f8fafc", fontSize: 13 }}
            />
            <Area type="monotone" dataKey="members" stroke="var(--civic-teal)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorGrowth)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Grid: Members, Imports, Checklist ───────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Recent members */}
        <section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--navy)",
                margin: 0,
              }}
            >
              Recent Members
            </h2>
            <Link
              to="/app/members"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--civic-teal)",
              }}
            >
              View all <ChevronRight size={13} strokeWidth={2.5} />
            </Link>
          </div>

          <div
            style={{
              background: "var(--canvas-raised)",
              border: "1px solid var(--console-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table
              className="data-table"
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Name</th>
                  <th style={{ textAlign: "left" }}>State</th>
                  <th style={{ textAlign: "left" }}>Added</th>
                  <th style={{ textAlign: "left" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {members
                  .filter((m) => selectedState === "ALL" || m.primary_state === selectedState)
                  .map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMemberId(m.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <span style={{ fontWeight: 500, color: "var(--navy)" }}>
                          {m.given_name} {m.surname}
                        </span>
                      </td>
                      <td style={{ color: "var(--slate-muted)" }}>{m.primary_state ?? "—"}</td>
                      <td style={{ color: "var(--slate-muted)" }}>{fmtDate(m.created_at)}</td>
                      <td>
                        <MembershipBadge status={m.membership_status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Import history */}
          <section>
            <h2
              style={{
                fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--navy)",
                margin: "0 0 12px",
              }}
            >
              Recent Imports
            </h2>
            <div
              style={{
                background: "var(--canvas-raised)",
                border: "1px solid var(--console-border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {imports.slice(0, 4).map((job, i) => (
                <div
                  key={job.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: i < Math.min(imports.length, 4) - 1
                      ? "1px solid var(--console-border)"
                      : "none",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: "var(--navy)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 180,
                      }}
                    >
                      {job.filename ?? job.source}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--slate-muted)", marginTop: 2 }}>
                      {job.records_processed?.toLocaleString("en-AU") ?? "—"} records
                      {job.started_at ? ` · ${timeAgo(job.started_at)}` : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: jobStatusColor(job.status),
                    }}
                  >
                    {job.status}
                  </span>
                </div>
              ))}

              {imports.length === 0 && (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--slate-muted)",
                  }}
                >
                  No imports yet.
                </div>
              )}
            </div>
          </section>

          {/* Phase 1 progress */}
          <section>
            <button
              onClick={() => setPhaseOpen((o) => !o)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--canvas-raised)",
                border: "1px solid var(--console-border)",
                borderRadius: phaseOpen ? "12px 12px 0 0" : 12,
                padding: "12px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: "var(--navy)",
                  }}
                >
                  Phase 1 Progress
                </div>
                <div style={{ fontSize: 11.5, color: "var(--slate-muted)", marginTop: 2 }}>
                  {doneCount}/{totalCount} tasks complete
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Progress bar */}
                <div
                  style={{
                    width: 56,
                    height: 4,
                    background: "var(--console-border)",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(doneCount / totalCount) * 100}%`,
                      background: "var(--civic-teal)",
                      borderRadius: 99,
                    }}
                  />
                </div>
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  style={{
                    color: "var(--slate-muted)",
                    transform: phaseOpen ? "rotate(180deg)" : "none",
                    transition: "transform 200ms ease-out",
                  }}
                />
              </div>
            </button>

            {phaseOpen && (
              <div
                style={{
                  background: "var(--canvas-raised)",
                  border: "1px solid var(--console-border)",
                  borderTop: "none",
                  borderRadius: "0 0 12px 12px",
                  padding: "4px 0 8px",
                }}
              >
                {PHASE1_ITEMS.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "7px 16px",
                    }}
                  >
                    {item.done ? (
                      <CheckSquare
                        size={13}
                        strokeWidth={2}
                        style={{ color: "var(--status-active)", flexShrink: 0, marginTop: 1 }}
                      />
                    ) : (
                      <Square
                        size={13}
                        strokeWidth={2}
                        style={{ color: "var(--console-border)", flexShrink: 0, marginTop: 1 }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        color: item.done ? "var(--slate-muted)" : "oklch(32% 0.025 260)",
                        lineHeight: 1.4,
                        textDecoration: item.done ? "line-through" : "none",
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Drawer */}
      <MemberDetailDrawer
        memberId={selectedMemberId}
        onClose={() => setSelectedMemberId(null)}
        fallbackMember={members.find((m) => m.id === selectedMemberId)}
      />
    </div>
  );
}
