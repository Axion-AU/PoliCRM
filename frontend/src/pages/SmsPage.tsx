import { useState, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Users,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { smsApi, type SmsMessage } from "../services/api";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function SmsStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    sent:     { label: "Sent",     color: "var(--status-active)",   bg: "rgba(13,148,136,0.1)" },
    delivered:{ label: "Delivered",color: "var(--status-active)",   bg: "rgba(13,148,136,0.1)" },
    failed:   { label: "Failed",   color: "var(--status-flagged)",  bg: "rgba(225,29,72,0.1)"  },
    pending:  { label: "Pending",  color: "var(--status-pending)",  bg: "rgba(217,119,6,0.1)"  },
  };
  const s = map[status] ?? { label: status, color: "var(--slate-muted)", bg: "rgba(100,116,139,0.1)" };

  return (
    <span className="badge" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

/* ─── Stats Card ─────────────────────────────────────────────────────────── */
function StatsCard({ totalSent, deliveryRate }: { totalSent: number; deliveryRate: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
        marginBottom: 28,
      }}
    >
      {[
        { icon: Send, label: "Total Sent", value: totalSent.toLocaleString("en-AU"), color: "var(--civic-teal)" },
        { icon: CheckCircle2, label: "Delivery Rate", value: `${(deliveryRate * 100).toFixed(1)}%`, color: "var(--status-active)" },
      ].map(({ icon: Icon, label, value, color }) => (
        <div
          key={label}
          className="transition-base"
          style={{
            padding: "24px",
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `${color}15`,
                color,
              }}
            >
              <Icon size={16} strokeWidth={2.5} />
            </div>
            <span className="stat-label" style={{ fontSize: 12 }}>{label}</span>
          </div>
          <div className="stat-value" style={{ fontSize: 32, fontWeight: 600 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Send Form ──────────────────────────────────────────────────────────── */
function SendForm({ onSent }: { onSent: () => void }) {
  const [personId, setPersonId] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId.trim() || !body.trim()) {
      setError("Both fields are required.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const msg = await smsApi.send({ person_id: personId.trim(), body: body.trim() });
      setSuccess(`Sent to ${msg.person_id ?? msg.phone_number}`);
      setPersonId("");
      setBody("");
      onSent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--canvas-raised)",
        border: "1px solid var(--console-border)",
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--teal-wash)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Send size={13} strokeWidth={2} style={{ color: "var(--civic-teal)" }} />
        </div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>Send SMS</h3>
      </div>

      {error && (
        <div role="alert" style={{ display: "flex", gap: 8, padding: "9px 12px", background: "oklch(58% 0.22 25 / 0.08)", border: "1px solid oklch(58% 0.22 25 / 0.25)", borderRadius: 8, fontSize: 12.5, color: "oklch(46% 0.18 25)", marginBottom: 14 }}>
          <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {success && (
        <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)", borderRadius: 8, fontSize: 12.5, color: "var(--civic-teal)", marginBottom: 14 }}>
          <CheckCircle2 size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Person ID</label>
            <input className="input-base" placeholder="person_id" value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={submitting} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Body</label>
            <textarea
              className="input-base"
              rows={3}
              placeholder="Your message text…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={submitting}
              style={{ resize: "vertical" }}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={submitting} style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
          {submitting ? "Sending…" : <><Send size={13} strokeWidth={2.5} /> Send</>}
        </button>
      </form>
    </div>
  );
}

/* ─── Broadcast Form ─────────────────────────────────────────────────────── */
function BroadcastForm({ onSent }: { onSent: () => void }) {
  const [personIds, setPersonIds] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = personIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0 || !body.trim()) {
      setError("Person IDs and body are required.");
      return;
    }
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await smsApi.broadcast({ person_ids: ids, body: body.trim() });
      setResult(`Broadcast sent to ${res.sent} recipient(s)`);
      setPersonIds("");
      setBody("");
      onSent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--canvas-raised)",
        border: "1px solid var(--console-border)",
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(217,119,6,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Users size={13} strokeWidth={2} style={{ color: "var(--status-pending)" }} />
        </div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>Broadcast</h3>
      </div>

      {error && (
        <div role="alert" style={{ display: "flex", gap: 8, padding: "9px 12px", background: "oklch(58% 0.22 25 / 0.08)", border: "1px solid oklch(58% 0.22 25 / 0.25)", borderRadius: 8, fontSize: 12.5, color: "oklch(46% 0.18 25)", marginBottom: 14 }}>
          <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", gap: 8, padding: "9px 12px", background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)", borderRadius: 8, fontSize: 12.5, color: "var(--civic-teal)", marginBottom: 14 }}>
          <CheckCircle2 size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          {result}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Person IDs (comma-separated)</label>
            <input className="input-base" placeholder="person_id_1, person_id_2, …" value={personIds} onChange={(e) => setPersonIds(e.target.value)} disabled={submitting} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Body</label>
            <textarea
              className="input-base"
              rows={3}
              placeholder="Broadcast message text…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={submitting}
              style={{ resize: "vertical" }}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={submitting} style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
          {submitting ? "Broadcasting…" : <><Users size={13} strokeWidth={2.5} /> Broadcast</>}
        </button>
      </form>
    </div>
  );
}

/* ─── Message History Table ──────────────────────────────────────────────── */
function MessageHistory({ messages }: { messages: SmsMessage[] }) {
  if (messages.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13.5, color: "var(--slate-muted)" }}>
        No messages sent yet.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ minWidth: 600, width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Person ID</th>
            <th style={{ textAlign: "left" }}>Phone</th>
            <th style={{ textAlign: "left" }}>Body</th>
            <th style={{ textAlign: "left" }}>Sent</th>
            <th style={{ textAlign: "left" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--slate-mid)" }}>
                {m.person_id ? <span style={{ fontWeight: 500 }}>{m.person_id}</span> : <span style={{ color: "var(--slate-faint)" }}>—</span>}
              </td>
              <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "var(--slate-mid)" }}>{m.phone_number}</td>
              <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--slate-mid)" }} title={m.body}>
                <span style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12.5 }}>{truncate(m.body, 60)}</span>
              </td>
              <td style={{ color: "var(--slate-muted)", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(m.sent_at)}</td>
              <td><SmsStatusBadge status={m.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function SmsPage() {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [totalSent, setTotalSent] = useState(0);
  const [deliveryRate, setDeliveryRate] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [msgRes, statRes] = await Promise.all([
        smsApi.messages(),
        smsApi.stats(),
      ]);
      setMessages(msgRes);
      setTotalSent(statRes.total_sent);
      setDeliveryRate(statRes.delivery_rate);
    } catch (err) {
      console.error("Failed to load SMS data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
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

  return (
    <div className="page-content" style={{ padding: "32px 40px", maxWidth: "1200px", margin: "0 auto" }}>
      <PageHeader
        title="SMS"
        subtitle="Send and manage SMS messages to members and supporters"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="stat-label" style={{ fontSize: 11 }}>
              <MessageSquare size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {messages.length} messages
            </span>
          </div>
        }
      />

      <StatsCard totalSent={totalSent} deliveryRate={deliveryRate} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <SendForm onSent={fetchAll} />
        <BroadcastForm onSent={fetchAll} />
      </div>

      <h2 style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif", fontWeight: 600, fontSize: 16, color: "var(--navy)", margin: "0 0 14px" }}>
        Message History
      </h2>

      <div style={{ background: "var(--canvas-raised)", border: "1px solid var(--console-border)", borderRadius: 12, overflow: "hidden" }}>
        <MessageHistory messages={messages} />
      </div>
    </div>
  );
}
