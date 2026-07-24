import { PageHeader } from "../components/PageHeader";
import { tasksApi, type Task } from "../services/api";
import { useState, useEffect } from "react";
import { CheckCircle2, Clock, Plus, XCircle } from "lucide-react";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "2-digit", minute: "2-digit",
  });
}

function statusColor(status: Task["status"]): string {
  return status === "completed" ? "var(--status-active)" :
         status === "cancelled" ? "var(--status-suspended)" :
         "var(--civic-teal)";
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 20px",
  background: active ? "var(--canvas-raised)" : "transparent",
  border: active ? "1px solid var(--console-border)" : "1px solid transparent",
  borderRadius: "10px 10px 0 0",
  fontWeight: 600,
  fontSize: 13,
  color: active ? "var(--navy)" : "var(--slate-muted)",
  cursor: "pointer",
  marginBottom: -1,
  transition: "background 150ms, color 150ms",
});

const cardStyle: React.CSSProperties = {
  background: "var(--canvas-raised)",
  border: "1px solid var(--console-border)",
  borderRadius: 12,
  padding: 24,
};

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  borderRadius: 8,
  border: "none",
  fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export default function Tasks() {
  const [tab, setTab] = useState<"today" | "all" | "create">("today");
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  /* Create form */
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createPersonId, setCreatePersonId] = useState("");
  const [createAssignee, setCreateAssignee] = useState("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  /* ─── Data fetching ────────────────────────────────────────────────── */
  const fetchToday = async () => {
    try {
      const [overdue, todays] = await Promise.all([
        tasksApi.overdue(),
        tasksApi.today(),
      ]);
      setOverdueTasks(overdue);
      setTodayTasks(todays);
    } catch (err) {
      console.error("Error fetching today/overdue tasks:", err);
    }
  };

  const fetchAll = async () => {
    try {
      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;
      const tasks = await tasksApi.list(params);
      setAllTasks(tasks);
    } catch (err) {
      console.error("Error fetching all tasks:", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      tasksApi.overdue().then(setOverdueTasks).catch(() => {}),
      tasksApi.today().then(setTodayTasks).catch(() => {}),
      tasksApi.list(statusFilter ? { status: statusFilter } : undefined).then(setAllTasks).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "all") fetchAll();
  }, [tab, statusFilter]);

  /* ─── Actions ──────────────────────────────────────────────────────── */
  const handleComplete = async (id: string) => {
    try {
      await tasksApi.complete(id);
      setTodayTasks((t) => t.filter((x) => x.id !== id));
      setOverdueTasks((t) => t.filter((x) => x.id !== id));
      setAllTasks((t) =>
        t.map((x) => (x.id === id ? { ...x, status: "completed" as const } : x))
      );
    } catch (err) {
      console.error("Error completing task:", err);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await tasksApi.cancel(id);
      setAllTasks((t) =>
        t.map((x) => (x.id === id ? { ...x, status: "cancelled" as const } : x))
      );
    } catch (err) {
      console.error("Error cancelling task:", err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) return;
    try {
      await tasksApi.create({
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
        due_date: createDueDate || undefined,
        person_id: createPersonId.trim() || undefined,
        assigned_to: createAssignee.trim() || undefined,
      });
      setCreateTitle("");
      setCreateDescription("");
      setCreateDueDate("");
      setCreatePersonId("");
      setCreateAssignee("");
      setTab("today");
      fetchToday();
    } catch (err) {
      console.error("Error creating task:", err);
    }
  };

  /* ─── Toggle expand ────────────────────────────────────────────────── */
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ─── Loading state ────────────────────────────────────────────────── */
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

  /* ─── Task card renderer ───────────────────────────────────────────── */
  const renderTask = (task: Task, overdue?: boolean) => {
    const isExpanded = expanded.has(task.id);
    return (
      <div
        key={task.id}
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--console-border)",
          background: overdue ? "rgba(239, 68, 68, 0.04)" : "transparent",
          ...(overdue ? { borderLeft: "3px solid #ef4444" } : {}),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            cursor: task.description ? "pointer" : "default",
          }}
          onClick={() => task.description && toggleExpand(task.id)}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--navy)",
                }}
              >
                {task.title}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: statusColor(task.status),
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: `${statusColor(task.status)}12`,
                }}
              >
                {task.status}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 4,
                fontSize: 12,
                color: "var(--slate-muted)",
              }}
            >
              {task.due_date && (
                <span>{fmtDate(task.due_date)} {fmtTime(task.due_date)}</span>
              )}
              {task.assigned_to && (
                <span>→ {task.assigned_to}</span>
              )}
            </div>
          </div>

          <div
            style={{ display: "flex", gap: 6, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {task.status === "pending" && (
              <>
                <button
                  style={{ ...btnStyle, background: "var(--status-active)18", color: "var(--status-active)" }}
                  onClick={() => handleComplete(task.id)}
                >
                  <CheckCircle2 size={13} strokeWidth={2.5} />
                  Complete
                </button>
                {tab === "all" && (
                  <button
                    style={{ ...btnStyle, background: "var(--status-suspended)18", color: "var(--status-suspended)" }}
                    onClick={() => handleCancel(task.id)}
                  >
                    <XCircle size={13} strokeWidth={2.5} />
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isExpanded && task.description && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: "var(--canvas)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--slate)",
              lineHeight: 1.5,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              whiteSpace: "pre-wrap",
            }}
          >
            {task.description}
          </div>
        )}
      </div>
    );
  };

  /* ─── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-content" style={{ padding: "32px 40px", maxWidth: "1200px", margin: "0 auto" }}>
      <PageHeader title="Tasks" subtitle="Manage and track campaign tasks" />

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--console-border)",
          marginBottom: 24,
        }}
      >
        <button style={tabStyle(tab === "today")} onClick={() => setTab("today")}>
          <Clock size={15} strokeWidth={2.5} />
          Today & Overdue
        </button>
        <button style={tabStyle(tab === "all")} onClick={() => setTab("all")}>
          All Tasks
        </button>
        <button style={tabStyle(tab === "create")} onClick={() => setTab("create")}>
          <Plus size={15} strokeWidth={2.5} />
          Create Task
        </button>
      </div>

      {/* ── Tab: Today & Overdue ──────────────────────────────────────── */}
      {tab === "today" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {overdueTasks.length > 0 && (
            <section>
              <h3
                style={{
                  fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#ef4444",
                  margin: "0 0 8px",
                }}
              >
                Overdue ({overdueTasks.length})
              </h3>
              <div style={cardStyle}>
                {overdueTasks.map((t) => renderTask(t, true))}
                {overdueTasks.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "var(--slate-muted)" }}>
                    No overdue tasks
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <h3
              style={{
                fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 14,
                color: "var(--navy)",
                margin: "0 0 8px",
              }}
            >
              Today's Tasks ({todayTasks.length})
            </h3>
            <div style={cardStyle}>
              {todayTasks.map((t) => renderTask(t))}
              {todayTasks.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "var(--slate-muted)" }}>
                  No tasks due today
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── Tab: All Tasks ────────────────────────────────────────────── */}
      {tab === "all" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <select
              className="select-base"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "8px 32px 8px 12px", fontSize: 13 }}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={cardStyle}>
            {allTasks.map((t) => renderTask(t))}
            {allTasks.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "var(--slate-muted)" }}>
                No tasks found
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Create Task ──────────────────────────────────────────── */}
      {tab === "create" && (
        <div style={{ ...cardStyle, maxWidth: 560 }}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600,
                  color: "var(--navy)",
                }}
              >
                Title <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="input-base"
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                required
                style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}
                placeholder="What needs to be done?"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600,
                  color: "var(--navy)",
                }}
              >
                Description
              </label>
              <textarea
                className="input-base"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: 13, minHeight: 80, resize: "vertical" }}
                placeholder="Optional details..."
              />
            </div>

            <div>
              <label
                style={{
                  display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600,
                  color: "var(--navy)",
                }}
              >
                Due Date
              </label>
              <input
                className="input-base"
                type="date"
                value={createDueDate}
                onChange={(e) => setCreateDueDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label
                  style={{
                    display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600,
                    color: "var(--navy)",
                  }}
                >
                  Person ID (optional)
                </label>
                <input
                  className="input-base"
                  type="text"
                  value={createPersonId}
                  onChange={(e) => setCreatePersonId(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}
                  placeholder="UUID"
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600,
                    color: "var(--navy)",
                  }}
                >
                  Assignee (optional)
                </label>
                <input
                  className="input-base"
                  type="text"
                  value={createAssignee}
                  onChange={(e) => setCreateAssignee(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}
                  placeholder="User name or ID"
                />
              </div>
            </div>

            <div style={{ marginTop: 4 }}>
              <button
                type="submit"
                className="btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Plus size={15} strokeWidth={2.5} />
                Create Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
