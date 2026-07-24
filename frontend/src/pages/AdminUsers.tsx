import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Loader2,
  CheckCircle2,
  UserX,
  Shield,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import {
  usersApi,
  branchesApi,
  type UserRecord,
  type Branch,
} from "../services/api";

const ROLES = ["sys_admin", "organiser", "volunteer", "read_only"] as const;

const ROLE_BADGE_COLORS: Record<string, { color: string; bg: string }> = {
  sys_admin:  { color: "#e11d48", bg: "rgba(225,29,72,0.1)" },
  organiser:  { color: "#0d9488", bg: "rgba(13,148,136,0.1)" },
  volunteer:  { color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
  read_only:  { color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_BADGE_COLORS[role] ?? { color: "#64748b", bg: "rgba(100,116,139,0.1)" };
  return (
    <span className="badge" style={{ color: style.color, background: style.bg }}>
      {role.replace("_", " ")}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("volunteer");
  const [createBranch, setCreateBranch] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, b] = await Promise.all([usersApi.list(), branchesApi.list()]);
      setUsers(u);
      setBranches(b);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createEmail.trim()) return;
    setCreating(true);
    try {
      await usersApi.create({
        email: createEmail.trim(),
        name: createName.trim(),
        role: createRole,
        branch_id: createBranch || undefined,
      });
      setCreateName("");
      setCreateEmail("");
      setCreateRole("volunteer");
      setCreateBranch("");
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleUpdate = async (id: string, role: string) => {
    setSaving(id);
    try {
      await usersApi.update(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      setExpandedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(null);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setSaving(id);
    try {
      await usersApi.update(id, { is_active: !isActive });
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, is_active: !isActive } : u)),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to toggle status");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "32px 40px" }}>
        <PageHeader title="Admin — Users" subtitle="Manage system users" />
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} className="animate-spin-slow" style={{ color: "var(--civic-teal)" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Admin — Users"
        subtitle={`${users.length} user${users.length !== 1 ? "s" : ""} registered`}
        action={
          <button
            className="btn-primary"
            onClick={() => setShowCreate((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} strokeWidth={2} />
            {showCreate ? "Cancel" : "Create User"}
          </button>
        }
      />

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(225,29,72,0.06)",
            border: "1px solid rgba(225,29,72,0.2)",
            borderRadius: 8,
            fontSize: 12.5,
            color: "var(--status-flagged)",
            marginBottom: 20,
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "inherit", textDecoration: "underline", fontSize: 12 }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--seam)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--slate)", fontFamily: "'Sora', sans-serif", marginBottom: 16 }}>
            New User
          </div>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  className="input-base"
                  placeholder="Full name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  className="input-base"
                  type="email"
                  placeholder="user@example.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <select
                  className="select-base"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Branch</label>
                <select
                  className="select-base"
                  value={createBranch}
                  onChange={(e) => setCreateBranch(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">No branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowCreate(false)}
                style={{ background: "transparent", color: "var(--slate-muted)", border: "1px solid var(--seam)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={creating || !createName.trim() || !createEmail.trim()}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {creating && <Loader2 size={13} className="animate-spin-slow" />}
                {creating ? "Creating…" : "Create User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div
        style={{
          background: "var(--canvas-raised)",
          border: "1px solid var(--seam)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "left" }}>Role</th>
              <th style={{ textAlign: "left" }}>Branch</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Created</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "40px 16px", color: "var(--slate-muted)" }}>
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <>
                  <tr
                    key={u.id}
                    className="animate-fade-in"
                    onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <span style={{ fontWeight: 500, color: "oklch(22% 0.03 260)" }}>
                        {u.name}
                      </span>
                    </td>
                    <td style={{ color: "var(--slate-muted)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
                      {u.email}
                    </td>
                    <td><RoleBadge role={u.role} /></td>
                    <td style={{ color: "var(--slate-muted)" }}>
                      {u.branch_name ?? "—"}
                    </td>
                    <td>
                      {u.is_active ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--status-active)", fontSize: 12 }}>
                          <CheckCircle2 size={11} strokeWidth={2.5} />
                          Active
                        </span>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--slate-faint)", fontSize: 12 }}>
                          <UserX size={11} strokeWidth={2.5} />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--slate-faint)", fontSize: 12 }}>
                      {fmtDate(u.created_at)}
                    </td>
                    <td>
                      {expandedId === u.id ? (
                        <ChevronDown size={14} style={{ color: "var(--slate-faint)" }} />
                      ) : (
                        <ChevronRight size={14} style={{ color: "var(--slate-faint)" }} />
                      )}
                    </td>
                  </tr>
                  {expandedId === u.id && (
                    <tr key={`${u.id}-edit`}>
                      <td colSpan={7} style={{ padding: "12px 16px 16px", background: "var(--mist)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                          {/* Role edit */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Shield size={13} style={{ color: "var(--slate-faint)" }} />
                            <select
                              className="select-base"
                              value={editRole || u.role}
                              onChange={(e) => setEditRole(e.target.value)}
                              style={{ fontSize: 12, padding: "5px 28px 5px 8px", width: 140 }}
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>{r.replace("_", " ")}</option>
                              ))}
                            </select>
                            <button
                              className="btn-primary"
                              disabled={saving === u.id || editRole === u.role || !editRole}
                              onClick={(e) => { e.stopPropagation(); handleRoleUpdate(u.id, editRole || u.role); }}
                              style={{ fontSize: 12, padding: "5px 12px", display: "flex", alignItems: "center", gap: 4 }}
                            >
                              {saving === u.id ? <Loader2 size={11} className="animate-spin-slow" /> : null}
                              Update Role
                            </button>
                          </div>

                          {/* Toggle active */}
                          <button
                            className="btn-primary"
                            disabled={saving === u.id}
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(u.id, u.is_active); }}
                            style={{
                              fontSize: 12,
                              padding: "5px 12px",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              background: u.is_active ? "rgba(225,29,72,0.1)" : "var(--civic-teal)",
                              color: u.is_active ? "var(--status-flagged)" : "#fff",
                              border: u.is_active ? "1px solid rgba(225,29,72,0.2)" : "none",
                            }}
                          >
                            {saving === u.id ? (
                              <Loader2 size={11} className="animate-spin-slow" />
                            ) : u.is_active ? (
                              <UserX size={11} />
                            ) : (
                              <CheckCircle2 size={11} />
                            )}
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--slate-muted)",
  marginBottom: 4,
  fontFamily: "'IBM Plex Sans', sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
