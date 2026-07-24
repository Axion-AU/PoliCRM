import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AlertCircle } from "lucide-react";

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/app/dashboard", { replace: true });
    } catch (err: unknown) {
      console.debug("Login attempt failed:", (err instanceof Error ? err.message : err));
      setError("Sign in failed. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--navy)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Form container */}
      <div
        style={{
          width: "100%",
          maxWidth: 400,
        }}
      >
        {/* Wordmark */}
        <div style={{ marginBottom: 36, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              textDecoration: "none",
            }}
          >
            <img
              src="/policrm-logo-transparent.png"
              alt="PoliCRM Logo"
              style={{ width: 32, height: 32, objectFit: "contain" }}
            />
            {/* Wordmark: IBM Plex Mono Medium uppercase tracked 0.08em — brand spec */}
            <span
              style={{
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 18,
                color: "#e2e8f0",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              PoliCRM
            </span>
          </Link>
          <div
            style={{
              marginTop: 10,
              fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
              fontSize: 13,
              fontWeight: 300,
              color: "#475569",
            }}
          >
            Sign in to your operations console
          </div>
        </div>

        {/* Form card */}
        <div
          style={{
            background: "var(--canvas-raised)",
            border: "1px solid var(--console-border)",
            borderRadius: 16,
            padding: "32px",
          }}
        >
          <form onSubmit={handleSubmit} noValidate>
            {/* Error message */}
            {error && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 14px",
                  background: "oklch(58% 0.22 25 / 0.08)",
                  border: "1px solid oklch(58% 0.22 25 / 0.25)",
                  borderRadius: 8,
                  marginBottom: 20,
                  fontSize: 13,
                  color: "oklch(46% 0.18 25)",
                }}
              >
                <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--slate-muted)",
                  marginBottom: 6,
                }}
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input-base"
                placeholder="you@party.org.au"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--slate-muted)",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              id="login-submit"
              disabled={submitting}
              className="btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                fontSize: 14,
                padding: "11px 0",
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? (
                <>
                  <span
                    className="animate-spin-slow"
                    style={{ display: "inline-block", width: 14, height: 14 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </span>
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link
            to="/"
            style={{
              fontFamily: "'IBM Plex Sans', ui-sans-serif, sans-serif",
              fontSize: 12.5,
              fontWeight: 300,
              color: "#475569",
              transition: "color 200ms ease-out",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "#2dd4bf";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "#475569";
            }}
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
