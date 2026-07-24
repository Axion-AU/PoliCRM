import { useState, useEffect } from "react";
import { RefreshCw, Loader2, DollarSign, CheckCircle2, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { prospectsApi, type Prospect } from "../services/api";

const TIER_MAP: Record<string, { label: string; color: string; bg: string }> = {
  lapsed:    { label: "Lapsed",    color: "#e11d48", bg: "rgba(225,29,72,0.1)"   },
  upgrade:   { label: "Upgrade",   color: "#2563eb", bg: "rgba(37,99,235,0.1)"   },
  major:     { label: "Major",     color: "#d97706", bg: "rgba(217,119,6,0.1)"   },
  non_donor: { label: "Non-Donor", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  cooling:   { label: "Cooling",   color: "#ea580c", bg: "rgba(234,88,12,0.1)"   },
};

function TierBadge({ tier }: { tier: string }) {
  const def = TIER_MAP[tier] ?? { label: tier, color: "var(--slate-muted)", bg: "var(--mist)" };
  return (
    <span className="badge" style={{ color: def.color, background: def.bg, gap: 4 }}>
      {def.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const hue = score >= 70 ? 160 : score >= 40 ? 45 : 0;
  const sat = score >= 40 ? 70 : 80;
  const light = score >= 70 ? 42 : 48;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          flex: "1 1 80px",
          height: 6,
          background: "var(--mist)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: `oklch(${light}% ${sat * 0.01} ${hue})`,
            borderRadius: 99,
            transition: "width 300ms ease-out",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--slate)",
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {score}
      </span>
    </div>
  );
}

function fmtCents(cents?: number): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const MOCK_PROSPECTS: Prospect[] = [
  { person_id: "1",  score: 88, tier: "major",     reason: "Previous donor, high capacity",                    suggested_ask_cents: 500000, last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "2",  score: 74, tier: "upgrade",    reason: "Consistent donor, increased engagement",           suggested_ask_cents: 250000, last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "3",  score: 65, tier: "upgrade",    reason: "Monthly donor for 18 months",                     suggested_ask_cents: 150000, last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "4",  score: 52, tier: "lapsed",     reason: "Donated 6 months ago, no recent activity",        suggested_ask_cents: 75000,  last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "5",  score: 41, tier: "lapsed",     reason: "One-time donor, lapsed >12 months",               suggested_ask_cents: 50000,  last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "6",  score: 38, tier: "cooling",    reason: "Donated then unsubscribed — low sentiment",       last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "7",  score: 22, tier: "non_donor",  reason: "Volunteer, never donated",                         suggested_ask_cents: 25000,  last_calculated: "2026-05-20T10:00:00Z" },
  { person_id: "8",  score: 15, tier: "non_donor",  reason: "Recently joined, no engagement history",          last_calculated: "2026-05-20T10:00:00Z" },
];

const OUTCOME_OPTIONS = [
  { value: "reached",    label: "Reached" },
  { value: "voicemail",  label: "Voicemail" },
  { value: "no_answer",  label: "No Answer" },
  { value: "call_back",  label: "Call Back" },
];

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>(MOCK_PROSPECTS);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [offline, setOffline] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [pledgedCents, setPledgedCents] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggedOutcome, setLoggedOutcome] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await prospectsApi.list();
      setProspects(data);
      setOffline(false);
    } catch (err) {
      console.error("prospectsApi.list failed:", err);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await prospectsApi.recalculate();
      await load();
    } catch (err) {
      console.error("prospectsApi.recalculate failed:", err);
    } finally {
      setRecalculating(false);
    }
  };

  const handleLogOutcome = async () => {
    if (!selectedId || !outcome) return;
    setSubmitting(true);
    try {
      await prospectsApi.logOutcome(selectedId, {
        outcome,
        pledged_cents: pledgedCents ? parseInt(pledgedCents, 10) : undefined,
        notes: notes || undefined,
      });
      setLoggedOutcome(outcome);
      setTimeout(() => {
        setSelectedId(null);
        setOutcome("");
        setPledgedCents("");
        setNotes("");
        setLoggedOutcome(null);
      }, 800);
    } catch (err) {
      console.error("prospectsApi.logOutcome failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const selected = prospects.find((p) => p.person_id === selectedId);

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Prospects AI"
        subtitle={offline ? "Showing sample data — backend offline" : `${prospects.length} prospects scored`}
        action={
          <button
            className="btn-primary"
            onClick={handleRecalculate}
            disabled={recalculating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              opacity: recalculating ? 0.7 : 1,
            }}
          >
            {recalculating ? (
              <Loader2 size={14} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <RefreshCw size={14} strokeWidth={2.5} />
            )}
            {recalculating ? "Recalculating…" : "Recalculate"}
          </button>
        }
      />

      {/* Table */}
      <div
        style={{
          background: "var(--canvas-raised)",
          border: "1px solid var(--console-border)",
          borderRadius: 12,
          overflow: "hidden",
          opacity: loading ? 0.6 : 1,
          transition: "opacity 150ms ease-out",
        }}
      >
        <table
          className="data-table"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Score</th>
              <th style={{ textAlign: "left" }}>Tier</th>
              <th style={{ textAlign: "left" }}>Reason</th>
              <th style={{ textAlign: "left" }}>Suggested Ask</th>
              <th style={{ textAlign: "left" }}>Last Calculated</th>
            </tr>
          </thead>
          <tbody>
            {prospects.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: "center",
                    padding: "40px 16px",
                    color: "var(--slate-muted)",
                    fontSize: 13.5,
                  }}
                >
                  {loading ? "Loading…" : "No prospects found."}
                </td>
              </tr>
            ) : (
              prospects.map((p) => (
                <tr
                  key={p.person_id}
                  className="animate-fade-in"
                  onClick={() => {
                    setSelectedId(p.person_id);
                    setLoggedOutcome(null);
                  }}
                  style={{
                    cursor: "pointer",
                    background:
                      selectedId === p.person_id
                        ? "var(--teal-wash)"
                        : undefined,
                  }}
                >
                  <td>
                    <ScoreBar score={p.score} />
                  </td>
                  <td>
                    <TierBadge tier={p.tier} />
                  </td>
                  <td style={{ color: "var(--slate-mid)", fontSize: 13 }}>
                    {p.reason ?? "—"}
                  </td>
                  <td>
                    {p.suggested_ask_cents != null ? (
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: "var(--navy)",
                        }}
                      >
                        {fmtCents(p.suggested_ask_cents)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--slate-faint)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--slate-muted)", fontSize: 12 }}>
                    {fmtDate(p.last_calculated)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Outcome form overlay */}
      {selectedId && selected && (
        <div
          style={{
            marginTop: 24,
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 12,
            padding: 24,
            animation: "fadeIn 150ms ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--slate)",
                  fontFamily: "'Sora', ui-sans-serif, sans-serif",
                }}
              >
                Log Call Outcome
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: "var(--slate-muted)",
                }}
              >
                Prospect: {selected.person_id} · Score: {selected.score} · Tier: {selected.tier}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedId(null);
                setOutcome("");
                setPledgedCents("");
                setNotes("");
                setLoggedOutcome(null);
              }}
              className="btn-ghost"
              style={{ padding: "6px 8px" }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          {loggedOutcome ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "16px 20px",
                background: "rgba(13,148,136,0.06)",
                border: "1px solid rgba(13,148,136,0.2)",
                borderRadius: 8,
                color: "var(--civic-teal)",
                fontSize: 13.5,
              }}
            >
              <CheckCircle2 size={18} strokeWidth={2.5} />
              Outcome logged successfully.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Outcome dropdown */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--slate-muted)",
                    marginBottom: 6,
                    fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
                  }}
                >
                  Outcome
                </label>
                <select
                  className="select-base"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">Select outcome…</option>
                  {OUTCOME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pledged amount */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--slate-muted)",
                    marginBottom: 6,
                    fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
                  }}
                >
                  Pledged Amount (cents)
                </label>
                <div style={{ position: "relative" }}>
                  <DollarSign
                    size={14}
                    strokeWidth={2}
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--slate-muted)",
                    }}
                  />
                  <input
                    type="number"
                    className="input-base"
                    placeholder="e.g. 50000 for $500"
                    value={pledgedCents}
                    onChange={(e) => setPledgedCents(e.target.value)}
                    style={{ paddingLeft: 34, width: "100%" }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--slate-muted)",
                    marginBottom: 6,
                    fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
                  }}
                >
                  Notes
                </label>
                <textarea
                  className="input-base"
                  placeholder="Any notes about this call…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
                  }}
                />
              </div>

              {/* Submit */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn-primary"
                  onClick={handleLogOutcome}
                  disabled={!outcome || submitting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 20px",
                    opacity: !outcome || submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? (
                    <Loader2 size={14} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <CheckCircle2 size={14} strokeWidth={2.5} />
                  )}
                  Log Outcome
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
