import { useEffect, useState } from "react";
import { X, Mail, Phone, MapPin, Shield, Calendar, User, Tag, AlertTriangle } from "lucide-react";
import { personsApi, type Person } from "../services/api";
import { MembershipBadge, type MembershipStatus } from "./MembershipBadge";

interface CheckResult {
  result: string;
  federal_division?: string;
  state_division?: string;
  local_government?: string;
  local_ward?: string;
  timestamp: string;
}

interface MemberNote {
  id: number;
  note: string;
  created_by: string;
  created_at: string;
}

interface MemberTag {
  id: number;
  name: string;
  color: string;
  description?: string;
}

// Extend Person interface to capture detailed backend response
interface MemberDetail extends Person {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  phone?: string;
  mobile?: string;
  primary_address1?: string;
  primary_address2?: string;
  primary_address3?: string;
  primary_city?: string;
  primary_country_code?: string;
  membership_status?: string;
  membership_type?: string;
  join_date?: string;
  renewal_date?: string;
  resignation_date?: string;
  is_duplicate?: boolean;
  check_results?: CheckResult[];
  notes?: MemberNote[];
  tags?: MemberTag[];
}

interface MemberDetailDrawerProps {
  memberId: string | null;
  onClose: () => void;
  // Fallback data from list view in case the detailed get fails (e.g., in offline fallback mode)
  fallbackMember?: Person & { membership_status?: MembershipStatus };
}

export function MemberDetailDrawer({ memberId, onClose, fallbackMember }: MemberDetailDrawerProps) {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  useEffect(() => {
    if (!memberId) {
      setMember(null);
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      setIsOfflineFallback(false);
      try {
        const data = await personsApi.get(memberId) as MemberDetail;
        setMember(data);
      } catch (err) {
        console.warn("Failed fetching detailed member profile. Using fallback view.", err);
        setIsOfflineFallback(true);
        // Map fallbackMember properties to MemberDetail
        if (fallbackMember) {
          setMember({
            ...fallbackMember,
            first_name: fallbackMember.given_name,
            last_name: fallbackMember.surname,
          });
        } else {
          setError("Failed to load member details.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [memberId, fallbackMember]);

  if (!memberId) return null;

  const givenName = member?.given_name || member?.first_name || "";
  const surname = member?.surname || member?.last_name || "";
  const middleName = member?.middle_name ? ` ${member.middle_name} ` : " ";
  const fullName = `${givenName}${middleName}${surname}`.trim() || "Unknown Member";

  const status = (member?.membership_status as MembershipStatus) || "active";

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return "—";
    try {
      return new Date(isoStr).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  // Determine latest AEC verification result
  const latestCheck = member?.check_results && member.check_results.length > 0
    ? member.check_results[member.check_results.length - 1]
    : null;

  const getAecStatusColor = (res?: string) => {
    if (!res) return "var(--slate-muted)";
    if (res === "Pass") return "var(--status-active)";
    if (res === "Partial") return "var(--status-lapsed)";
    if (res === "Captcha") return "#2dd4bf";
    return "var(--status-suspended)"; // Fail states
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(4px)",
          zIndex: 40,
          animation: "fade-in 0.2s ease-out",
        }}
      />

      {/* Slide-out Sheet */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: "520px",
          background: "var(--canvas-raised)",
          borderLeft: "1px solid var(--console-border)",
          boxShadow: "-10px 0 30px rgba(15, 23, 42, 0.08)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "slide-in 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 28px",
            borderBottom: "1px solid var(--console-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                  color: "var(--navy)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullName}
              </h2>
              <MembershipBadge status={status} />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--slate-muted)" }}>
              ID: {member?.id || memberId}
            </p>
          </div>

          <button
            onClick={onClose}
            className="btn-ghost"
            style={{
              padding: 6,
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
              <div className="animate-spin-slow" style={{ width: 28, height: 28 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--civic-teal)" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--status-suspended)" }}>
              <p>{error}</p>
            </div>
          ) : member ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              
              {isOfflineFallback && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    background: "oklch(75% 0.15 70 / 0.08)",
                    border: "1px solid oklch(75% 0.15 70 / 0.25)",
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: "oklch(52% 0.13 70)",
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>Showing cached offline info. Detail profiles require active backend connection.</span>
                </div>
              )}

              {/* Tags Section */}
              {member.tags && member.tags.length > 0 && (
                <div>
                  <h4 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-muted)", margin: "0 0 10px 0" }}>
                    <Tag size={12} /> Tags
                  </h4>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {member.tags.map((t) => (
                      <span
                        key={t.id}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: `${t.color}15`,
                          color: t.color,
                          border: `1px solid ${t.color}25`,
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Section: Contact Details */}
              <div>
                <h4 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-muted)", margin: "0 0 12px 0" }}>
                  <User size={12} /> Contact Information
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--canvas)", padding: 16, borderRadius: 10, border: "1px solid var(--console-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Email</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)", display: "flex", alignItems: "center", gap: 4 }}>
                      {member.email ? (
                        <>
                          <Mail size={12} style={{ color: "var(--slate-muted)" }} />
                          {member.email}
                        </>
                      ) : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Mobile</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)", display: "flex", alignItems: "center", gap: 4 }}>
                      {member.mobile ? (
                        <>
                          <Phone size={12} style={{ color: "var(--slate-muted)" }} />
                          {member.mobile}
                        </>
                      ) : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Phone</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>{member.phone || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Section: Address Details */}
              <div>
                <h4 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-muted)", margin: "0 0 12px 0" }}>
                  <MapPin size={12} /> Address details
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--canvas)", padding: 16, borderRadius: 10, border: "1px solid var(--console-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Address Line 1</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)", textAlign: "right" }}>{member.primary_address1 || "—"}</span>
                  </div>
                  {(member.primary_address2 || member.primary_address3) && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                      <span style={{ color: "var(--slate-muted)" }}>Address Lines 2/3</span>
                      <span style={{ fontWeight: 500, color: "var(--navy)", textAlign: "right" }}>
                        {[member.primary_address2, member.primary_address3].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>City / Suburb</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>{member.primary_city || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>State & Postcode</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>
                      {member.primary_state} {member.primary_zip}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Country</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>{member.primary_country_code || "AU"}</span>
                  </div>
                </div>
              </div>

              {/* Section: AEC Check Results / Compliance */}
              <div>
                <h4 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-muted)", margin: "0 0 12px 0" }}>
                  <Shield size={12} /> AEC Verification Status
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--canvas)", padding: 16, borderRadius: 10, border: "1px solid var(--console-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Status</span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: getAecStatusColor(latestCheck?.result || (isOfflineFallback ? "Unchecked" : undefined)),
                      }}
                    >
                      {latestCheck?.result || (isOfflineFallback ? "Unchecked" : "No Check Run")}
                    </span>
                  </div>
                  {latestCheck && (
                    <>
                      {latestCheck.federal_division && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                          <span style={{ color: "var(--slate-muted)" }}>Federal Division</span>
                          <span style={{ fontWeight: 500, color: "var(--navy)" }}>{latestCheck.federal_division}</span>
                        </div>
                      )}
                      {latestCheck.state_division && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                          <span style={{ color: "var(--slate-muted)" }}>State Division</span>
                          <span style={{ fontWeight: 500, color: "var(--navy)" }}>{latestCheck.state_division}</span>
                        </div>
                      )}
                      {latestCheck.local_government && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                          <span style={{ color: "var(--slate-muted)" }}>LGA</span>
                          <span style={{ fontWeight: 500, color: "var(--navy)" }}>{latestCheck.local_government}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                        <span style={{ color: "var(--slate-muted)" }}>Last Verified</span>
                        <span style={{ fontWeight: 500, color: "var(--navy)" }}>{formatDate(latestCheck.timestamp)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Section: Membership Lifecycle */}
              <div>
                <h4 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-muted)", margin: "0 0 12px 0" }}>
                  <Calendar size={12} /> Membership Details
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--canvas)", padding: 16, borderRadius: 10, border: "1px solid var(--console-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Join Date</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>{formatDate(member.join_date || member.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--slate-muted)" }}>Renewal Date</span>
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>{formatDate(member.renewal_date)}</span>
                  </div>
                  {member.membership_type && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                      <span style={{ color: "var(--slate-muted)" }}>Membership Type</span>
                      <span style={{ fontWeight: 500, color: "var(--navy)" }}>{member.membership_type}</span>
                    </div>
                  )}
                  {member.resignation_date && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                      <span style={{ color: "var(--slate-muted)" }}>Resignation Date</span>
                      <span style={{ fontWeight: 500, color: "var(--status-suspended)" }}>{formatDate(member.resignation_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes Section */}
              {member.notes && member.notes.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-muted)", margin: "0 0 10px 0" }}>
                    Notes
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {member.notes.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          background: "var(--canvas)",
                          border: "1px solid var(--console-border)",
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 13,
                        }}
                      >
                        <p style={{ margin: "0 0 6px 0", color: "var(--navy)" }}>{n.note}</p>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--slate-muted)" }}>
                          <span>By {n.created_by}</span>
                          <span>{formatDate(n.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--slate-muted)" }}>
              <p>No details available.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
