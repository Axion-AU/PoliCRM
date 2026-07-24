import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { importApi, type ImportJob } from "../services/api";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(diff / 60_000);
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function jobStatusStyle(s: ImportJob["status"]): { color: string; label: string } {
  return {
    complete: { color: "var(--status-active)",    label: "Complete"  },
    failed:   { color: "var(--status-suspended)", label: "Failed"    },
    running:  { color: "var(--civic-teal)",         label: "Running"   },
    pending:  { color: "var(--slate-muted)",      label: "Pending"   },
  }[s];
}

const MOCK_JOBS: ImportJob[] = [
  {
    id: "j1", source: "nationbuilder", status: "complete",
    records_total: 3226, records_processed: 3194, records_skipped: 32,
    filename: "nationbuilder-export-3226",
    started_at: "2025-11-25T02:00:00Z", completed_at: "2025-11-25T02:18:00Z",
  },
  {
    id: "j2", source: "csv", status: "complete",
    records_total: 3194, records_processed: 3194, records_skipped: 0,
    filename: "nationbuilder-export-3194.csv",
    started_at: "2025-11-25T01:30:00Z", completed_at: "2025-11-25T01:44:00Z",
  },
];

/* ─── NationBuilder form ─────────────────────────────────────────────────── */
function NationBuilderForm({ onJobStarted }: { onJobStarted: (j: ImportJob) => void }) {
  const [slug, setSlug] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !apiKey.trim()) {
      setError("Both fields are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const job = await importApi.startNationBuilder({ slug: slug.trim(), api_key: apiKey.trim() });
      onJobStarted(job);
      setSlug("");
      setApiKey("");
    } catch (err: unknown) {
      console.error("importApi.startNationBuilder failed:", (err instanceof Error ? err.message : err));
      setError("Could not connect to backend. Is the server running?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 8,
            padding: "9px 12px",
            background: "oklch(58% 0.22 25 / 0.08)",
            border: "1px solid oklch(58% 0.22 25 / 0.25)",
            borderRadius: 8,
            fontSize: 12.5,
            color: "oklch(46% 0.18 25)",
            marginBottom: 14,
          }}
        >
          <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label
            htmlFor="nb-slug"
            style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}
          >
            Party Slug
          </label>
          <input
            id="nb-slug"
            className="input-base"
            placeholder="yourparty"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div>
          <label
            htmlFor="nb-api-key"
            style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--slate-muted)", marginBottom: 5 }}
          >
            API Key
          </label>
          <input
            id="nb-api-key"
            type="password"
            className="input-base"
            placeholder="••••••••••••••••"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <button
        type="submit"
        id="nb-import-submit"
        className="btn-primary"
        disabled={submitting}
        style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
      >
        {submitting ? "Starting…" : "Start NationBuilder Import"}
      </button>
    </form>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function Import() {
  const [jobs, setJobs] = useState<ImportJob[]>(MOCK_JOBS);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"csv" | "nationbuilder">("csv");
  const fileRef = useRef<HTMLInputElement>(null);

  // Poll running jobs
  useEffect(() => {
    importApi.list().then(setJobs).catch((err: unknown) => {
      console.error("importApi.list failed:", (err instanceof Error ? err.message : err));
    });
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadError("Only CSV files are supported.");
      return;
    }
    setUploadError(null);
    setSelectedFile(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const job = await importApi.uploadCsv(selectedFile);
      setJobs((prev) => [job, ...prev]);
      setSelectedFile(null);
    } catch (err: unknown) {
      console.error("importApi.uploadCsv failed:", (err instanceof Error ? err.message : err));
      setUploadError("Upload failed. Is the backend running?");
    } finally {
      setUploading(false);
    }
  };

  const addJob = (job: ImportJob) => {
    setJobs((prev) => [job, ...prev]);
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      <PageHeader
        title="Import"
        subtitle="Bring members in from CSV exports or directly from NationBuilder."
      />

      {/* Tab switcher */}
      <div
        style={{
          display: "inline-flex",
          background: "hsl(var(--muted))",
          borderRadius: 10,
          padding: 3,
          marginBottom: 24,
          border: "1px solid var(--console-border)",
        }}
      >
        {(["csv", "nationbuilder"] as const).map((tab) => (
          <button
            key={tab}
            id={`import-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === tab ? "var(--canvas-raised)" : "transparent",
              color: activeTab === tab ? "oklch(19% 0.03 260)" : "var(--slate-muted)",
              boxShadow: activeTab === tab ? "0 1px 3px oklch(19% 0.03 260 / 0.06)" : "none",
              transition: "background-color 150ms ease-out, color 150ms ease-out",
            }}
          >
            {tab === "csv" ? "CSV Upload" : "NationBuilder API"}
          </button>
        ))}
      </div>

      {/* ── CSV tab ───────────────────────────────────────────────────── */}
      {activeTab === "csv" && (
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 16,
            padding: 32,
            marginBottom: 32,
          }}
        >
          {/* Drop zone */}
          <div
            id="csv-dropzone"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--civic-teal)" : "var(--console-border)"}`,
              borderRadius: 12,
              padding: "40px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              cursor: "pointer",
              background: dragOver ? "rgba(13, 148, 136, 0.04)" : "transparent",
              transition: "border-color 150ms ease-out, background-color 150ms ease-out",
              textAlign: "center",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Upload
              size={28}
              strokeWidth={1.5}
              style={{ color: dragOver ? "var(--civic-teal)" : "var(--slate-muted)" }}
            />
            <div>
              <div
                style={{
                  fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 600,
                  fontSize: 15,
                  color: "oklch(22% 0.03 260)",
                  marginBottom: 4,
                }}
              >
                Drop a CSV file here
              </div>
              <div style={{ fontSize: 13, color: "var(--slate-muted)" }}>
                or click to browse — NationBuilder CSV export format supported
              </div>
            </div>
          </div>

          {/* Error */}
          {uploadError && (
            <div
              role="alert"
              style={{
                display: "flex",
                gap: 8,
                padding: "9px 12px",
                background: "oklch(58% 0.22 25 / 0.08)",
                border: "1px solid oklch(58% 0.22 25 / 0.25)",
                borderRadius: 8,
                fontSize: 12.5,
                color: "oklch(46% 0.18 25)",
                marginTop: 14,
              }}
            >
              <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
              {uploadError}
            </div>
          )}

          {/* Selected file */}
          {selectedFile && !uploadError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 16,
                padding: "12px 16px",
                background: "rgba(13, 148, 136, 0.06)",
                border: "1px solid rgba(13, 148, 136, 0.20)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={16} strokeWidth={2} style={{ color: "var(--civic-teal)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(22% 0.03 260)" }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--slate-muted)" }}>
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-ghost"
                  onClick={() => setSelectedFile(null)}
                  style={{ padding: "5px 10px" }}
                >
                  <X size={13} strokeWidth={2} />
                </button>
                <button
                  id="csv-upload-btn"
                  className="btn-primary"
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    opacity: uploading ? 0.7 : 1,
                    cursor: uploading ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "Uploading…" : "Import"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NationBuilder API tab ─────────────────────────────────────── */}
      {activeTab === "nationbuilder" && (
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 16,
            padding: 32,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 20,
              padding: "10px 14px",
              background: "rgba(13, 148, 136, 0.06)",
              border: "1px solid rgba(13, 148, 136, 0.18)",
              borderRadius: 8,
            }}
          >
            <LinkIcon size={13} strokeWidth={2} style={{ color: "var(--civic-teal)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, color: "oklch(38% 0.03 260)", lineHeight: 1.5 }}>
              The importer fetches people in batches of 100 via the NationBuilder v2 API. Large
              databases may take several minutes. Existing records are deduplicated by NationBuilder ID.
            </span>
          </div>
          <NationBuilderForm onJobStarted={addJob} />
        </div>
      )}

      {/* ── Import history ────────────────────────────────────────────── */}
      <h2
        style={{
          fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 16,
          color: "oklch(19% 0.03 260)",
          margin: "0 0 14px",
        }}
      >
        Import History
      </h2>

      <div
        style={{
          background: "var(--canvas-raised)",
          border: "1px solid var(--console-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {jobs.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              fontSize: 13.5,
              color: "var(--slate-muted)",
            }}
          >
            No imports yet. Run your first import above.
          </div>
        ) : (
          <table
            className="data-table"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Source</th>
                <th style={{ textAlign: "left" }}>File / Identifier</th>
                <th style={{ textAlign: "right" }}>Records</th>
                <th style={{ textAlign: "right" }}>Skipped</th>
                <th style={{ textAlign: "left" }}>Duration</th>
                <th style={{ textAlign: "left" }}>Started</th>
                <th style={{ textAlign: "left" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const { color, label } = jobStatusStyle(job.status);
                return (
                  <tr key={job.id}>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--slate-muted)",
                        }}
                      >
                        {job.source === "nationbuilder" ? "NB API" : "CSV"}
                      </span>
                    </td>
                    <td style={{ color: "oklch(22% 0.03 260)", fontWeight: 500 }}>
                      {job.filename ?? "—"}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--slate-muted)" }}>
                      {job.records_processed?.toLocaleString("en-AU") ?? "—"}
                      {job.records_total && job.records_total !== job.records_processed
                        ? ` / ${job.records_total.toLocaleString("en-AU")}`
                        : ""}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--slate-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {job.records_skipped?.toLocaleString("en-AU") ?? "—"}
                    </td>
                    <td style={{ color: "var(--slate-muted)" }}>
                      {formatDuration(job.started_at, job.completed_at)}
                    </td>
                    <td style={{ color: "var(--slate-muted)" }}>
                      {timeAgo(job.started_at)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color,
                        }}
                      >
                        {label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
