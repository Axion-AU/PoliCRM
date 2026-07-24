import { useState, useRef } from "react";
import {
  ScrollText,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  Info,
  Shield,
  FileText,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type UploadStatus = "idle" | "uploading" | "parsing" | "complete" | "error";

interface EraUploadRecord {
  id: number;
  filename: string;
  state: string | null;
  record_count: number;
  status: "pending" | "parsing" | "complete" | "error";
  error_message: string | null;
  uploaded_at: string;
}

/* ─── Mock upload history ────────────────────────────────────────────────── */
const MOCK_UPLOADS: EraUploadRecord[] = [
  {
    id: 1,
    filename: "ERA_VIC_2025.txt",
    state: "VIC",
    record_count: 4_312_088,
    status: "complete",
    error_message: null,
    uploaded_at: "2026-05-15T09:22:00Z",
  },
  {
    id: 2,
    filename: "ERA_NSW_2025.txt",
    state: "NSW",
    record_count: 5_891_234,
    status: "complete",
    error_message: null,
    uploaded_at: "2026-05-15T10:44:00Z",
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCount(n: number) {
  return n.toLocaleString("en-AU");
}

function StatusBadge({ status }: { status: EraUploadRecord["status"] }) {
  const map = {
    pending:  { label: "Pending",  color: "var(--status-pending)",  bg: "rgba(217,119,6,0.1)",  icon: Clock },
    parsing:  { label: "Parsing",  color: "#6366f1",                bg: "rgba(99,102,241,0.1)", icon: Loader2 },
    complete: { label: "Complete", color: "var(--status-active)",   bg: "rgba(13,148,136,0.1)", icon: CheckCircle2 },
    error:    { label: "Error",    color: "var(--status-flagged)",  bg: "rgba(225,29,72,0.1)",  icon: AlertCircle },
  } as const;
  const { label, color, bg, icon: Icon } = map[status];

  return (
    <span
      className="badge"
      style={{ color, background: bg, gap: 4 }}
    >
      <Icon size={9} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      {label}
    </span>
  );
}

/* ─── ERA Info callout ───────────────────────────────────────────────────── */
function EraInfoCallout() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      style={{
        background: "rgba(13,148,136,0.06)",
        border: "1px solid rgba(13,148,136,0.2)",
        borderRadius: 10,
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        marginBottom: 24,
        position: "relative",
      }}
    >
      <Info size={15} style={{ color: "var(--civic-teal)", flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--slate)", marginBottom: 4 }}>
          About Electoral Roll Access (ERA)
        </div>
        <div style={{ fontSize: 12.5, color: "var(--slate-mid)", lineHeight: 1.6 }}>
          ERA is a direct feed of the Australian electoral roll, issued by the AEC to registered
          political parties under strict access conditions. ERA files are managed by your party's
          designated custodian.{" "}
          <strong style={{ color: "var(--slate)", fontWeight: 500 }}>
            ERA data is processed locally and never transmitted externally.
          </strong>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--slate-faint)", flexShrink: 0 }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ─── Drop zone ──────────────────────────────────────────────────────────── */
interface DropZoneProps {
  onFile: (f: File) => void;
  status: UploadStatus;
  filename: string | null;
  progress: number;
}

function DropZone({ onFile, status, filename, progress }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".txt")) onFile(f);
  };

  const isActive = status === "uploading" || status === "parsing";

  return (
    <div
      role="button"
      tabIndex={0}
      id="era-drop-zone"
      aria-label="Upload ERA .txt file"
      onClick={() => !isActive && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !isActive && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? "var(--civic-teal)" : "var(--seam)"}`,
        borderRadius: 12,
        padding: "40px 32px",
        textAlign: "center",
        cursor: isActive ? "default" : "pointer",
        background: dragging ? "var(--teal-wash)" : "var(--canvas-raised)",
        transition: "border-color 150ms ease-out, background 150ms ease-out",
        userSelect: "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {/* Idle */}
      {status === "idle" && (
        <>
          <div style={{
            width: 48, height: 48,
            background: "var(--teal-wash)",
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <Upload size={20} strokeWidth={1.8} style={{ color: "var(--civic-teal)" }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--slate)", marginBottom: 6 }}>
            Drop your ERA <code style={{ fontSize: 12 }}>.txt</code> file here
          </div>
          <div style={{ fontSize: 12.5, color: "var(--slate-muted)" }}>
            or <span style={{ color: "var(--civic-teal)", fontWeight: 500 }}>browse to select</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--slate-faint)", fontFamily: "'IBM Plex Mono', monospace" }}>
            Tab-separated AEC ERA format • any file size
          </div>
        </>
      )}

      {/* Uploading */}
      {status === "uploading" && (
        <>
          <Loader2 size={28} strokeWidth={1.8} style={{ color: "var(--civic-teal)", animation: "spin 1s linear infinite", margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--slate)", marginBottom: 6 }}>
            Uploading {filename}…
          </div>
          <ProgressBar value={progress} />
        </>
      )}

      {/* Parsing */}
      {status === "parsing" && (
        <>
          <Loader2 size={28} strokeWidth={1.8} style={{ color: "#6366f1", animation: "spin 1s linear infinite", margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--slate)", marginBottom: 4 }}>
            Parsing ERA records…
          </div>
          <div style={{ fontSize: 12, color: "var(--slate-muted)" }}>
            This runs in the background — you can navigate away.
          </div>
          <ProgressBar value={progress} indeterminate />
        </>
      )}

      {/* Complete */}
      {status === "complete" && (
        <>
          <CheckCircle2 size={28} strokeWidth={1.8} style={{ color: "var(--civic-teal)", margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--civic-teal)", marginBottom: 4 }}>
            Import complete
          </div>
          <div style={{ fontSize: 12, color: "var(--slate-muted)" }}>
            {filename} was successfully imported.
          </div>
          <button
            className="btn-primary"
            onClick={(e) => { e.stopPropagation(); }}
            style={{ marginTop: 14, fontSize: 12.5, padding: "7px 16px" }}
          >
            Import another file
          </button>
        </>
      )}

      {/* Error */}
      {status === "error" && (
        <>
          <AlertCircle size={28} strokeWidth={1.8} style={{ color: "var(--status-flagged)", margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--status-flagged)", marginBottom: 4 }}>
            Import failed
          </div>
          <div style={{ fontSize: 12, color: "var(--slate-muted)" }}>
            {filename} could not be parsed. Check the file format and try again.
          </div>
          <button
            className="btn-primary"
            onClick={(e) => { e.stopPropagation(); }}
            style={{ marginTop: 14, fontSize: 12.5, padding: "7px 16px" }}
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}

function ProgressBar({ value, indeterminate = false }: { value: number; indeterminate?: boolean }) {
  return (
    <div style={{
      height: 4,
      borderRadius: 2,
      background: "var(--mist)",
      marginTop: 14,
      overflow: "hidden",
      maxWidth: 240,
      margin: "14px auto 0",
    }}>
      <div
        style={{
          height: "100%",
          background: "var(--civic-teal)",
          borderRadius: 2,
          width: indeterminate ? "40%" : `${value}%`,
          transition: indeterminate ? "none" : "width 300ms ease-out",
          animation: indeterminate ? "indeterminate-slide 1.4s ease-in-out infinite" : "none",
        }}
      />
    </div>
  );
}

/* ─── Upload history table ───────────────────────────────────────────────── */
function UploadHistory({ uploads }: { uploads: EraUploadRecord[] }) {
  if (uploads.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--slate-muted)", fontSize: 13 }}>
        No ERA files imported yet.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>File</th>
            <th style={{ textAlign: "left" }}>State</th>
            <th style={{ textAlign: "right" }}>Records</th>
            <th style={{ textAlign: "left" }}>Imported</th>
            <th style={{ textAlign: "left" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((u) => (
            <tr key={u.id}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={13} style={{ color: "var(--slate-faint)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "var(--slate-mid)" }}>
                    {u.filename}
                  </span>
                </div>
              </td>
              <td>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--slate-muted)" }}>
                  {u.state ?? "—"}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "var(--slate-mid)", fontWeight: 500 }}>
                  {fmtCount(u.record_count)}
                </span>
              </td>
              <td style={{ color: "var(--slate-muted)", fontSize: 12.5 }}>
                {fmtDate(u.uploaded_at)}
              </td>
              <td>
                <StatusBadge status={u.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Settings section wrapper ───────────────────────────────────────────── */
function SettingsSection({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--canvas-raised)",
        border: "1px solid var(--seam)",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      {/* Section header */}
      <div
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid var(--seam)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--teal-wash)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={15} strokeWidth={2} style={{ color: "var(--civic-teal)" }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--slate)", fontFamily: "'Sora', ui-sans-serif, sans-serif" }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: "var(--slate-muted)", marginTop: 1 }}>
            {subtitle}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Comparison table ───────────────────────────────────────────────────── */
function EraComparisonTable() {
  const rows = [
    { label: "Speed",                    era: "Fast (local lookup)",   aec: "Slow (1–3s per record)" },
    { label: "Rate limits",              era: "None",                  aec: "Yes, strict" },
    { label: "CAPTCHA risk",             era: "None",                  aec: "Present" },
    { label: "Requires AEC agreement",   era: "Yes",                   aec: "No" },
    { label: "Data freshness",           era: "As of roll extract",    aec: "Live" },
    { label: "Compliance position",      era: "Sanctioned",            aec: "Gray area" },
  ];

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "8px 12px", background: "var(--mist)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate-muted)", fontWeight: 500, borderBottom: "1px solid var(--seam)" }}></th>
          <th style={{ textAlign: "left", padding: "8px 12px", background: "rgba(13,148,136,0.06)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--civic-teal)", fontWeight: 500, borderBottom: "1px solid rgba(13,148,136,0.15)" }}>ERA (local)</th>
          <th style={{ textAlign: "left", padding: "8px 12px", background: "var(--mist)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--slate-muted)", fontWeight: 500, borderBottom: "1px solid var(--seam)" }}>AEC automation</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} style={{ background: i % 2 === 0 ? "transparent" : "var(--mist)" }}>
            <td style={{ padding: "9px 12px", fontWeight: 500, color: "var(--slate-mid)", borderBottom: "1px solid var(--seam)" }}>{r.label}</td>
            <td style={{ padding: "9px 12px", color: "var(--civic-teal)", fontWeight: 500, borderBottom: "1px solid var(--seam)", background: "rgba(13,148,136,0.04)" }}>{r.era}</td>
            <td style={{ padding: "9px 12px", color: "var(--slate-muted)", borderBottom: "1px solid var(--seam)" }}>{r.aec}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Main Settings Page ─────────────────────────────────────────────────── */
export default function Settings() {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);
  const [uploads, setUploads] = useState<EraUploadRecord[]>(MOCK_UPLOADS);
  const [activeTab, setActiveTab] = useState<"electoral-roll" | "system">("electoral-roll");

  /* Simulate file import (no backend yet) */
  const handleFile = (file: File) => {
    setUploadFilename(file.name);
    setUploadStatus("uploading");
    setUploadProgress(0);

    // Simulate upload progress
    let p = 0;
    const uploadInterval = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 100) {
        p = 100;
        clearInterval(uploadInterval);
        setUploadProgress(100);

        setTimeout(() => {
          setUploadStatus("parsing");

          // Simulate parsing completion after delay
          setTimeout(() => {
            setUploadStatus("complete");
            setUploads((prev) => [
              {
                id: Date.now(),
                filename: file.name,
                state: file.name.split("_").slice(-1)[0]?.replace(".txt", "").slice(0, 3) ?? null,
                record_count: 0,
                status: "complete",
                error_message: null,
                uploaded_at: new Date().toISOString(),
              },
              ...prev,
            ]);
          }, 3000);
        }, 400);
      }
      setUploadProgress(Math.min(p, 100));
    }, 120);
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <PageHeader
        title="Settings"
        subtitle="Configure electoral roll data, system preferences, and integrations"
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
        {(
          [
            { id: "electoral-roll", label: "Electoral Roll", icon: ScrollText },
            { id: "system",         label: "System",         icon: Shield },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            id={`settings-tab-${id}`}
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
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Electoral Roll tab ─────────────────────────────────────────────── */}
      {activeTab === "electoral-roll" && (
        <>
          <EraInfoCallout />

          {/* Import ERA file */}
          <SettingsSection
            icon={Upload}
            title="Import ERA File"
            subtitle="Upload an AEC-issued Electoral Roll Access .txt file to enable local matching"
          >
            <DropZone
              onFile={handleFile}
              status={uploadStatus}
              filename={uploadFilename}
              progress={uploadProgress}
            />
          </SettingsSection>

          {/* Upload history */}
          <SettingsSection
            icon={Clock}
            title="Import History"
            subtitle="Previously imported ERA files and their processing status"
          >
            <UploadHistory uploads={uploads} />
          </SettingsSection>

          {/* ERA vs AEC comparison */}
          <SettingsSection
            icon={ScrollText}
            title="ERA vs AEC Automation"
            subtitle="Comparison of the two verification methods available in PoliCRM"
          >
            <EraComparisonTable />
            <div
              style={{
                marginTop: 16,
                padding: "10px 14px",
                background: "rgba(217,119,6,0.06)",
                border: "1px solid rgba(217,119,6,0.2)",
                borderRadius: 8,
                fontSize: 12.5,
                color: "var(--slate-mid)",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <AlertCircle size={13} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong style={{ fontWeight: 500, color: "var(--slate)" }}>Use ERA when available.</strong>{" "}
                The AEC automation method carries compliance risk. If you don't have an ERA file, contact your
                party's state or national secretary.
              </span>
            </div>
          </SettingsSection>
        </>
      )}

      {/* ── System tab ─────────────────────────────────────────────────────── */}
      {activeTab === "system" && (
        <SettingsSection
          icon={Shield}
          title="System"
          subtitle="Application configuration and preferences"
        >
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--slate-muted)",
              fontSize: 13,
            }}
          >
            <ChevronRight size={20} style={{ margin: "0 auto 10px", display: "block", color: "var(--slate-faint)" }} />
            System settings coming soon.
          </div>
        </SettingsSection>
      )}
    </div>
  );
}
