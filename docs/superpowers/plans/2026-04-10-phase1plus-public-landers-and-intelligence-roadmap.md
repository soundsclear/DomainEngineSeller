# Phase 1+, Public Landers & Intelligence Roadmap

**Date:** 2026-04-10
**Status:** Drafted

## Goal

Turn the current private test version into a strong Phase 1 platform with:

- a public portfolio website and per-domain sales pages
- pre-generated SEO text per domain
- automatic buyer discovery per domain
- inbox and reply intelligence for inbound leads
- negotiation assistance and controlled outreach automation

This roadmap keeps the current test version usable while layering in higher-value automation safely.

---

## Current Baseline

Already working:

- D1-backed domain CRUD
- CSV import
- real dashboard metrics
- inquiry capture
- admin notifications by email via Resend
- pricing recommendations
- local dev flow for frontend and worker

Still missing from a strong sellable MVP:

- public-facing domain landers
- stored SEO copy for public pages
- buyer discovery runs
- lead review workflow from discovered buyers
- inbound thread handling and reply drafting
- negotiation assistance
- guarded outreach automation

---

## Product Decisions Locked In

These choices are already decided and should drive implementation:

- Buyer discovery is **on-demand per domain**
- Buyer discovery uses a **broad exploratory** strategy
- Buyer discovery architecture is **parallel query fan-out**
- Search provider is **Brave Search API**
- LLM provider is **Anthropic**
- Public sales experience should work like a central portfolio site similar in shape to `klokgieter.nl`
- SEO text is **pre-generated and stored**, not generated on every request
- Public domain pages use an **on-page inquiry form**
- For MVP, public pages can live in the current app/runtime
- Note for later: **split the public site from admin/API into separate deployment surfaces**

---

## Recommended Build Order

Build in this order:

1. Public portfolio and per-domain landers
2. SEO content generation and storage
3. Buyer Discovery Engine
4. Lead inbox and reply intelligence
5. Negotiation assistant
6. Controlled outreach automation
7. Registrar and lifecycle expansions

This order matters because the public sales surface closes the inbound loop first, while buyer discovery and reply intelligence increase deal flow after that surface exists.

---

## Workstream 1: Public Portfolio And Domain Landers

### Outcome

Each listed domain gets:

- a public page
- SEO metadata
- body copy relevant to the domain meaning
- an inquiry / offer form that feeds the existing inquiry pipeline

There is also a central portfolio overview page with filters and links to each domain page.

### MVP architecture

Use the current stack first:

- React app serves public routes
- Worker serves public API routes
- public and admin remain in one codebase for now

### Later split note

Do **not** build for a split deployment yet, but keep the modules separable so later we can split into:

- public site deployment
- admin app deployment
- worker/API deployment

### Files likely involved

- `src/pages/PortfolioPage.tsx`
- `src/pages/PublicDomainPage.tsx` or equivalent
- `src/lib/api.ts`
- `worker/index.ts`
- `src/server/db/domain-repository.ts`
- `src/server/db/inquiry-repository.ts`

### Must-have behaviour

- Only `listed` domains appear publicly
- Each public page shows price framing, CTA, and inquiry form
- Slugs are stable and derived from domain names
- Page metadata is domain-specific
- Form submits into existing inquiry storage and email notification flow

---

## Workstream 2: SEO Content Generation And Storage

### Outcome

Every public domain page can contain stored, domain-relevant SEO copy without needing an LLM call at page view time.

### Why this comes early

The public pages need indexable text before buyer discovery matters. This also gives reusable semantic material for later discovery and outreach prompts.

### Recommended data model additions

Add stored content fields for domains, either directly on `domains` or in a dedicated table such as `domain_content`.

Recommended fields:

- `seo_title`
- `meta_description`
- `hero_headline`
- `hero_subheadline`
- `body_html` or `body_markdown`
- `content_status`
- `content_generated_at`

### Generation model

- Manual trigger from admin per domain
- Optional bulk generate later
- Content is editable by admin after generation
- Regeneration should overwrite only generated fields, not manual edits unless explicitly confirmed

### LLM notes

Use Anthropic here. The prompt should reason about:

- literal semantic meaning
- commercial use cases
- SEO relevance
- alternative buyer angles

Avoid fluff and generic "premium domain" copy.

---

## Workstream 3: Buyer Discovery Engine

### Outcome

On a domain detail page, clicking `Find buyers` creates a deduplicated lead list using:

- Anthropic for reasoning
- Brave Search API for search

### Existing design basis

Implementation must follow:

- [2026-04-10-buyer-discovery-engine-design.md](C:\Users\FD111\Documents\Domain Seller Engine\docs\superpowers\specs\2026-04-10-buyer-discovery-engine-design.md)

### Important correction to the spec

The spec says no schema change is needed, but the current plan assumes a `source` value on leads. Verify whether the `leads` table already has a `source` column. If not, add it before implementing buyer discovery.

### Additional implementation guardrails

- Persist raw search evidence or at least the chosen angle for auditability
- Skip duplicate websites per domain
- Keep the pipeline idempotent for re-runs
- Show partial results if some Brave queries fail

---

## Workstream 4: Inbox And Reply Intelligence

### Outcome

Inbound inquiries become manageable inside the product instead of only being emailed to you.

### Scope

- inquiry thread view
- reply status and follow-up state
- LLM-assisted reply drafts
- simple inbox triage labels
- suggested next action

### Classification examples

- new inbound lead
- low intent
- serious buyer
- offer received
- negotiation active
- no further action

### Build shape

Start with admin-only intelligence:

- the system drafts
- you review
- nothing auto-sends yet

### Why before autonomous negotiation

This creates the data and workflow hygiene needed for safe later automation.

---

## Workstream 5: Negotiation Assistant

### Outcome

For active leads or deals, the system helps you respond with:

- concise thread summary
- buyer intent summary
- valuation framing
- suggested counter-offer
- suggested reply draft

### Rules

- keep the human in the loop
- never auto-accept or auto-reject offers
- do not send replies automatically in the first version
- always keep pricing logic and previous conversation visible to the model

### Data needed

- inquiries
- messages / thread history
- domain pricing recommendation
- domain notes
- lead fit rationale

---

## Workstream 6: Controlled Outreach Automation

### Outcome

The system can eventually send outreach with strict limits, but only after discovery and inbox tooling exist.

### Stage breakdown

Stage 1:

- lead list generation
- draft outreach only

Stage 2:

- batch review screen
- approve selected drafts

Stage 3:

- optional auto-send behind feature flag
- daily cap
- do-not-contact enforcement
- audit logging
- sender reputation controls

### Important constraint

Keep this off by default, per the project guardrails.

---

## Workstream 7: Registrar And Lifecycle Expansion

This is later than the above workstreams.

### Includes

- Dynadot / Openprovider deeper adapters
- migration planning surfaces
- transfer automation helpers
- renewal recommendations
- lifecycle scoring
- acquisition watchlists

### Why later

These features matter, but they do not block validating whether the engine can attract and convert buyer interest.

---

## Technical Dependency Order

The practical dependency chain is:

1. Public routing and public page data loading
2. Domain content storage schema
3. SEO content generation service
4. Buyer discovery schema correction if needed
5. Buyer discovery service and UI
6. Inquiry thread persistence and thread UI
7. Reply drafting and classification
8. Negotiation assistance
9. Outreach review workflow
10. Optional outbound auto-send controls

---

## What You Need To Provide Later

These are external dependencies, not implementation blockers for planning:

### Needed soon

- `ANTHROPIC_API_KEY` for content generation, buyer discovery, reply intelligence, and negotiation assistance
- `BRAVE_SEARCH_API_KEY` for buyer discovery

### Needed later

- dedicated email sending domain for Resend
- production Cloudflare account and deployment settings
- registrar credentials for Dynadot and/or Openprovider

---

## Recommended Next Execution Slice

The next build slice should be:

### Slice A

Public portfolio and public domain landers

### Slice B

Stored SEO content generation for public pages

### Slice C

Buyer discovery on the domain detail page

Do **not** start inbox intelligence or negotiation automation before these three are in place.

---

## Definition Of "Strong Next Milestone"

The next meaningful milestone is reached when:

- a public visitor can browse the portfolio
- a public visitor can open a domain page with real content
- the page can capture an inquiry
- the admin can generate SEO copy for a domain
- the admin can run buyer discovery for a domain
- discovered buyers appear as leads tied to that domain

At that point the system will support both inbound and outbound opportunity creation in a credible testable way.
