import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MembershipBadge } from "./MembershipBadge";
import type { MembershipStatus } from "./MembershipBadge";

describe("MembershipBadge", () => {
  // ── Label rendering ──────────────────────────────────────────────────────

  it('renders "Active" label for active status', () => {
    render(<MembershipBadge status="active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it('renders "Lapsed" label for lapsed status', () => {
    render(<MembershipBadge status="lapsed" />);
    expect(screen.getByText("Lapsed")).toBeInTheDocument();
  });

  it('renders "Resigned" label for resigned status', () => {
    render(<MembershipBadge status="resigned" />);
    expect(screen.getByText("Resigned")).toBeInTheDocument();
  });

  it('renders "Suspended" label for suspended status', () => {
    render(<MembershipBadge status="suspended" />);
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  // ── Element structure ────────────────────────────────────────────────────

  it("renders as a <span> element with the badge class", () => {
    const { container } = render(<MembershipBadge status="active" />);
    const span = container.querySelector("span.badge");
    expect(span).toBeInTheDocument();
  });

  // ── Inline styles (colour tokens) ────────────────────────────────────────

  it("applies a background style for active status", () => {
    const { container } = render(<MembershipBadge status="active" />);
    const span = container.querySelector("span.badge") as HTMLElement;
    // Background should be a non-empty string (okclh green tint)
    expect(span.style.background).toBeTruthy();
  });

  it("applies a background style for suspended status", () => {
    const { container } = render(<MembershipBadge status="suspended" />);
    const span = container.querySelector("span.badge") as HTMLElement;
    expect(span.style.background).toBeTruthy();
  });

  it("applies a border style for each status", () => {
    const statuses: MembershipStatus[] = ["active", "lapsed", "resigned", "suspended"];
    for (const status of statuses) {
      const { container } = render(<MembershipBadge status={status} />);
      const span = container.querySelector("span.badge") as HTMLElement;
      expect(span.style.border).toBeTruthy();
    }
  });

  it("applies a color style for each status", () => {
    const statuses: MembershipStatus[] = ["active", "lapsed", "resigned", "suspended"];
    for (const status of statuses) {
      const { container } = render(<MembershipBadge status={status} />);
      const span = container.querySelector("span.badge") as HTMLElement;
      expect(span.style.color).toBeTruthy();
    }
  });

  // ── Different statuses use distinct visual styles ─────────────────────────

  it("active and suspended statuses have different background colours", () => {
    const { container: activeContainer } = render(<MembershipBadge status="active" />);
    const { container: suspendedContainer } = render(<MembershipBadge status="suspended" />);

    const activeSpan = activeContainer.querySelector("span.badge") as HTMLElement;
    const suspendedSpan = suspendedContainer.querySelector("span.badge") as HTMLElement;

    expect(activeSpan.style.background).not.toEqual(suspendedSpan.style.background);
  });

  it("active and lapsed statuses have different background colours", () => {
    const { container: activeContainer } = render(<MembershipBadge status="active" />);
    const { container: lapsedContainer } = render(<MembershipBadge status="lapsed" />);

    const activeSpan = activeContainer.querySelector("span.badge") as HTMLElement;
    const lapsedSpan = lapsedContainer.querySelector("span.badge") as HTMLElement;

    expect(activeSpan.style.background).not.toEqual(lapsedSpan.style.background);
  });

  // ── Icon rendering ────────────────────────────────────────────────────────

  it("renders an SVG icon inside the badge", () => {
    const { container } = render(<MembershipBadge status="active" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders exactly one icon per badge", () => {
    const { container } = render(<MembershipBadge status="lapsed" />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(1);
  });

  // ── Boundary / regression ─────────────────────────────────────────────────

  it("all four statuses render without throwing", () => {
    const statuses: MembershipStatus[] = ["active", "lapsed", "resigned", "suspended"];
    for (const status of statuses) {
      expect(() => render(<MembershipBadge status={status} />)).not.toThrow();
    }
  });
});