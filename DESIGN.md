# Design System — Domain Seller Engine

Apple Human Interface Guidelines-inspired admin app.
Scope: admin app only. Public portfolio (PublicShell) is a separate marketing design.

---

## Classification

**APP UI** — workspace-driven admin dashboard. Apply App UI rules:
- Calm surface hierarchy, strong typography, few colors
- Utility language in copy — orientation, status, action
- No marketing copy, taglines, or decorative prose in app chrome
- Cards only when the card IS the interaction (not decorative)

---

## Typography

Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif`

| Role          | Size  | Weight | Color   | Usage                         |
|---------------|-------|--------|---------|-------------------------------|
| Display       | 28px  | 700    | #1d1d1f | Page titles (dynamic per route) |
| Title         | 20px  | 600    | #1d1d1f | Section headings              |
| Body          | 15px  | 400    | #1d1d1f | Default body text             |
| Secondary     | 13px  | 400    | #6e6e73 | Hints, metadata, timestamps   |
| Caption       | 11px  | 500    | #6e6e73 | Uppercase labels (letter-spacing: 0.06em) |
| Numeric large | 34px  | 700    | #1d1d1f | Stat card values              |

---

## Color Palette

```
Background:     #f5f5f7   App background outside containers
Surface:        #ffffff   Cards, sidebar, panels
Text primary:   #1d1d1f   All primary text
Text secondary: #6e6e73   Hints, metadata, secondary labels
Separator:      #d2d2d7   1px borders and dividers
Separator soft: #e5e5ea   Intra-card separators

Accent:         #059669   Primary interactive — buttons, active nav, links (emerald-600)
Accent hover:   #047857   Hover state (emerald-700)
Accent light:   #d1fae5   Accent-tinted backgrounds (emerald-100)
Accent text:    #065f46   Text on accent-light backgrounds (emerald-900)

Destructive:    #ff3b30   Delete, cancel, error actions
Success:        #34c759   Sent, closed, confirmed
Warning:        #ff9f0a   Pending, awaiting, unread
Info:           #0071e3   Neutral informational
```

No warm tints. No `#fcfaf4`. No per-page color schemes.

---

## Spacing (8pt grid)

```
4px   xs  — icon gaps, tight inline
8px   sm  — intra-element padding
12px      — nav item padding
16px  md  — card inner padding, form fields
24px  lg  — card gap, section spacing
32px  xl  — between major sections
48px  2xl — page-level top spacing
```

---

## Border Radius

```
6px   — small interactive (checkbox, radio)
8px   — buttons, input fields, chips, tags, nav items
12px  — cards, panels, modals
16px  — sidebar (top corners only if needed)
9999px — pills, badges
```

No `rounded-[28-32px]` on structural containers. Reserve large radius for interactive cards.

---

## Shadows

Use borders over shadows by default. Shadows only when elevation matters.

```
card:   0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
panel:  0 4px 16px rgba(0,0,0,0.10)
modal:  0 20px 60px rgba(0,0,0,0.15)
```

No stacking backdrop-blur layers. Sidebar may use `backdrop-filter: blur(20px)` with `bg-white/80` — not both blur AND shadow stacked on top of another blur layer.

---

## Layout

```
App shell:
  Sidebar: 240px fixed left, white bg, 1px right border #d2d2d7, no shadow
  Content: flex-1, #f5f5f7 background, 24px padding all sides
  Header bar: white bg, 1px bottom border #d2d2d7, 16px vertical padding, 24px horizontal

Sidebar:
  App name label: 11px uppercase, #6e6e73, letter-spacing 0.1em — at top, no tagline
  Nav items: 36px height, 8px radius, 12px horizontal padding, icon (16px) + label (14px)
  Active: bg #059669, text white
  Hover: bg #f5f5f7, text #1d1d1f
  Active text color MUST have 4.5:1 contrast on #059669 background → use white

Content header (per-page):
  Page title: 28px, weight 700, #1d1d1f — dynamic, set per page
  Subtitle (optional): 15px, #6e6e73 — factual, not decorative
  Right side: action buttons

Card:
  bg white, border 1px #e5e5ea, radius 12px, padding 20px
  Title: 17px weight 600 #1d1d1f
  Meta: 13px #6e6e73
  Separator between items: 1px #e5e5ea, no padding change

Grid:
  Stat cards: 4-column grid, gap 16px, equal width
  Section grid: responsive 2-column or sidebar + main split
```

---

## Component Specs

### StatCard
```
bg: white
border: 1px solid #e5e5ea
radius: 12px
padding: 20px
label: 11px uppercase #6e6e73 letter-spacing 0.06em
value: 34px bold #1d1d1f, margin-top 8px
hint: 13px #6e6e73, margin-top 4px

NO colored backgrounds. NO icon decorations. Just label + number + hint.
```

### SectionCard
```
bg: white
border: 1px solid #e5e5ea
radius: 12px
padding: 20px
title: 17px semibold #1d1d1f
subtitle: 13px #6e6e73, margin-top 2px
content: margin-top 16px
```

### Data rows (inside SectionCard)
```
height: 44px (touch target minimum)
padding: 0 16px
border-bottom: 1px solid #e5e5ea (except last)
label: 15px #1d1d1f
value: 15px semibold #1d1d1f, text-align right
NO colored tile backgrounds
```

### Button — Primary
```
bg: #059669
text: white
font: 15px weight 500
padding: 8px 16px
radius: 8px
hover: bg #047857
disabled: opacity 0.5
```

### Button — Secondary
```
bg: #f5f5f7
text: #1d1d1f
border: 1px solid #d2d2d7
font: 15px weight 400
padding: 8px 16px
radius: 8px
hover: bg #e5e5ea
```

### Button — Destructive
```
bg: white
text: #ff3b30
border: 1px solid #d2d2d7
hover: bg #fff5f5
```

### Badge
```
font: 11px weight 500, uppercase optional
padding: 2px 8px
radius: 9999px

Variants:
  default: bg #e5e5ea, text #1d1d1f
  green: bg #d1fae5, text #065f46  (listed, sent, closed)
  amber: bg #fef3c7, text #b45309  (pending, unread, draft)
  red: bg #fee2e2, text #b91c1c    (error, failed, rejected)
  blue: bg #dbeafe, text #1d4ed8   (informational)
```

### Input / Textarea
```
bg: white
border: 1px solid #d2d2d7
radius: 8px
padding: 10px 14px
font: 15px #1d1d1f
placeholder: #6e6e73
focus: border-color #059669, box-shadow 0 0 0 3px rgba(5,150,105,0.15)
```

---

## Interaction States (all pages)

For every data-fetching page, specify:

| State    | UI pattern                                                              |
|----------|-------------------------------------------------------------------------|
| Loading  | Skeleton loader — gray rectangles (#e5e5ea) matching content shape, animated pulse |
| Empty    | Centered icon (48px, #d2d2d7) + title (17px) + description (15px #6e6e73) + optional primary action |
| Error    | Inline alert bar — red left-border, dismissible ×, retry button. NOT full-page replacement |
| Success  | Toast notification — bottom-right, 3s auto-dismiss, success icon + message |
| Partial  | In-context spinner at the specific element (e.g., AI draft button shows spinner inline) |

### Empty state copy examples
```
Inbox (empty):
  Icon: Inbox
  Title: "No inquiries yet"
  Body: "When buyers submit interest through your domain pages, threads appear here."

Deals (empty):
  Icon: BadgeEuro
  Title: "No active deals"
  Body: "Convert an inquiry to a deal to start tracking negotiations."

Leads (empty):
  Icon: Mail
  Title: "No leads imported"
  Body: "Import leads via CSV or add them manually."
```

---

## Chrome copy rules

App chrome (AppShell header, sidebar, page titles) uses utility language only:

| Area            | Correct                  | Wrong                         |
|-----------------|--------------------------|-------------------------------|
| Sidebar top     | "Domain Seller Engine"   | "Sell first. Automate carefully." |
| Page title      | "Dashboard"              | "Operations cockpit"          |
| Page subtitle   | — (omit or factual)      | "Phase 1 MVP foundation"      |
| Status badge    | "Xel · Escrow · Draft"   | "Xel-first, escrow-first, draft-first" |

---

## Accessibility

- All touch/click targets: minimum 44×44px
- Focus ring: 2px solid #059669, 2px offset
- Color contrast: all text 4.5:1 minimum (WCAG AA)
- Semantic HTML: `<nav>`, `<main>`, `<article>`, `<header>`, `<aside>`
- ARIA: `aria-label="Main navigation"` on sidebar nav, `aria-current="page"` on active nav item
- Keyboard order: logical DOM order for all interactive flows
- Screen reader: all icon-only buttons have `aria-label`

---

## Scope boundaries

This design system covers **admin app only** (AppShell + all /admin/* pages).

**Out of scope (separate design):**
- PublicShell + PublicDomainPage + PublicPortfolioPage — marketing/landing design
- LoginPage — may get simpler Apple-style form treatment independently

---

## Approved mockups

None yet (OpenAI key not configured — run `$D setup` to enable visual mockup generation).

---

*Last updated: 2026-04-12 by /plan-design-review*
