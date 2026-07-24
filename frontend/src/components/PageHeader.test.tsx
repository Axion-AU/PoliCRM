import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  // ── Title rendering ───────────────────────────────────────────────────────

  it("renders the title text", () => {
    render(<PageHeader title="Members" />);
    expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
  });

  it("renders the title inside an <h1> element", () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    const h1 = container.querySelector("h1");
    expect(h1).toBeInTheDocument();
    expect(h1?.textContent).toBe("Dashboard");
  });

  it("renders the supplied title accurately including special characters", () => {
    render(<PageHeader title="War Room — Electoral Intelligence" />);
    expect(
      screen.getByRole("heading", { name: "War Room — Electoral Intelligence" }),
    ).toBeInTheDocument();
  });

  // ── Subtitle (optional) ───────────────────────────────────────────────────

  it("renders subtitle when provided", () => {
    render(<PageHeader title="Members" subtitle="Manage party members" />);
    expect(screen.getByText("Manage party members")).toBeInTheDocument();
  });

  it("does not render a subtitle element when subtitle is not provided", () => {
    render(<PageHeader title="Members" />);
    // There should be no <p> element in the header when subtitle is omitted.
    const { container } = render(<PageHeader title="Members" />);
    expect(container.querySelector("p")).not.toBeInTheDocument();
  });

  it("renders subtitle in a <p> element", () => {
    const { container } = render(
      <PageHeader title="Import" subtitle="Import from NationBuilder" />,
    );
    const p = container.querySelector("p");
    expect(p).toBeInTheDocument();
    expect(p?.textContent).toBe("Import from NationBuilder");
  });

  // ── Action slot (optional) ────────────────────────────────────────────────

  it("renders action content when action prop is provided", () => {
    render(
      <PageHeader
        title="Members"
        action={<button>Export CSV</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("does not render unexpected content when action is not provided", () => {
    render(<PageHeader title="Members" />);
    // No button, link, or interactive element should be rendered without an action prop.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders both subtitle and action when both are provided", () => {
    render(
      <PageHeader
        title="Members"
        subtitle="All members"
        action={<button>Add Member</button>}
      />,
    );
    expect(screen.getByText("All members")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Member" })).toBeInTheDocument();
  });

  // ── Layout / style ────────────────────────────────────────────────────────

  it("outer container has display:flex style", () => {
    const { container } = render(<PageHeader title="Test" />);
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.style.display).toBe("flex");
  });

  it("outer container has a bottom border style", () => {
    const { container } = render(<PageHeader title="Test" />);
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.style.borderBottom).toBeTruthy();
  });

  // ── Boundary / regression ─────────────────────────────────────────────────

  it("renders without throwing when only title is provided", () => {
    expect(() => render(<PageHeader title="Minimal" />)).not.toThrow();
  });

  it("renders without throwing when all props are provided", () => {
    expect(() =>
      render(
        <PageHeader
          title="Full"
          subtitle="All props"
          action={<span>Action</span>}
        />,
      ),
    ).not.toThrow();
  });

  it("renders a long title without truncation", () => {
    const longTitle = "A Very Long Page Header Title That Should Still Render Correctly";
    render(<PageHeader title={longTitle} />);
    expect(screen.getByRole("heading", { name: longTitle })).toBeInTheDocument();
  });
});