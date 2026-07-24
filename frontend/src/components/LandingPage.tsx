import { Link } from "react-router-dom";
import { ArrowRight, Users, Map, FileText } from "lucide-react";

/* ─── Feature definitions ────────────────────────────────────────────────── */
const FEATURES = [
  {
    num: "01",
    icon: Users,
    title: "The Person Graph",
    body: "A unified record for every person, regardless of where they came from. NationBuilder imports, manual additions, and future integrations all resolve to a single identity. No duplicates. No guessing.",
  },
  {
    num: "02",
    icon: Map,
    title: "Electoral Intelligence",
    body: "Visualise your membership density across every federal electorate. Identify where you're strong, where you're growing, and where the next campaign effort should land.",
  },
  {
    num: "03",
    icon: FileText,
    title: "Compliance-Ready Data",
    body: "Member counts by division, full audit trails, and structured exports built to meet Australian Electoral Commission return requirements. Ready when the deadline isn't.",
  },
] as const;

/* ─── Component ──────────────────────────────────────────────────────────── */
export function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--navy)",
        color: "#cbd5e1",
        fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
        fontWeight: 300,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 48px",
          borderBottom: "1px solid var(--navy-border)",
          position: "sticky",
          top: 0,
          background: "var(--navy)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/policrm-logo-transparent.png"
            alt="PoliCRM Logo"
            style={{ width: 26, height: 26, objectFit: "contain" }}
          />
          {/* Wordmark: IBM Plex Mono Medium, uppercase, tracked 0.08em — brand spec */}
          <span
            style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontWeight: 500,
              fontSize: 14,
              color: "#e2e8f0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            PoliCRM
          </span>
        </div>

        <Link
          to="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
            fontSize: 13,
            fontWeight: 400,
            color: "#2dd4bf",
            padding: "7px 16px",
            borderRadius: 6,
            border: "1px solid rgba(13, 148, 136, 0.35)",
            transition: "background-color 200ms ease-out, border-color 200ms ease-out",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "rgba(13, 148, 136, 0.10)";
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13, 148, 136, 0.55)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13, 148, 136, 0.35)";
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background =
              "oklch(52% 0.22 260 / 0.12)";
            (e.currentTarget as HTMLAnchorElement).style.borderColor =
              "oklch(52% 0.22 260 / 0.6)";
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
            (e.currentTarget as HTMLAnchorElement).style.borderColor =
              "oklch(52% 0.22 260 / 0.35)";
          }}
        >
          Sign In
        </Link>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 48px 80px",
          maxWidth: 840,
        }}
      >
        {/* Eyebrow: IBM Plex Mono per data label convention */}
        <div
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#475569",
            marginBottom: 24,
          }}
        >
          Australian Political Operations Platform
        </div>

        {/* Headline: Sora SemiBold — brand display font */}
        <h1
          style={{
            fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "clamp(36px, 5.5vw, 60px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#f1f5f9",
            margin: "0 0 28px",
            maxWidth: "16ch",
          }}
        >
          Member management built for people trying to win.
        </h1>

        <p
          style={{
            fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
            fontSize: 16,
            fontWeight: 300,
            lineHeight: 1.7,
            color: "#64748b",
            maxWidth: "58ch",
            margin: "0 0 44px",
          }}
        >
          PoliCRM replaces disconnected spreadsheets and ageing platforms with a
          modern, secure foundation built specifically for Australian parties.
          One system for your members, your interactions, and your data obligations.
        </p>

        <Link
          to="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--civic-teal)",
            color: "#ffffff",
            fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
            fontWeight: 500,
            fontSize: 14,
            padding: "12px 24px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            textDecoration: "none",
            transition: "background-color 200ms ease-out",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--civic-teal-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--civic-teal)"; }}
        >
          Open the Console
          <ArrowRight size={16} strokeWidth={2} />
        </Link>
      </section>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 1,
          background: "var(--navy-border)",
          margin: "0 48px",
        }}
      />

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section style={{ padding: "0 48px 80px", flex: 1 }}>
        {FEATURES.map(({ num, icon: Icon, title, body }, i) => (
          <div key={num}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "64px 1fr",
                gap: "0 40px",
                padding: "52px 0",
                alignItems: "start",
              }}
            >
              {/* Number: IBM Plex Mono */}
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontWeight: 400,
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  color: "#334155",
                  paddingTop: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {num}
              </div>

              {/* Content */}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  {/* Action icons: monochrome Slate Mid, 16px, 1.5px stroke — brand spec */}
                  <Icon
                    size={16}
                    strokeWidth={1.5}
                    style={{ color: "#64748b", flexShrink: 0 }}
                  />
                  {/* Section header: Sora SemiBold 600, 20-28px */}
                  <h2
                    style={{
                      fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
                      fontWeight: 600,
                      fontSize: 22,
                      color: "#f1f5f9",
                      margin: 0,
                    }}
                  >
                    {title}
                  </h2>
                </div>
                <p
                  style={{
                    fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
                    fontSize: 15,
                    fontWeight: 300,
                    lineHeight: 1.7,
                    color: "#64748b",
                    margin: 0,
                    maxWidth: "60ch",
                  }}
                >
                  {body}
                </p>
              </div>
            </div>

            {/* Row divider — not after last item */}
            {i < FEATURES.length - 1 && (
              <div style={{ height: 1, background: "var(--navy-border)" }} />
            )}
          </div>
        ))}
      </section>

      {/* ── CTA strip ───────────────────────────────────────────────────── */}
      <section
        style={{
          borderTop: "1px solid var(--navy-border)",
          padding: "56px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif",
              fontWeight: 600,
              fontSize: 22,
              color: "#f1f5f9",
              marginBottom: 8,
            }}
          >
            Ready to get started?
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
              fontSize: 14,
              fontWeight: 300,
              color: "#475569",
            }}
          >
            Sign in to access your party's operations console.
          </div>
        </div>

        <Link
          to="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: "var(--civic-teal)",
            color: "#ffffff",
            fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
            fontWeight: 500,
            fontSize: 14,
            padding: "11px 22px",
            borderRadius: 6,
            textDecoration: "none",
            transition: "background-color 200ms ease-out",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--civic-teal-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--civic-teal)"; }}
        >
          Open the Console
          <ArrowRight size={15} strokeWidth={2} />
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--navy-border)",
          padding: "16px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Wordmark: IBM Plex Mono uppercase */}
        <span
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontWeight: 500,
            fontSize: 12,
            color: "#334155",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          PoliCRM
        </span>

        {/* Attribution: "An Axion Ventures project" — IBM Plex Mono 11px Slate Faint */}
        <a
          href="https://axionventures.com.au"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 11,
            fontWeight: 400,
            color: "#94a3b8",
            textDecoration: "none",
            transition: "color 200ms ease-out",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#cbd5e1"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8"; }}
        >
          An Axion Ventures project
        </a>
      </footer>
    </div>
  );
}
