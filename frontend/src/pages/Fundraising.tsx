import { useState, useEffect, useCallback } from "react";
import { Plus, DollarSign, TrendingUp, CalendarDays, Gift, Repeat } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { donationsApi, type Donation, type DonationStats } from "../services/api";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDollarsShort(cents: number): string {
  if (cents >= 100_000_00) return `$${(cents / 100_00_00).toFixed(1)}K`;
  return fmtDollars(cents);
}

/* ─── Mock data ──────────────────────────────────────────────────────────── */

const MOCK_STATS: DonationStats = {
  total_7d: 45_00_00,
  total_30d: 1_82_00_00,
  total_all: 14_750_00_00,
  avg_gift: 1_25_00,
  monthly_recurring: 8_40_00,
  by_campaign: { "Q4 Drive": 450_00_00, "Annual Gala": 320_00_00, "Spring Appeal": 180_00_00 },
};

const MOCK_DONATIONS: Donation[] = [
  { id: "1",  person_id: "Amelia Thornton",    amount_cents: 2_50_00, currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Q4 Drive",     donated_at: "2026-07-24T14:30:00Z" },
  { id: "2",  person_id: "Marcus Oduya",       amount_cents: 1_00_00, currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Annual Gala", donated_at: "2026-07-23T09:15:00Z" },
  { id: "3",  person_id: "Priya Sharma",       amount_cents: 5_00_00, currency: "AUD", donation_type: "monthly",  status: "completed", campaign: "Spring Appeal", donated_at: "2026-07-22T11:00:00Z" },
  { id: "4",  person_id: "Daniel Kowalski",    amount_cents: 1_50_00, currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Q4 Drive",     donated_at: "2026-07-20T16:45:00Z" },
  { id: "5",  person_id: "Sophie Nakamura",    amount_cents: 10_00_00, currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Annual Gala", donated_at: "2026-07-18T08:30:00Z" },
  { id: "6",  person_id: "James Okonkwo",      amount_cents: 75_00,   currency: "AUD", donation_type: "monthly",  status: "completed", campaign: undefined,    donated_at: "2026-07-15T10:00:00Z" },
  { id: "7",  person_id: "Fatima Al-Rashid",   amount_cents: 3_00_00, currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Spring Appeal", donated_at: "2026-07-12T13:20:00Z" },
  { id: "8",  person_id: "Liam Brennan",       amount_cents: 50_00,   currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Q4 Drive",     donated_at: "2026-07-10T17:00:00Z" },
  { id: "9",  person_id: "Grace Watkins",      amount_cents: 2_00_00, currency: "AUD", donation_type: "monthly",  status: "completed", campaign: undefined,    donated_at: "2026-07-08T12:15:00Z" },
  { id: "10", person_id: "Noah Papadopoulos",  amount_cents: 8_00_00, currency: "AUD", donation_type: "one-off",  status: "completed", campaign: "Annual Gala", donated_at: "2026-07-05T19:30:00Z" },
];

const CAMPAIGNS = Array.from(new Set(MOCK_DONATIONS.map((d) => d.campaign).filter(Boolean))) as string[];

/* ─── Stat card ──────────────────────────────────────────────────────────── */

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        background: "var(--canvas-raised)",
        border: "1px solid var(--seam)",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={14} strokeWidth={2} style={{ color: "var(--slate-muted)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--slate-muted)" }}>{label}</span>
      </div>
      <span
        style={{
          fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 600,
          color: "oklch(22% 0.03 260)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function Fundraising() {
  const [donations, setDonations] = useState<Donation[]>(MOCK_DONATIONS);
  const [stats, setStats] = useState<DonationStats>(MOCK_STATS);
  const [offline, setOffline] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [newDonation, setNewDonation] = useState({ person_id: "", amount_cents: 0, campaign: "" });

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        donationsApi.list(campaignFilter ? { campaign: campaignFilter } : undefined),
        donationsApi.stats(),
      ]);
      setDonations(d);
      setStats(s);
      setOffline(false);
    } catch {
      setOffline(true);
      if (campaignFilter) {
        setDonations(MOCK_DONATIONS.filter((don) => don.campaign === campaignFilter));
      } else {
        setDonations(MOCK_DONATIONS);
      }
    }
  }, [campaignFilter]);

  useEffect(() => { load(); }, [load]);

  const handleRecordDonation = async () => {
    if (!newDonation.person_id || newDonation.amount_cents <= 0) return;
    try {
      const created = await donationsApi.create({
        person_id: newDonation.person_id,
        amount_cents: newDonation.amount_cents,
        campaign: newDonation.campaign || undefined,
        donation_type: "one-off",
      });
      setDonations((prev) => [created, ...prev]);
      setOffline(false);
    } catch {
      const fallback: Donation = {
        id: `mock-${Date.now()}`,
        person_id: newDonation.person_id,
        amount_cents: newDonation.amount_cents,
        currency: "AUD",
        donation_type: "one-off",
        status: "completed",
        campaign: newDonation.campaign || undefined,
        donated_at: new Date().toISOString(),
      };
      setDonations((prev) => [fallback, ...prev]);
      setOffline(true);
    }
    setNewDonation({ person_id: "", amount_cents: 0, campaign: "" });
    setShowRecordForm(false);
  };

  const statCards: StatCardProps[] = [
    { icon: CalendarDays, label: "Total (7 days)",  value: fmtDollarsShort(stats.total_7d) },
    { icon: TrendingUp,   label: "Total (30 days)", value: fmtDollarsShort(stats.total_30d) },
    { icon: DollarSign,   label: "All time",        value: fmtDollarsShort(stats.total_all) },
    { icon: Gift,         label: "Avg gift",         value: fmtDollars(stats.avg_gift) },
    { icon: Repeat,       label: "Monthly recurring", value: fmtDollars(stats.monthly_recurring) },
  ];

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Fundraising"
        subtitle={
          offline
            ? "Showing sample data — backend offline"
            : `${fmtDollarsShort(stats.total_all)} raised across ${donations.length} donations`
        }
        action={
          <button
            className="btn-primary"
            onClick={() => setShowRecordForm(!showRecordForm)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <Plus size={14} strokeWidth={2} />
            Record Donation
          </button>
        }
      />

      {/* Record Donation form */}
      {showRecordForm && (
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--seam)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 24,
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
            Record a Donation
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                Person ID
              </label>
              <input
                className="input-base"
                placeholder="e.g. Amelia Thornton"
                value={newDonation.person_id}
                onChange={(e) => setNewDonation((p) => ({ ...p, person_id: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                  Amount (cents)
                </label>
                <input
                  className="input-base"
                  type="number"
                  min={0}
                  placeholder="2500"
                  value={newDonation.amount_cents || ""}
                  onChange={(e) => setNewDonation((p) => ({ ...p, amount_cents: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--slate-muted)", marginBottom: 4 }}>
                  Campaign
                </label>
                <input
                  className="input-base"
                  placeholder="e.g. Q4 Drive"
                  value={newDonation.campaign}
                  onChange={(e) => setNewDonation((p) => ({ ...p, campaign: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                className="btn-primary"
                onClick={handleRecordDonation}
                disabled={!newDonation.person_id || newDonation.amount_cents <= 0}
                style={{
                  fontSize: 13,
                  padding: "8px 18px",
                  opacity: !newDonation.person_id || newDonation.amount_cents <= 0 ? 0.5 : 1,
                }}
              >
                Save Donation
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setShowRecordForm(false); setNewDonation({ person_id: "", amount_cents: 0, campaign: "" }); }}
                style={{ fontSize: 13, padding: "8px 18px" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        {statCards.map((card) => (
          <StatCard key={card.label} icon={card.icon} label={card.label} value={card.value} />
        ))}
      </div>

      {/* Campaign filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <select
          className="select-base"
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Campaigns</option>
          {CAMPAIGNS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {campaignFilter && (
          <button className="btn-ghost" onClick={() => setCampaignFilter("")} style={{ fontSize: 12.5 }}>
            Clear
          </button>
        )}
      </div>

      {/* Donation table */}
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
              <th style={{ textAlign: "right" }}>Amount</th>
              <th style={{ textAlign: "left" }}>Campaign</th>
              <th style={{ textAlign: "left" }}>Type</th>
              <th style={{ textAlign: "left" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {donations.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px 16px", color: "var(--slate-muted)", fontSize: 13.5 }}>
                  No donations found.
                </td>
              </tr>
            ) : (
              donations.map((d) => (
                <tr key={d.id} className="animate-fade-in">
                  <td>
                    <span style={{ fontWeight: 500, color: "oklch(22% 0.03 260)" }}>{d.person_id}</span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 600, color: "oklch(22% 0.03 260)" }}>
                    {fmtDollars(d.amount_cents)}
                  </td>
                  <td style={{ color: "var(--slate-muted)" }}>{d.campaign ?? "—"}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        background: d.donation_type === "monthly" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.12)",
                        color: d.donation_type === "monthly" ? "#2563eb" : "#64748b",
                      }}
                    >
                      {d.donation_type === "monthly" ? "Monthly" : "One-off"}
                    </span>
                  </td>
                  <td style={{ color: "var(--slate-muted)" }}>{fmtDate(d.donated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
