import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  Edit3,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { branchesApi, type Branch } from "../services/api";

const BRANCH_TYPES = ["national", "state", "branch", "team"] as const;

const TYPE_BADGE_COLORS: Record<string, { color: string; bg: string }> = {
  national: { color: "#e11d48", bg: "rgba(225,29,72,0.1)" },
  state:    { color: "#0d9488", bg: "rgba(13,148,136,0.1)" },
  branch:   { color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
  team:     { color: "#d97706", bg: "rgba(217,119,6,0.1)" },
};

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_BADGE_COLORS[type] ?? { color: "#64748b", bg: "rgba(100,116,139,0.1)" };
  return (
    <span className="badge" style={{ color: style.color, background: style.bg }}>
      {type}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AdminBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState("branch");
  const [createParent, setCreateParent] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit form
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await branchesApi.list();
      setBranches(b);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await branchesApi.create({
        name: createName.trim(),
        type: createType,
        parent_id: createParent || undefined,
      });
      setCreateName("");
      setCreateType("branch");
      setCreateParent("");
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create branch");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(id);
    try {
      await branchesApi.update(id, { name: editName.trim() });
      setBranches((prev) =>
        prev.map((b) => (b.id === id ? { ...b, name: editName.trim() } : b)),
      );
      setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update branch");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this branch? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await branchesApi.del(id);
      setBranches((prev) => prev.filter((b) => b.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete branch");
    } finally {
      setDeleting(null);
    }
  };

  // Group branches by type
  const grouped = BRANCH_TYPES.map((t) => ({
    type: t,
    branches: branches.filter((b) => b.type === t),
  }));

  if (loading) {
    return (
      <div style={{ padding: "32px 40px" }}>
        <PageHeader title="Admin — Branches" subtitle="Manage organisational structure" />
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} className="animate-spin-slow" style={{ color: "var(--civic-teal)" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <PageHeader
        title="Admin — Branches"
        subtitle={`${branches.length} branch${branches.length !== 1 ? "es" : ""} across ${BRANCH_TYPES.length} tiers`}
        action={
          <button
            className="btn-primary"
            onClick={() => setShowCreate((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} strokeWidth={2} />
            {showCreate ? "Cancel" : "Create Branch"}
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
            New Branch
          </div>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  className="input-base"
                  placeholder="Branch name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Type</label>
                <select
                  className="select-base"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {BRANCH_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Parent</label>
                <select
                  className="select-base"
                  value={createParent}
                  onChange={(e) => setCreateParent(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">No parent (top-level)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
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
                disabled={creating || !createName.trim()}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {creating && <Loader2 size={13} className="animate-spin-slow" />}
                {creating ? "Creating…" : "Create Branch"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tree by type */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {grouped
          .filter((g) => g.branches.length > 0)
          .map(({ type, branches: typeBranches }) => (
            <BranchGroup
              key={type}
              type={type}
              branches={typeBranches}
              allBranches={branches}
              editingId={editingId}
              editName={editName}
              setEditName={setEditName}
              setEditingId={setEditingId}
              saving={saving}
              deleting={deleting}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onStartEdit={(id, name) => {
                setEditingId(id);
                setEditName(name);
              }}
            />
          ))}

        {branches.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: 60,
              color: "var(--slate-muted)",
              fontSize: 13.5,
              background: "var(--canvas-raised)",
              border: "1px solid var(--seam)",
              borderRadius: 12,
            }}
          >
            No branches yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function BranchGroup({
  type,
  branches,
  allBranches,
  editingId,
  editName,
  setEditName,
  setEditingId,
  saving,
  deleting,
  onUpdate,
  onDelete,
  onStartEdit,
}: {
  type: string;
  branches: Branch[];
  allBranches: Branch[];
  editingId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  setEditingId: (v: string | null) => void;
  saving: string | null;
  deleting: string | null;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (id: string, name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const getParentName = (parentId?: string) => {
    if (!parentId) return null;
    return allBranches.find((b) => b.id === parentId)?.name ?? "Unknown";
  };

  const style = TYPE_BADGE_COLORS[type] ?? { color: "#64748b", bg: "rgba(100,116,139,0.1)" };

  return (
    <div
      style={{
        background: "var(--canvas-raised)",
        border: "1px solid var(--seam)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Group header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{
          padding: "14px 20px",
          borderBottom: collapsed ? "none" : "1px solid var(--seam)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {collapsed ? (
          <ChevronRight size={14} style={{ color: "var(--slate-faint)", flexShrink: 0 }} />
        ) : (
          <ChevronDown size={14} style={{ color: "var(--slate-faint)", flexShrink: 0 }} />
        )}
        <span className="badge" style={{ color: style.color, background: style.bg }}>
          {type}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--slate-mid)" }}>
          {branches.length} {branches.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Branch rows */}
      {!collapsed && (
        <div style={{ padding: 0 }}>
          {branches.map((b) => {
            const isEditing = editingId === b.id;
            const parentName = getParentName(b.parent_id);

            return (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--mist)",
                }}
              >
                {/* Indent based on depth (crude: branch/team deeper) */}
                <div style={{ width: b.type === "branch" || b.type === "team" ? 20 : 0, flexShrink: 0 }} />

                {/* Type icon */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: style.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 500, color: style.color, textTransform: "uppercase" }}>
                    {type[0]}
                  </span>
                </div>

                {/* Name / edit */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        className="input-base"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ fontSize: 13, padding: "5px 10px", width: 240 }}
                        autoFocus
                      />
                      <button
                        className="btn-primary"
                        disabled={saving === b.id || !editName.trim()}
                        onClick={() => onUpdate(b.id)}
                        style={{ fontSize: 11, padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {saving === b.id ? (
                          <Loader2 size={10} className="animate-spin-slow" />
                        ) : (
                          <Save size={11} />
                        )}
                        Save
                      </button>
                      <button
                        className="btn-primary"
                        onClick={() => setEditingId(null)}
                        style={{
                          fontSize: 11,
                          padding: "5px 10px",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          background: "transparent",
                          color: "var(--slate-muted)",
                          border: "1px solid var(--seam)",
                        }}
                      >
                        <X size={11} />
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontWeight: 500, fontSize: 13.5, color: "oklch(22% 0.03 260)" }}>
                        {b.name}
                      </span>
                      {parentName && (
                        <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--slate-faint)" }}>
                          under {parentName}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Created date */}
                <span style={{ fontSize: 11.5, color: "var(--slate-faint)", whiteSpace: "nowrap", display: isEditing ? "none" : undefined }}>
                  {fmtDate(b.created_at)}
                </span>

                {/* Actions */}
                {!isEditing && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      className="btn-primary"
                      onClick={() => onStartEdit(b.id, b.name)}
                      style={{
                        fontSize: 11,
                        padding: "5px 8px",
                        background: "transparent",
                        color: "var(--slate-muted)",
                        border: "1px solid var(--seam)",
                      }}
                      title="Edit name"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      className="btn-primary"
                      disabled={deleting === b.id}
                      onClick={() => onDelete(b.id)}
                      style={{
                        fontSize: 11,
                        padding: "5px 8px",
                        background: "rgba(225,29,72,0.1)",
                        color: "var(--status-flagged)",
                        border: "1px solid rgba(225,29,72,0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Delete branch"
                    >
                      {deleting === b.id ? (
                        <Loader2 size={11} className="animate-spin-slow" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      {deleting === b.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
