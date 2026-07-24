import { useState, useEffect } from "react";
import {
  Mail,
  Plus,
  Send,
  Users,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { emailApi, type EmailCampaign, type CampaignStats } from "../services/api";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function CampaignStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    draft:     { label: "Draft",     color: "var(--slate-muted)", bg: "rgba(100,116,139,0.1)",   icon: Clock },
    scheduled: { label: "Scheduled", color: "var(--status-pending)", bg: "rgba(217,119,6,0.1)",  icon: Clock },
    sent:      { label: "Sent",      color: "var(--status-active)",  bg: "rgba(13,148,136,0.1)",  icon: CheckCircle2 },
    cancelled: { label: "Cancelled", color: "var(--status-flagged)", bg: "rgba(225,29,72,0.1)",   icon: XCircle },
  };
  const s = map[status] ?? { label: status, color: "var(--slate-muted)", bg: "rgba(100,116,139,0.1)", icon: Clock };

  return (
    <span className="badge" style={{ color: s.color, background: s.bg, gap: 4 }}>
      <s.icon size={9} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

/* ─── Create Campaign Form ────────────────────────────────────────────────── */
function CreateCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !bodyHtml.trim()) {
      setError("All fields are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await emailApi.create({ title: title.trim(), subject: subject.trim(), body_html: bodyHtml.trim() });
      setTitle("");
      setSubject("");
      setBodyHtml("");
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)} style={{ marginBottom: 24 }}>
        <Plus size={14} strokeWidth={2.5} /> New Campaign
      </button>
    );
  }

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>New Email Campaign</h3>
        <button className="btn-ghost" onClick={() => setOpen(false)} style={{ padding: "5px 10px" }}>
          <XCircle size={14} strokeWidth={2} />
        </button>
      </div>

      {error && (
        <div role="alert" style={{ display: "flex", gap: 8, padding: "9px 12px", background: "oklch(58% 0.22 25 / 0.08)", border: "1px solid oklch(58% 0.22 25 / 0.25)", borderRadius: 8, fontSize: 12.5, color: "oklch(46% 0.18 25)", marginBottom: 14 }}>
          <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Title</label>
            <input className="input-base" placeholder="Campaign title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={submitting} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Subject</label>
            <input className="input-base" placeholder="Email subject line" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={submitting} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}>Body HTML</label>
            <textarea
              className="input-base"
              rows={6}
              placeholder="<h1>Hello!</h1><p>Email body HTML…</p>"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              disabled={submitting}
              style={{ resize: "vertical", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={submitting} style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
          {submitting ? "Creating…" : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}

/* ─── Campaign Detail Panel ──────────────────────────────────────────────── */
function CampaignDetail({
  campaign,
  onRefresh,
}: {
  campaign: EmailCampaign;
  onRefresh: () => void;
}) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [addingRecipients, setAddingRecipients] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const s = await emailApi.stats(campaign.id);
        setStats(s);
      } catch {
        // backend may not have stats yet
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [campaign.id]);

  const handleSend = async () => {
    setSending(true);
    setFeedback(null);
    try {
      await emailApi.send(campaign.id);
      setFeedback("Campaign sent!");
      onRefresh();
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleAddRecipients = async () => {
    const ids = recipientInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    setAddingRecipients(true);
    setFeedback(null);
    try {
      await emailApi.addRecipients(campaign.id, ids);
      setFeedback(`Added ${ids.length} recipient(s)`);
      setRecipientInput("");
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : "Failed to add recipients");
    } finally {
      setAddingRecipients(false);
    }
  };

  const canSend = campaign.status === "draft" || campaign.status === "scheduled";

  return (
    <div style={{ padding: "16px 20px", background: "var(--mist)", borderBottom: "1px solid var(--seam)" }}>
      {/* Stats row */}
      {loadingStats ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--slate-muted)", marginBottom: 14 }}>
          <Loader2 size={12} strokeWidth={2} className="animate-spin-slow" /> Loading stats…
        </div>
      ) : stats ? (
        <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "Sent",     value: stats.sent,     color: "var(--status-active)" },
            { label: "Opened",   value: stats.opened,   color: "var(--civic-teal)" },
            { label: "Clicked",  value: stats.clicked,  color: "var(--status-pending)" },
            { label: "Bounced",  value: stats.bounced,  color: "var(--status-flagged)" },
            { label: "Pending",  value: stats.pending,  color: "var(--slate-muted)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 600, color, fontFamily: "'Sora', sans-serif" }}>{value}</div>
              <div className="stat-label" style={{ fontSize: 9.5 }}>{label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Body preview */}
      <div style={{ fontSize: 12.5, color: "var(--slate-mid)", marginBottom: 14, maxHeight: 80, overflow: "hidden" }}>
        <div style={{ fontWeight: 500, color: "var(--slate)", marginBottom: 2 }}>Body preview:</div>
        <div dangerouslySetInnerHTML={{ __html: campaign.body_html.slice(0, 200) }} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {canSend && (
          <button className="btn-primary" onClick={handleSend} disabled={sending} style={{ opacity: sending ? 0.7 : 1, cursor: sending ? "not-allowed" : "pointer" }}>
            {sending ? "Sending…" : <><Send size={13} strokeWidth={2.5} /> Send</>}
          </button>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input-base"
            placeholder="person_id_1, person_id_2, …"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            style={{ width: 260, fontSize: 12 }}
            disabled={addingRecipients}
          />
          <button
            className="btn-primary"
            onClick={handleAddRecipients}
            disabled={addingRecipients || !recipientInput.trim()}
            style={{ opacity: addingRecipients ? 0.7 : 1, cursor: addingRecipients || !recipientInput.trim() ? "not-allowed" : "pointer", padding: "8px 14px" }}
          >
            {addingRecipients ? "Adding…" : <><Users size={13} strokeWidth={2.5} /> Add</>}
          </button>
        </div>
      </div>

      {feedback && (
        <div style={{ fontSize: 12, color: "var(--civic-teal)", marginTop: 10 }}>{feedback}</div>
      )}
    </div>
  );
}

/* ─── Campaign List ───────────────────────────────────────────────────────── */
function CampaignList({
  campaigns,
  onRefresh,
}: {
  campaigns: EmailCampaign[];
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (campaigns.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13.5, color: "var(--slate-muted)" }}>
        No campaigns yet. Create one above.
      </div>
    );
  }

  return (
    <div style={{ background: "var(--canvas-raised)", border: "1px solid var(--console-border)", borderRadius: 12, overflow: "hidden" }}>
      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Title</th>
            <th style={{ textAlign: "left" }}>Subject</th>
            <th style={{ textAlign: "left" }}>Sent</th>
            <th style={{ textAlign: "left" }}>Status</th>
            <th style={{ width: 20 }}></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td>
                <button
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontWeight: 500, color: "var(--navy)", fontSize: 13, fontFamily: "inherit" }}
                >
                  {c.title}
                </button>
              </td>
              <td style={{ color: "var(--slate-muted)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</td>
              <td style={{ color: "var(--slate-muted)", fontSize: 12 }}>{fmtDate(c.sent_at)}</td>
              <td><CampaignStatusBadge status={c.status} /></td>
              <td>
                <button
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--slate-muted)", display: "flex" }}
                >
                  {expandedId === c.id ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {expandedId && (
        <CampaignDetail
          key={expandedId}
          campaign={campaigns.find((c) => c.id === expandedId)!}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = async () => {
    try {
      const data = await emailApi.list();
      setCampaigns(data);
    } catch (err) {
      console.error("Failed to load campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
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
        title="Email Campaigns"
        subtitle="Create, manage, and send email campaigns to your members and supporters"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="stat-label" style={{ fontSize: 11 }}>
              <Mail size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {campaigns.length} campaigns
            </span>
          </div>
        }
      />

      <CreateCampaignForm onCreated={fetchCampaigns} />
      <CampaignList campaigns={campaigns} onRefresh={fetchCampaigns} />
    </div>
  );
}
