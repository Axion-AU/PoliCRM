import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "./LandingPage";

/** Wrap the component in a MemoryRouter so react-router-dom Link works. */
function renderLandingPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  // ── Branding ──────────────────────────────────────────────────────────────

  it("displays the PoliCRM brand name in the header", () => {
    renderLandingPage();
    // The top bar contains the brand name
    const header = screen.getByRole("banner");
    expect(within(header).getByText("PoliCRM")).toBeInTheDocument();
  });

  it("displays the PoliCRM brand name in the footer", () => {
    renderLandingPage();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("PoliCRM")).toBeInTheDocument();
  });

  it("shows the current year in the footer copyright notice", () => {
    renderLandingPage();
    const year = String(new Date().getFullYear());
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(new RegExp(year))).toBeInTheDocument();
  });

  // ── Hero section ──────────────────────────────────────────────────────────

  it("renders the hero headline", () => {
    renderLandingPage();
    expect(
      screen.getByRole("heading", { name: /your party's operating system/i }),
    ).toBeInTheDocument();
  });

  it("renders the hero description paragraph", () => {
    renderLandingPage();
    expect(
      screen.getByText(/PoliCRM replaces disconnected spreadsheets/i),
    ).toBeInTheDocument();
  });

  it("renders the Australian platform label", () => {
    renderLandingPage();
    expect(
      screen.getByText(/Australian Political Operations Platform/i),
    ).toBeInTheDocument();
  });

  // ── Navigation links ──────────────────────────────────────────────────────

  it('renders a "Sign In" link in the top bar', () => {
    renderLandingPage();
    expect(screen.getByRole("link", { name: /Sign In/i })).toBeInTheDocument();
  });

  it('"Sign In" link points to /login', () => {
    renderLandingPage();
    const signInLink = screen.getByRole("link", { name: /Sign In/i });
    expect(signInLink).toHaveAttribute("href", "/login");
  });

  it('renders at least one "Open the Console" call-to-action link', () => {
    renderLandingPage();
    const ctaLinks = screen.getAllByRole("link", { name: /Open the Console/i });
    expect(ctaLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('all "Open the Console" links point to /login', () => {
    renderLandingPage();
    const ctaLinks = screen.getAllByRole("link", { name: /Open the Console/i });
    for (const link of ctaLinks) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });

  // ── Features section ──────────────────────────────────────────────────────

  it("renders the three feature headings", () => {
    renderLandingPage();
    expect(screen.getByRole("heading", { name: /The Person Graph/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Electoral Intelligence/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Compliance-Ready Data/i }),
    ).toBeInTheDocument();
  });

  it("renders all three feature sequence numbers", () => {
    renderLandingPage();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("renders the Person Graph feature body copy", () => {
    renderLandingPage();
    expect(screen.getByText(/unified record for every person/i)).toBeInTheDocument();
  });

  it("renders the Electoral Intelligence feature body copy", () => {
    renderLandingPage();
    expect(screen.getByText(/membership density across every federal electorate/i)).toBeInTheDocument();
  });

  it("renders the Compliance-Ready Data feature body copy", () => {
    renderLandingPage();
    expect(
      screen.getByText(/Australian Electoral Commission/i),
    ).toBeInTheDocument();
  });

  // ── CTA strip ────────────────────────────────────────────────────────────

  it('renders the "Ready to get started?" CTA heading', () => {
    renderLandingPage();
    expect(screen.getByText(/Ready to get started\?/i)).toBeInTheDocument();
  });

  it("renders the CTA sub-copy", () => {
    renderLandingPage();
    expect(
      screen.getByText(/Sign in to access your party's operations console/i),
    ).toBeInTheDocument();
  });

  // ── Landmark structure ────────────────────────────────────────────────────

  it("renders a <header> landmark", () => {
    renderLandingPage();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders a <footer> landmark", () => {
    renderLandingPage();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders feature sections", () => {
    renderLandingPage();
    // Three FEATURES + hero section + CTA strip = at least 2 <section> elements
    const { container } = renderLandingPage();
    const sections = container.querySelectorAll("section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  // ── Boundary / regression ─────────────────────────────────────────────────

  it("renders without throwing", () => {
    expect(() => renderLandingPage()).not.toThrow();
  });

  it("renders feature icons as SVGs", () => {
    const { container } = renderLandingPage();
    const svgs = container.querySelectorAll("svg");
    // At least one SVG icon per feature + arrow icons on CTAs
    expect(svgs.length).toBeGreaterThanOrEqual(3);
  });
});