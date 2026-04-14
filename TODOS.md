# TODOS

## Design (from /plan-design-review 2026-04-12)

### [HIGH] Implement Apple design system — restyle AppShell, SectionCard, StatCard

**What:** Apply all design tokens from DESIGN.md. Update:
- `AppShell.tsx`: strip sidebar prose/card, apply font stack, update nav item styles, fix header
- `SectionCard.tsx`: radius 12px, border `#e5e5ea`, new typography
- `StatCard.tsx`: remove icon/colored-bg options, apply numeric-large spec
- `index.html` or global CSS: declare CSS variables for all tokens
- Tailwind config: extend with design system values

**Why:** Everything else rests on this. The font, color, and spacing system must be consistent before page-level work.

**Pros:** One change propagates to every page. Clean foundation for all follow-up.

**Cons:** Touches almost every component — review visually after each component.

**Depends on:** DESIGN.md (written 2026-04-12). Run `/design-html` to generate the component implementations.

---

### [HIGH] Add skeleton loaders + empty states + inline error alerts to all pages

**What:** For each data-fetching page (Dashboard, Inbox, InquiryThread, Deals, Domains, Leads):
1. **Loading:** Skeleton loader — `animate-pulse` gray rectangles matching content shape
2. **Empty:** Centered icon (48px `#d2d2d7`) + title + body + optional CTA (see copy in DESIGN.md)
3. **Error:** Inline alert — red left-border, dismiss ×, retry button. Replace full-page SectionCard replacement.

**Why:** Pages currently show blank white during fetch. Error shows a raw string inside a card. Both feel unfinished.

**Pros:** Perceived performance improves. Users don't wonder if the page broke.

**Cons:** Each page needs individual skeleton shape. Can be done in one pass.

**Depends on:** Design system restyle (above). Empty state copy in DESIGN.md.

---

### [MEDIUM] Dynamic page title in AppShell header

**What:** Replace static `"Operations cockpit"` / `"Phase 1 MVP foundation"` in `AppShell.tsx` header with a dynamic `title` prop passed from each page. Each page passes its own title:
- Dashboard → `"Dashboard"`
- Inbox → `"Inbox"`
- InquiryThread → `"Thread"` or the domain name
- Deals → `"Deals"`
- Domains → `"Domains"`
- Leads → `"Leads"`

**Why:** Static chrome copy is un-Apple and confusing. The header says "Phase 1 MVP foundation" on every page regardless of where you are.

**Pros:** Instant orientation. Standard pattern in every macOS app.

**Cons:** Minor prop-threading change through router/pages.

**Depends on:** AppShell restyle (above).

---

### [MEDIUM] Toast notification component — replace actionMessage string

**What:** Create a `<Toast>` component (bottom-right, 3s auto-dismiss, slide-up animation). Replace `actionMessage` state pattern in:
- `InboxPage.tsx`
- `InquiryThreadPage.tsx`
- `LeadsPage.tsx`

Toast variants: success (green), error (red), info (blue).

**Why:** `actionMessage` persists as inline text until the next reload. Users have no feedback that the action completed — or worse, can't tell if it failed.

**Pros:** Matches Apple's HIG confirmation pattern. Works for both success and error.

**Cons:** Global toast needs a context provider or atom. Small state management addition.

**Depends on:** Design system restyle (above). Implement after core tokens are in.

---

## Deferred

- **Public portfolio design** — separate marketing design session needed. PublicShell, PublicDomainPage, PublicPortfolioPage not covered by this design system.
- **Mobile navigation** — desktop-only tool. Add `min-width: 1024px` note to README if needed.
- **Dark mode** — no spec yet. Foundation (CSS variables) is in place for later.
- **LoginPage restyle** — simple form, can be done independently after app shell is done.
