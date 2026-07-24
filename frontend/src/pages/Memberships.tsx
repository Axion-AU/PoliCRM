import { useState, useEffect, useCallback } from "react";
import { Plus, RotateCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { membershipsApi, type MembershipTier, type Membership } from "../services/api";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_OPTIONS = ["", "active", "lapsed", "resigned", "suspended", "pending"] as const;

/* ─── Mock data ──────────────────────────────────────────────────────────── */

const MOCK_TIERS: MembershipTier[] = [
  { id: "1", name: "Standard",  description: "General party membership",     price_cents: 1000,  billing_period: "annual",  benefits: ["Vote in elections", "Party newsletter"],            is_active: true,  sort_order: 1 },
  { id: "2", name: "Premium",   description: "Enhanced membership benefits", price_cents: 5000,  billing_period: "annual",  benefits: ["Vote in elections", "Newsletter", "Events access"], is_active: true,  sort_order: 2 },
  { id: "3", name: "Student",   description: "Reduced rate for students",    price_cents: 500,   billing_period: "annual",  benefits: ["Vote in elections", "Newsletter"],                  is_active: true,  sort_order: 3 },
  { id: "4", name: "Lifetime",  description: "Lifetime party membership",    price_cents: 50000, billing_period: "one-time", benefits: ["All benefits", "Lifetime voting rights"],           is_active: false, sort_order: 4 },
];

const MOCK_MEMBERSHIPS: Membership[] = [
  { id: "1",  person_id: "Amelia Thornton",    party_id: "1", tier_id: "1", status: "active",   join_date: "2025-01-15T00:00:00Z", renewal_date: "2026-01-15T00:00:00Z", auto_renew: true  },
  { id: "2",  person_id: "Marcus Oduya",       party_id: "1", tier_id: "2", status: "active",   join_date: "2024-11-01T00:00:00Z", renewal_date: "2025-11-01T00:00:00Z", auto_renew: true  },
  { id: "3",  person_id: "Priya Sharma",       party_id: "1", tier_id: "1", status: "lapsed",   join_date: "2024-03-20T00:00:00Z", renewal_date: "2025-03-20T00:00:00Z", auto_renew: false },
  { id: "4",  person_id: "Daniel Kowalski",    party_id: "1", tier_id: "3", status: "active",   join_date: "2025-06-10T00:00:00Z", renewal_date: "2026-06-10T00:00:00Z", auto_renew: true  },
  { id: "5",  person_id: "Sophie Nakamura",    party_id: "1", tier_id: "2", status: "resigned", join_date: "2023-09-05T00:00:00Z", renewal_date: "2024-09-05T00:00:00Z", auto_renew: false },
  { id: "6",  person_id: "James Okonkwo",      party_id: "1", tier_id: "1", status: "active",   join_date: "2025-02-14T00:00:00Z", renewal_date: "2026-02-14T00:00:00Z", auto_renew: true  },
  { id: "7",  person_id: "Fatima Al-Rashid",   party_id: "1", tier_id: "4", status: "active",   join_date: "2024-07-01T00:00:00Z", renewal_date: undefined,             auto_renew: false },
  { id: "8",  person_id: "Liam Brennan",       party_id: "1", tier_id: "1", status: "lapsed",   join_date: "2023-12-01T00:00:00Z", renewal_date: "2024-12-01T00:00:00Z", auto_renew: false },
  { id: "9",  person_id: "Grace Watkins",      party_id: "1", tier_id: "2", status: "active",   join_date: "2025-05-18T00:00:00Z", renewal_date: "2026-05-18T00:00:00Z", auto_renew: true  },
  { id: "10", person_id: "Noah Papadopoulos",  party_id: "1", tier_id: "1", status: "suspended", join_date: "2024-08-22T00:00:00Z", renewal_date: "2025-08-22T00:00:00Z", auto_renew: false },
];

const TIER_NAMES: Record<string, string> = {
  "1": "Standard", "2": "Premium", "3": "Student", "4": "Lifetime",
};

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function Memberships() {
  const [activeTab, setActiveTab] = useState<"memberships" | "tiers">("memberships");

  // Tiers state
  const [tiers, setTiers] = useState<MembershipTier[]>(MOCK_TIERS);
  const [tiersOffline, setTiersOffline] = useState(false);
  const [showAddTier, setShowAddTier] = useState(false);
  const [newTier, setNewTier] = useState({ name: "", description: "", price_cents: 0, billing_period: "annual" });

  // Memberships state
  const [memberships, setMemberships] = useState<Membership[]>(MOCK_MEMBERSHIPS);
  const [membershipsOffline, setMembershipsOffline] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  // Load tiers
  const loadTiers = useCallback(async () => {
    try {
      const data = await membershipsApi.tiers.list();
      setTiers(data);
      setTiersOffline(false);
    } catch {
      setTiersOffline(true);
    }
  }, []);

  // Load memberships
  const loadMemberships = useCallback(async () => {
    try {
      const data = await membershipsApi.list(statusFilter ? { status: statusFilter } : undefined);
      setMemberships(data);
      setMembershipsOffline(false);
    } catch {
      setMembershipsOffline(true);
    }
  }, [statusFilter]);

  useEffect(() => { loadTiers(); }, [loadTiers]);
  useEffect(() => { loadMemberships(); }, [loadMemberships]);

  const handleAddTier = async () => {
    if (!newTier.name || newTier.price_cents <= 0) return;
    try {
      const created = await membershipsApi.tiers.create({
        name: newTier.name,
        description: newTier.description || undefined,
        price_cents: newTier.price_cents,
        billing_period: newTier.billing_period,
        is_active: true,
        sort_order: tiers.length + 1,
      });
      setTiers((prev) => [...prev, created]);
      setTiersOffline(false);
    } catch {
      const fallback: MembershipTier = {
        id: `mock-${Date.now()}`,
        name: newTier.name,
        description: newTier.description || undefined,
        price_cents: newTier.price_cents,
        billing_period: newTier.billing_period,
        is_active: true,
        sort_order: tiers.length + 1,
        benefits: [],
      };
      setTiers((prev) => [...prev, fallback]);
      setTiersOffline(true);
    }
    setNewTier({ name: "", description: "", price_cents: 0, billing_period: "annual" });
    setShowAddTier(false);
  };

  const handleRenew = async (id: string) => {
    try {
      await membershipsApi.renew(id);
      setMemberships((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, status: "active", renewal_date: new Date(Date.now() + 365 * 86400000).toISOString() }
            : m,
        ),
      );
    } catch {
      setMemberships((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, status: "active", renewal_date: new Date(Date.now() + 365 * 86400000).toISOString() }
            : m,
        ),
      );
    }
  };

  const tabConfig = [
    { id: "memberships" as const, label: "Memberships" },
    { id: "tiers" as const, label: "Tiers" },
  ];

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Memberships"
        subtitle={
          activeTab === "memberships"
            ? membershipsOffline ? "Showing sample data — backend offline" : `${memberships.length} total memberships`
            : tiersOffline ? "Showing sample data — backend offline" : `${tiers.length} tiers configured`
        }
      />

      {/* Tab bar */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 28,
          background: "var(--canvas-raised)",
          border: "1px solid var(--seam)",
          borderRadius: 10,
          padding: 4,
          width: "fit-content",
        }}
      >
        {tabConfig.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            id={`membership-tab-${id}`}
            onClick={() => setActiveTab(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
              fontSize: 13,
              fontWeight: activeTab === id ? 500 : 400,
              color: activeTab === id ? "var(--slate)" : "var(--slate-muted)",
              background: activeTab === id ? "var(--canvas)" : "transparent",
              boxShadow: activeTab === id ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
              transition: "all 150ms ease-out",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Memberships tab ────────────────────────────────────────────────── */}
      {activeTab === "memberships" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <select
              className="select-base"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 140 }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : "All Statuses"}</option>
              ))}
            </select>
            {statusFilter && (
              <button className="btn-ghost" onClick={() => setStatusFilter("")} style={{ fontSize: 12.5 }}>
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div
            style={{
              background: "var(--canvas-raised)",
              border: "1px solid var(--console-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Person</th>
                  <th style={{ textAlign: "left" }}>Tier</th>
                  <th style={{ textAlign: "left" }}>Status</th>
                  <th style={{ textAlign: "left" }}>Joined</th>
                  <th style={{ textAlign: "left" }}>Renewal</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {memberships.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px 16px", color: "var(--slate-muted)", fontSize: 13.5 }}>
                      No memberships match your filters.
                    </td>
                  </tr>
                ) : (
                  memberships.map((m) => (
                    <tr key={m.id} className="animate-fade-in">
                      <td>
                        <span style={{ fontWeight: 500, color: "oklch(22% 0.03 260)" }}>{m.person_id}</span>
                      </td>
                      <td style={{ color: "var(--slate-muted)" }}>
                        {m.tier_id ? TIER_NAMES[m.tier_id] ?? m.tier_id : "—"}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 500,
                            background:
                              m.status === "active" ? "rgba(34,197,94,0.12)" :
                              m.status === "lapsed" ? "rgba(239,68,68,0.1)" :
                              m.status === "resigned" ? "rgba(148,163,184,0.15)" :
                              m.status === "suspended" ? "rgba(234,179,8,0.12)" :
                              "rgba(148,163,184,0.1)",
                            color:
                              m.status === "active" ? "#16a34a" :
                              m.status === "lapsed" ? "#dc2626" :
                              m.status === "resigned" ? "#64748b" :
                              m.status === "suspended" ? "#ca8a04" :
                              "#64748b",
                          }}
                        >
                          {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </span>
                      </td>
                      <td style={{ color: "var(--slate-muted)" }}>{fmtDate(m.join_date)}</td>
                      <td style={{ color: "var(--slate-muted)" }}>{fmtDate(m.renewal_date)}</td>
                      <td style={{ textAlign: "center" }}>
                        {(m.status === "lapsed" || m.status === "resigned") && (
                          <button
                            className="btn-ghost"
                            onClick={() => handleRenew(m.id)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, padding: "4px 10px" }}
                          >
                            <RotateCw size={12} strokeWidth={2} />
                            Renew
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tiers tab ──────────────────────────────────────────────────────── */}
      {activeTab === "tiers" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button
              className="btn-primary"
              onClick={() => setShowAddTier(!showAddTier)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <Plus size={14} strokeWidth={2} />
              Add Tier
            </button>
          </div>

          {/* Add Tier form */}
          {showAddTier && (
            <div
              style={{
                background: "var(--canvas-raised)",
                border: "1px solid var(--seam)",
                borderRadius: 12,
                padding: "20px 24px",
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  margin: "0 0 16px",
                  fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--slate)",
                }}
              >
                New Tier
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                      Name
                    </label>
                    <input
                      className="input-base"
                      placeholder="e.g. Standard"
                      value={newTier.name}
                      onChange={(e) => setNewTier((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: "0 0 140px" }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                      Price (cents)
                    </label>
                    <input
                      className="input-base"
                      type="number"
                      min={0}
                      placeholder="1000"
                      value={newTier.price_cents || ""}
                      onChange={(e) => setNewTier((p) => ({ ...p, price_cents: Math.max(0, Number(e.target.value)) }))}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                    Description
                  </label>
                  <input
                    className="input-base"
                    placeholder="Brief description of this tier"
                    value={newTier.description}
                    onChange={(e) => setNewTier((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                    Billing Period
                  </label>
                  <select
                    className="select-base"
                    value={newTier.billing_period}
                    onChange={(e) => setNewTier((p) => ({ ...p, billing_period: e.target.value }))}
                  >
                    <option value="annual">Annual</option>
                    <option value="monthly">Monthly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    className="btn-primary"
                    onClick={handleAddTier}
                    disabled={!newTier.name || newTier.price_cents <= 0}
                    style={{
                      fontSize: 13,
                      padding: "8px 18px",
                      opacity: !newTier.name || newTier.price_cents <= 0 ? 0.5 : 1,
                    }}
                  >
                    Create Tier
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => { setShowAddTier(false); setNewTier({ name: "", description: "", price_cents: 0, billing_period: "annual" }); }}
                    style={{ fontSize: 13, padding: "8px 18px" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tiers list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className="animate-fade-in"
                style={{
                  background: "var(--canvas-raised)",
                  border: `1px solid ${tier.is_active ? "var(--seam)" : "rgba(148,163,184,0.2)"}`,
                  borderRadius: 12,
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: tier.is_active ? 1 : 0.55,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: "oklch(22% 0.03 260)",
                        fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                      }}
                    >
                      {tier.name}
                    </span>
                    {!tier.is_active && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "#64748b",
                          background: "rgba(148,163,184,0.12)",
                          padding: "1px 7px",
                          borderRadius: 4,
                        }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                  {tier.description && (
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--slate-muted)", lineHeight: 1.4 }}>
                      {tier.description}
                    </p>
                  )}
                  {tier.benefits && tier.benefits.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {tier.benefits.map((b, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 11,
                            color: "var(--slate-mid)",
                            background: "rgba(15,23,42,0.04)",
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 24 }}>
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: "oklch(22% 0.03 260)",
                      fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                    }}
                  >
                    {fmtPrice(tier.price_cents)}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--slate-muted)", display: "block" }}>
                    / {tier.billing_period}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
