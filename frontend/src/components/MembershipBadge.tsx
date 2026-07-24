/* ─── Types ──────────────────────────────────────────────────────────────── */
export type MembershipStatus = "active" | "lapsed" | "resigned" | "suspended";

interface MembershipBadgeProps {
  status: MembershipStatus;
}

/* ─── Config ─────────────────────────────────────────────────────────────── */
// Colours follow BRAND_GUIDELINES.md §Status Colours — badge use only.
// Badge text: IBM Plex Mono, 10px, uppercase, tracked 0.06em (via .badge class)
const CONFIG: Record<
  MembershipStatus,
  { label: string; dot: string; bg: string; color: string; border: string }
> = {
  active: {
    label: "Active",
    dot:    "#0D9488",                          // Civic Teal
    bg:     "rgba(13, 148, 136, 0.08)",         // Teal Wash
    color:  "#0f766e",
    border: "rgba(13, 148, 136, 0.25)",
  },
  lapsed: {
    label: "Pending",
    dot:    "#D97706",                          // Amber
    bg:     "rgba(217, 119,   6, 0.08)",
    color:  "#b45309",
    border: "rgba(217, 119,   6, 0.25)",
  },
  suspended: {
    label: "Flagged",
    dot:    "#E11D48",                          // Rose
    bg:     "rgba(225,  29,  72, 0.08)",
    color:  "#be123c",
    border: "rgba(225,  29,  72, 0.25)",
  },
  resigned: {
    label: "Inactive",
    dot:    "#64748B",                          // Slate Light
    bg:     "#E4E8EC",                          // Mist
    color:  "#475569",
    border: "rgba(100, 116, 139, 0.25)",
  },
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export function MembershipBadge({ status }: MembershipBadgeProps) {
  const { label, dot, bg, color, border } = CONFIG[status];

  return (
    <span
      className="badge"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {/* 4px coloured dot per brand iconography spec */}
      <span
        style={{
          display: "inline-block",
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
