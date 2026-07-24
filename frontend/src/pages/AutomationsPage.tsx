import { useState, useEffect } from "react";
import {
  Plus,
  Loader2,
  Trash2,
  Play,
  Square,
  X,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { automationsApi, type Automation } from "../services/api";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className="badge"
      style={{
        color: active ? "var(--status-active)" : "var(--slate-muted)",
        background: active
          ? "rgba(13,148,136,0.1)"
          : "var(--mist)",
        gap: 4,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? "var(--status-active)" : "var(--slate-muted)",
          display: "inline-block",
        }}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

const MOCK_AUTOMATIONS: Automation[] = [
  {
    id: "a1",
    name: "Welcome Email",
    description: "Send welcome email to new members",
    trigger_type: "new_member",
    trigger_config: JSON.stringify({ delay_minutes: 0 }, null, 2),
    actions: JSON.stringify({ email_template: "welcome", tags: ["welcomed"] }, null, 2),
    is_active: true,
    created_at: "2026-04-10T08:00:00Z",
  },
  {
    id: "a2",
    name: "Lapsed Donor Alert",
    description: "Notify organizer when a major donor lapses",
    trigger_type: "donor_lapsed",
    trigger_config: JSON.stringify({ threshold_days: 90 }, null, 2),
    actions: JSON.stringify({ notify: ["organizer"], create_task: true }, null, 2),
    is_active: false,
    created_at: "2026-04-12T14:00:00Z",
  },
  {
    id: "a3",
    name: "High-Score Follow-up",
    description: "Create follow-up task for prospects with score > 80",
    trigger_type: "prospect_scored",
    trigger_config: JSON.stringify({ min_score: 80 }, null, 2),
    actions: JSON.stringify({ create_task: true, assign_to: "owner", priority: "high" }, null, 2),
    is_active: true,
    created_at: "2026-05-01T09:30:00Z",
  },
];

const TRIGGER_TYPES = [
  { value: "new_member",     label: "New Member" },
  { value: "donor_lapsed",   label: "Donor Lapsed" },
  { value: "prospect_scored", label: "Prospect Scored" },
  { value: "donation_received", label: "Donation Received" },
  { value: "membership_expiring", label: "Membership Expiring" },
];

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>(MOCK_AUTOMATIONS);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTrigger, setCreateTrigger] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await automationsApi.list();
      setAutomations(data);
      setOffline(false);
    } catch (err) {
      console.error("automationsApi.list failed:", err);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleActive = async (a: Automation) => {
    setTogglingId(a.id);
    try {
      if (a.is_active) {
        await automationsApi.deactivate(a.id);
      } else {
        await automationsApi.activate(a.id);
      }
      setAutomations((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, is_active: !x.is_active } : x)),
      );
    } catch (err) {
      console.error("toggle active failed:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await automationsApi.delete(id);
      setAutomations((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error("automationsApi.delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    if (!createName || !createTrigger) return;
    setCreating(true);
    try {
      const created = await automationsApi.create({
        name: createName,
        trigger_type: createTrigger,
        trigger_config: "{}",
        actions: "{}",
      });
      setAutomations((prev) => [...prev, created]);
      setShowCreate(false);
      setCreateName("");
      setCreateTrigger("");
      setCreateDescription("");
    } catch (err) {
      console.error("automationsApi.create failed:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Automations"
        subtitle={offline ? "Showing sample data — backend offline" : `${automations.length} automations configured`}
        action={
          <button
            className="btn-primary"
            onClick={() => setShowCreate(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <Plus size={14} strokeWidth={2.5} />
            New Automation
          </button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <div
          className="animate-fade-in"
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
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
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--slate)",
                fontFamily: "'Sora', ui-sans-serif, sans-serif",
              }}
            >
              Create Automation
            </h3>
            <button
              onClick={() => {
                setShowCreate(false);
                setCreateName("");
                setCreateTrigger("");
                setCreateDescription("");
              }}
              className="btn-ghost"
              style={{ padding: "6px 8px" }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                Name
              </label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. Welcome Email"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

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
                Trigger Type
              </label>
              <select
                className="select-base"
                value={createTrigger}
                onChange={(e) => setCreateTrigger(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Select trigger…</option>
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

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
                Description
              </label>
              <textarea
                className="input-base"
                placeholder="Optional description…"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                rows={2}
                style={{
                  width: "100%",
                  resize: "vertical",
                  fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn-ghost"
                onClick={() => {
                  setShowCreate(false);
                  setCreateName("");
                  setCreateTrigger("");
                  setCreateDescription("");
                }}
                style={{ padding: "8px 16px" }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={!createName || !createTrigger || creating}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 20px",
                  opacity: !createName || !createTrigger || creating ? 0.6 : 1,
                }}
              >
                {creating ? (
                  <Loader2 size={14} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <CheckCircle2 size={14} strokeWidth={2.5} />
                )}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div
        style={{
          opacity: loading ? 0.6 : 1,
          transition: "opacity 150ms ease-out",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {automations.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 16px",
              color: "var(--slate-muted)",
              fontSize: 13.5,
              background: "var(--canvas-raised)",
              border: "1px solid var(--console-border)",
              borderRadius: 12,
            }}
          >
            {loading ? "Loading…" : "No automations yet. Create one to get started."}
          </div>
        ) : (
          automations.map((a) => (
            <div
              key={a.id}
              className="animate-fade-in"
              style={{
                background: "var(--canvas-raised)",
                border: "1px solid var(--console-border)",
                borderRadius: 12,
                padding: "20px 24px",
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: a.is_active
                    ? "rgba(13,148,136,0.1)"
                    : "var(--mist)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: a.is_active
                    ? "var(--civic-teal)"
                    : "var(--slate-muted)",
                }}
              >
                <Zap size={16} strokeWidth={2} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--slate)",
                    }}
                  >
                    {a.name}
                  </span>
                  <ActiveBadge active={a.is_active} />
                  <span
                    style={{
                      fontSize: 11.5,
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--slate-faint)",
                    }}
                  >
                    {a.trigger_type}
                  </span>
                </div>

                {a.description && (
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: 12.5,
                      color: "var(--slate-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {a.description}
                  </p>
                )}

                {/* Config/Actions (formatted JSON) */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginBottom: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--slate-mid)",
                      lineHeight: 1.6,
                    }}
                  >
                    <span style={{ color: "var(--slate-faint)", fontWeight: 500 }}>Config:</span>
                    <pre
                      style={{
                        margin: "2px 0 0",
                        whiteSpace: "pre-wrap",
                        fontSize: 11,
                        color: "var(--slate-muted)",
                      }}
                    >
                      {a.trigger_config}
                    </pre>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--slate-mid)",
                      lineHeight: 1.6,
                    }}
                  >
                    <span style={{ color: "var(--slate-faint)", fontWeight: 500 }}>Actions:</span>
                    <pre
                      style={{
                        margin: "2px 0 0",
                        whiteSpace: "pre-wrap",
                        fontSize: 11,
                        color: "var(--slate-muted)",
                      }}
                    >
                      {a.actions}
                    </pre>
                  </div>
                </div>

                <div style={{ fontSize: 11.5, color: "var(--slate-faint)" }}>
                  Created {fmtDate(a.created_at)}
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexShrink: 0,
                  alignItems: "center",
                }}
              >
                <button
                  className="btn-ghost"
                  title={a.is_active ? "Deactivate" : "Activate"}
                  onClick={() => handleToggleActive(a)}
                  disabled={togglingId === a.id}
                  style={{
                    padding: "6px 10px",
                    opacity: togglingId === a.id ? 0.6 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                  }}
                >
                  {togglingId === a.id ? (
                    <Loader2 size={13} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />
                  ) : a.is_active ? (
                    <Square size={13} strokeWidth={2} />
                  ) : (
                    <Play size={13} strokeWidth={2} />
                  )}
                  {a.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="btn-ghost"
                  title="Delete"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  style={{
                    padding: "6px 8px",
                    opacity: deletingId === a.id ? 0.6 : 1,
                    color: "var(--status-flagged)",
                  }}
                >
                  {deletingId === a.id ? (
                    <Loader2 size={13} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Trash2 size={13} strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
