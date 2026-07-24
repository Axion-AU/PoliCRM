---
name: PoliCRM
description: Member management and electoral contact system for Australian political parties. Civic instrument aesthetic — parliamentary documentation meets operational dashboard.
colors:
  primary: "#0D9488"
  neutral-bg: "#F0F2F4"
  neutral-surface: "#FFFFFF"
  neutral-inset: "#E4E8EC"
  border: "rgba(15, 23, 42, 0.10)"
  text-primary: "#0F172A"
  text-secondary: "#334155"
  text-tertiary: "#64748B"
  text-faint: "#94A3B8"
  status-active: "#0D9488"
  status-pending: "#D97706"
  status-flagged: "#E11D48"
  status-inactive: "#64748B"
typography:
  display:
    fontFamily: "Sora, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 300
    lineHeight: 1.5
  mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "#0D9488"
    textColor: "#FFFFFF"
    rounded: "6px"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#0F766E"
  input-base:
    backgroundColor: "#FFFFFF"
    borderColor: "rgba(15, 23, 42, 0.10)"
    rounded: "6px"
    padding: "8px 12px"
---

# Design System: PoliCRM

## 1. Overview

**Creative North Star: "Civic Instrument"**

PoliCRM draws from two traditions: parliamentary documentation (the restrained confidence of Hansard and electoral commission materials — dense but legible, information that earns its space) and operational dashboards (the utilitarian clarity of incident management boards — status at a glance, no decoration that competes with data).

The interface should look like it was designed by someone who has sat in a campaign office at 11pm and needed the data immediately. Not sterile. Not corporate. Purposeful.

This system rejects: gradient text, glassmorphism as default, side-stripe borders, the hero-metric template (big number + small label + gradient), identical card grids, and anything that reads as generic SaaS.

**Key Characteristics:**

- Compact data density: 40px table rows (32px in compact mode), 16px card padding.
- Functional motion: 0.2s ease-out page transitions, 0.15s row flash on update, 0.2s modal entry.
- Status-first colour discipline: Civic Teal is the only accent. Status colours are used only for status signalling.
- Typographic system: Sora for display, IBM Plex Sans for body, IBM Plex Mono for all data fields and identifiers.

## 2. Colors

PoliCRM employs a **Restrained** color strategy: tinted neutrals plus one accent (Civic Teal) used for interactive elements and active states.

### Foundation

| Role | Name | Value | Usage |
|------|------|-------|-------|
| Background | Slate Ground | `#F0F2F4` | Primary background — slightly cool, signals operational context |
| Surface | White | `#FFFFFF` | Cards, panels, modals — raised surfaces only |
| Inset | Mist | `#E4E8EC` | Recessed areas, table stripes, alternating rows |
| Border | Seam | `rgba(15, 23, 42, 0.10)` | Dividers, card borders — transparent to blend across surfaces |

### Ink

| Role | Name | Value | Usage |
|------|------|-------|-------|
| Primary text | Slate | `#0F172A` | Headlines, body, labels |
| Secondary text | Slate Mid | `#334155` | Descriptions, secondary body |
| Tertiary text | Slate Light | `#64748B` | Captions, metadata |
| Faint text | Slate Faint | `#94A3B8` | Timestamps, disabled states |

### Accent: Civic Teal

A single accent for interactive elements, active states, and key data points. One accent colour only — no supplementary accents, no gradients.

| Role | Name | Value | Usage |
|------|------|-------|-------|
| Accent | Civic Teal | `#0D9488` | Links, active nav, primary CTAs |
| Accent dim | Teal Wash | `rgba(13, 148, 136, 0.08)` | Badge backgrounds, selected rows |
| Accent mid | Teal Tint | `rgba(13, 148, 136, 0.15)` | Hover states, text selection |
| On accent | White | `#FFFFFF` | Text on teal buttons and badges |

### Status Colors

Used **only** in status badges and data visualisations. Never in navigation, headlines, or decorative elements.

| Status | Value | Usage |
|--------|-------|-------|
| Active | `#0D9488` (Civic Teal) | Active members, confirmed contacts |
| Pending | `#D97706` | Awaiting verification, incomplete data |
| Flagged | `#E11D48` | Compliance flags, duplicate records |
| Inactive | `#64748B` (Slate Light) | Lapsed members, no recent contact |

**Color rules:**

- Civic Teal is the only accent. No other accent colours. No gradients on any UI element.
- Status colours are used only in status badges and data visualisations.
- Background is `#F0F2F4`, not white. Pure white is reserved for raised surfaces (cards, modals, dropdowns).
- Never use `#000000` or `#FFFFFF` for backgrounds or base text. Tint every neutral toward the brand hue.

## 3. Typography

PoliCRM uses three fonts from two families. They share enough DNA to feel like a system without feeling like a monolith.

**Font loading:** `Sora` (SemiBold 600, Medium 500), `IBM Plex Sans` (Light 300, Regular 400, Medium 500), `IBM Plex Mono` (Regular 400, Medium 500) from Google Fonts.

### Display / Headlines: Sora

Geometric sans-serif with civic authority. Slightly condensed and structured — closer to signage and official communications than editorial design.

| Use | Weight | Size |
|-----|--------|------|
| App name / hero | SemiBold (600) | 32–48px |
| Section headers | SemiBold (600) | 20–28px |
| Panel titles | Medium (500) | 16–18px |
| Nav items | Medium (500) | 14px |

### Body: IBM Plex Sans

Designed for dense information environments (IBM product interfaces). Light weight for body copy, Regular for emphasis.

| Use | Weight | Size |
|-----|--------|------|
| Body text | Light (300) | 14–16px |
| Table cells | Regular (400) | 13–14px |
| Form labels | Regular (400) | 13px |
| Emphasis | Medium (500) | 14–16px |

### Data / Code: IBM Plex Mono

Used for IDs, Electoral Roll references, timestamps, record counts, and any field that could appear in a CSV export.

| Use | Weight | Size |
|-----|--------|------|
| Member IDs | Regular (400) | 12–13px |
| Timestamps | Regular (400) | 11–12px |
| Status badges | Medium (500) | 10–11px, uppercase, tracking 0.06em |
| Data counts | Regular (400) | 13px |
| Code / API references | Regular (400) | 13px |

**Type rules:**

- Headlines are always Sora SemiBold. Never set a headline in IBM Plex Sans.
- Data fields and identifiers always use IBM Plex Mono. Never Sora.
- Status badge text is uppercase IBM Plex Mono at 10–11px. No all-caps outside of badges.
- Body line length capped at 65–75ch.

## 4. Elevation

PoliCRM is flat-by-default. Depth is established through contrasting background levels (`#F0F2F4` canvas versus `#FFFFFF` raised surface) and the `rgba(15,23,42,0.10)` border system. Shadows are minimal and functional.

| Role | Value | Usage |
|------|-------|-------|
| Raised surface border | `1px solid rgba(15, 23, 42, 0.10)` | Card and panel edges |
| Dropdown shadow | `0 4px 16px rgba(15, 23, 42, 0.08)` | Menus and popovers |
| Modal shadow | `0 8px 32px rgba(15, 23, 42, 0.12)` | Modal overlays |

## 5. Components

### Buttons

- **Primary:** Civic Teal background (`#0D9488`), white text, 6px radius, 8px 16px padding.
- **Primary hover:** `#0F766E` (one step darker).
- **Primary focus:** Double-ring focus outline in Civic Teal.
- **Secondary:** White background, Seam border, Slate text. Hover adds Teal Tint background.
- **Ghost:** No background, no border. Slate Mid text. Hover adds Teal Wash background.

### Status Badges

IBM Plex Mono Medium, 10px, uppercase, tracking 0.06em. Coloured dot (4px) precedes label.

```
● ACTIVE     (Teal dot + Teal Wash background)
● PENDING    (Amber dot + amber-wash background)
● FLAGGED    (Rose dot + rose-wash background)
● INACTIVE   (Slate dot + Mist background)
```

Always include the dot plus text — never colour alone.

### Data Tables

- Header row: IBM Plex Mono Medium, 10px, uppercase, Slate Light (`#64748B`), tracking 0.06em.
- Data cells: IBM Plex Sans Regular 13–14px for names/text; IBM Plex Mono for IDs, timestamps, counts.
- Row height: 40px default, 32px compact.
- Alternating rows: Mist (`#E4E8EC`) on alternate rows or `rgba(228,232,236,0.5)` for subtlety.
- Row update flash: 0.15s background transition to Teal Wash on changed rows.

### Cards / Containers

- Background: White (`#FFFFFF`).
- Border: `1px solid rgba(15, 23, 42, 0.10)`.
- Radius: 6–8px. No large radius — this is an operational tool, not a consumer app.
- Internal padding: 16px default.

### Inputs / Fields

- White background, Seam border (`rgba(15,23,42,0.10)`), 6px radius, 8px 12px padding.
- Label: IBM Plex Sans Regular, 13px, Slate Mid.
- Focus: Border transitions to Civic Teal with a subtle teal glow (`rgba(13,148,136,0.15)`).
- Error: Rose border with rose-wash background and IBM Plex Sans error text.

### Navigation (Sidebar)

- Background: Slate (`#0F172A`).
- Active item: Teal Wash (`rgba(13,148,136,0.12)`) background, Civic Teal text.
- Inactive items: Slate Faint text. Hover: `rgba(255,255,255,0.06)` background.
- Icons: 16px, 1.5px stroke, square caps (not rounded), Lucide icon set.
- Labels: IBM Plex Sans Medium 14px.

### Loading States

Linear progress bar in Civic Teal across the top of the content area. No spinners inside data tables. Table skeleton rows use Mist (`#E4E8EC`) placeholder blocks with a subtle shimmer.

### Toast Notifications

IBM Plex Sans Regular 14px, white text on Civic Teal background. 3s auto-dismiss. Example: `✓ 847 records imported. 12 flagged for review.`

## 6. Motion

Users are operating, not browsing. All transitions are functional and fast.

| Event | Duration | Easing |
|-------|----------|--------|
| Page transition | 0.2s | ease-out |
| Modal entry | 0.2s | ease-out (scale 0.97 → 1.0) |
| Table row update flash | 0.15s | ease-out |
| Hover state | 0.12s | ease-out |
| Loading bar | linear | linear |

- No bounce, no elastic curves, no cinematic entrances.
- Honour `prefers-reduced-motion`: disable flashes and scale transitions.

## 7. Iconography

- Status indicators: 4px coloured dots (from Status Colours table) next to IBM Plex Mono labels.
- Action icons: 16px, 1.5px stroke, square caps, monochrome Slate Mid (`#334155`). Lucide icon set.
- Arrow navigation: `→` in IBM Plex Mono. No decorative SVG arrows.
- Core icon set (12–15 icons max): import, export, filter, search, check, flag, users, settings, clock, chevrons.

## 8. Logo

**Mark:** Square border (1.5px stroke, Slate `#0F172A`) containing a bold "P" in Sora SemiBold (~56% of square height). Civic Teal corner bracket (`#0D9488`, 1.5px stroke) at bottom-right, covering ~25% of the corner.

**Wordmark:** "POLICRM" in IBM Plex Mono Medium, uppercase, letter-spacing 0.08em.

**Variants:** Full (mark + wordmark horizontal), Compact (mark only), Text only (wordmark alone).

**Dark variant:** Square stroke and "P" become `#E2E8F0`. Teal bracket stays teal.

**Clear space:** 1x the mark height on all sides.

## 9. Do's and Don'ts

### Do

- Tint all neutral surfaces cool toward Civic Teal — no pure black or pure white in backgrounds.
- Use IBM Plex Mono for all IDs, timestamps, record counts, and badge labels.
- Use Sora SemiBold for all headlines.
- Keep data density high in production views (40px rows, 16px card padding).
- Use status dots plus text labels — never colour alone for status.
- Keep transitions fast and functional (0.15–0.2s max).
- Include footer attribution: "An Axion Ventures project" in IBM Plex Mono 11px Slate Faint, linked.

### Don't

- Use Operations Blue, Signal Blue, or any blue as a primary accent — Civic Teal only.
- Use gradient text (`background-clip: text`).
- Use side-stripe borders (coloured `border-left/right` > 1px as accent).
- Use glassmorphism decoratively.
- Use the hero-metric template (big number + small label + gradient accent).
- Use all-caps outside of status badges and table column headers.
- Mix emoji with professional typography in core navigation.
- Add status colours to navigation, headlines, or decorative elements.
