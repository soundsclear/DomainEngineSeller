# Phase 1+ Execution Prompts

**Date:** 2026-04-10
**Purpose:** Separate implementation prompts for each major function/workstream in the next build phase.

Use these prompts one at a time. Each prompt assumes the current repository state already includes:

- D1-backed domain CRUD
- CSV import
- dashboard metrics
- inquiry capture
- Resend email notifications
- admin domain management

---

## Prompt 1: Public Portfolio Overview

Implement the public portfolio overview page for Domain Seller Engine.

Context:
- This repo already has a React + Vite frontend, Cloudflare Worker API, D1 database, and admin area.
- Domains are now stored in D1 and should no longer come from demo data.
- We want a public-facing portfolio experience similar in structure to klokgieter.nl: a clean overview of listed domains with links to a dedicated sales page per domain.
- This is still Phase 1, so keep it simple, fast, and launchable.

Build requirements:
- Create or update the public portfolio overview route/page.
- Show only domains with status appropriate for public listing.
- Load domains from the real database through the existing Worker/API layer.
- Each card/item should link to a dedicated public domain sales page.
- Include useful public-facing fields such as domain name, category, language, and price framing where available.
- Keep styling clean and production-lean, not a placeholder.
- Do not build a marketing landing page; build the actual usable portfolio page.

Constraints:
- Reuse existing patterns and components where possible.
- Keep public and admin surfaces in the same app for now, but structure code so public can be split later.
- Avoid demo data.

Deliverables:
- Working public portfolio page
- Any needed API route updates
- Focused tests for the new public data loading behavior
- Run relevant validation commands and report results

Also update docs if the public routing shape changes materially.

---

## Prompt 2: Public Domain Lander

Implement the public per-domain sales page for Domain Seller Engine.

Context:
- Each listed domain should have its own dedicated page on the public site.
- This page should act as a sales lander: the domain is for sale, the visitor can read relevant copy, and the visitor can submit an inquiry or offer.
- The current system already supports inquiry capture and admin email notifications.

Build requirements:
- Create the public domain detail route/page.
- Resolve the page by stable slug or domain identifier derived from the real domain record.
- Show the domain name prominently.
- Show concise sales framing and domain-specific context.
- Include the inquiry form directly on the page and wire it into the existing inquiry pipeline.
- Reuse the existing backend inquiry persistence and email notification flow.
- Only publicly accessible domains should resolve here; unpublished/unlisted domains should not appear.
- Add proper page metadata hooks so title and description can become domain-specific.

Constraints:
- Public page must feel like a real sales page, not an admin artifact.
- Do not generate SEO text yet in this prompt unless required to fill placeholders minimally.
- Keep the implementation modular so richer content can be layered in next.

Deliverables:
- Working public per-domain route
- Inquiry form working end to end from the public page
- Focused tests for route/data behavior
- Validation results

---

## Prompt 3: Domain SEO Content Schema And Storage

Implement stored SEO/content support for public domain pages in Domain Seller Engine.

Context:
- We want each public domain page to eventually have pre-generated SEO-relevant text.
- The content should be generated once, stored in D1, editable later, and served quickly without LLM calls during page views.
- This feature should prepare for Anthropic-based generation in the next prompt.

Build requirements:
- Extend the database model to store domain page content.
- Prefer a clean schema that supports future manual editing and regeneration tracking.
- Add fields or a related table for:
  - seo title
  - meta description
  - hero headline
  - hero subheadline
  - body content
  - content status
  - generated timestamp
- Add repository functions to read and update this content.
- Expose the content through the Worker/API for admin and public page consumption.
- Update the public domain page to use stored content if available, with sensible fallback rendering if not.

Constraints:
- Keep schema changes compatible with current D1 usage.
- Preserve auditability and future editability.
- Do not yet add the LLM generation itself in this prompt.

Deliverables:
- Schema update
- Repository/API support
- Public page reads stored content
- Tests for repository and fallback behavior
- Validation results

Also update architecture/docs if the domain content model changes the system shape materially.

---

## Prompt 4: SEO Content Generation With Anthropic

Implement admin-triggered SEO content generation for domain pages using Anthropic.

Context:
- The public domain page now has stored content support.
- We want an admin action that generates domain-specific SEO-oriented copy and stores it.
- This should be pre-generated and saved, not generated on every page request.
- The content must reason about the domain semantically, not just praise it as a “premium domain”.

Build requirements:
- Add an admin action or button on the domain detail/admin page to generate content for that domain.
- Add a Worker endpoint to trigger generation.
- Use `ANTHROPIC_API_KEY` from environment/config.
- Generate structured output that maps to the stored content fields.
- Store the result in D1.
- Make the generated content visible on the public page immediately after save.
- Handle missing API key with a clear error.
- Keep prompt design grounded in:
  - literal meaning of the domain
  - commercial use cases
  - likely buyer intent
  - SEO relevance
  - natural Dutch/English wording as appropriate for the domain

Constraints:
- Manual trigger only for now.
- Do not overwrite manual edits unless the implementation explicitly supports confirmation or separate generated fields.
- Keep prompt/output structured and testable.

Deliverables:
- Anthropic generation service
- Admin trigger flow
- Saved SEO content in D1
- Tests around parsing/storage/error handling
- Validation results

At the end, document exactly what env var the user must supply: `ANTHROPIC_API_KEY`.

---

## Prompt 5: Buyer Discovery Engine

Implement the Buyer Discovery Engine for a single domain using Anthropic + Brave Search.

Context:
- There is an approved design spec at `docs/superpowers/specs/2026-04-10-buyer-discovery-engine-design.md`.
- The system must run on-demand from the domain detail page.
- The strategy is broad exploratory search, not simple keyword matching.
- The architecture is:
  1. Anthropic generates 5-8 search queries from different buyer angles
  2. Brave Search runs those queries in parallel
  3. Anthropic synthesizes the results into a deduplicated scored lead list
  4. The system stores unique leads tied to the domain

Build requirements:
- Implement the discovery service in a backend module.
- Add the Worker endpoint to trigger discovery for a domain.
- Add the domain detail UI section with a “Find buyers” button and results list.
- Store created leads in D1.
- Skip duplicates by website per domain.
- Surface buyer fit reason and priority score in the UI.
- Show previously discovered leads on page load.
- Log or tolerate partial search failures without failing the whole run.

Important check:
- Verify whether the `leads` table already has a `source` column.
- If not, add the necessary schema change before using `source = 'buyer_discovery'`.

Constraints:
- Use `ANTHROPIC_API_KEY` and `BRAVE_SEARCH_API_KEY`.
- Keep this feature on-demand per domain only.
- Preserve auditability and deterministic persistence behavior.

Deliverables:
- Buyer discovery service
- API route
- Domain detail UI card
- Schema fix if needed
- Tests for deduplication and parsing logic
- Validation results

At the end, document exactly which user-provided env vars are required.

---

## Prompt 6: Lead Inbox And Reply Intelligence

Implement the first version of inbox/reply intelligence for inbound inquiries.

Context:
- The system already captures inquiries and emails the admin.
- We now want the product itself to become the working inbox for domain leads.
- This is admin-side functionality, not public-facing.
- Replies should be draft-first, not auto-sent.

Build requirements:
- Create an admin inbox or inquiry thread view.
- Show inbound inquiries grouped in a usable workflow.
- Add classification support such as:
  - new inbound lead
  - low intent
  - serious buyer
  - offer received
  - negotiation active
  - no further action
- Add an LLM-assisted reply draft flow using Anthropic.
- Add suggested next action or follow-up status.
- Keep all outbound replies as draft-only in this first version.
- Ensure domain context, pricing context, and prior inquiry data are available to the drafting logic.

Constraints:
- No automatic email sending in this prompt.
- Preserve auditability.
- Reuse existing inquiry/deal patterns where possible instead of inventing a parallel structure.

Deliverables:
- Admin inbox/thread UI
- Classification + draft-generation backend
- Persistence changes if needed
- Focused tests
- Validation results

At the end, document the required env var: `ANTHROPIC_API_KEY`.

---

## Prompt 7: Negotiation Assistant

Implement an admin-side negotiation assistant for active domain leads and deals.

Context:
- The inbox/reply intelligence layer exists or is being built first.
- For serious buyers, the system should help summarize the thread, interpret the offer, and suggest a reply or counter-offer.
- This is assistive only in the first version.

Build requirements:
- Add a negotiation assistance panel in the relevant admin lead/deal view.
- Generate:
  - thread summary
  - buyer intent summary
  - pricing context summary
  - suggested counter-offer or negotiation position
  - suggested reply draft
- Use existing pricing recommendations and deal context as grounding.
- Make the assistant useful for a human operator, not autonomous.

Constraints:
- No auto-send.
- No automatic price acceptance/rejection.
- Keep all model outputs clearly separated from source facts.
- Preserve manual decision points.

Deliverables:
- Negotiation assistant service
- Admin UI integration
- Focused tests around input shaping / parsing / fallback handling
- Validation results

At the end, document the required env var: `ANTHROPIC_API_KEY`.

---

## Prompt 8: Controlled Outreach Draft Workflow

Implement a controlled outreach workflow for discovered leads, draft-first only.

Context:
- Buyer discovery can already create leads.
- We want the system to help prepare outreach without crossing into unsafe mass automation.
- Project guardrails require draft-first outreach and strong controls.

Build requirements:
- Add an admin workflow for selecting leads and generating outreach drafts.
- Use domain context, buyer-fit reasoning, and lead website context where available.
- Generate concise, relevant outreach drafts.
- Track draft status in the system.
- Add reviewability so the operator can approve or reject drafts.
- Preserve do-not-contact logic and future compatibility with daily caps and audit logs.

Constraints:
- Do not auto-send in this prompt.
- Do not build spammy bulk blasting behavior.
- Keep the implementation small, explicit, and reviewable.

Deliverables:
- Draft-generation workflow
- Admin review UI
- Persistence for draft states if needed
- Focused tests
- Validation results

Document any required env vars and clearly note that auto-send remains disabled.

---

## Prompt 9: Guarded Auto-Send Outreach

Implement optional guarded auto-send for outreach behind explicit feature flags.

Context:
- Outreach drafting and review already exist.
- This is a later-phase feature and must remain off by default.
- The project explicitly forbids unsafe or reputation-damaging automation.

Build requirements:
- Add a feature flag for outreach auto-send.
- Add daily send caps.
- Enforce do-not-contact protection.
- Add audit logging for every automatic send decision.
- Make sender reputation controls visible in the implementation.
- Ensure the operator can disable or pause the system easily.

Constraints:
- Off by default.
- No hidden autonomous behavior.
- No bypass of guardrails.
- Do not proceed if the existing system lacks the persistence needed for safe reviewable operation; add that first.

Deliverables:
- Feature-flagged auto-send flow
- Caps and safeguards
- Audit log support
- Focused tests
- Validation results

Document all operational safeguards and any new configuration keys.

---

## Prompt 10: Public/Admin Split Preparation

Refactor the codebase to prepare for a later split between public site, admin app, and API, without actually splitting deployments yet.

Context:
- We deliberately kept public and admin in one app/runtime for MVP speed.
- We already know we want to split later.
- We should make that future split cheaper by separating concerns now.

Build requirements:
- Refactor shared/public/admin modules so routing and data access boundaries are clearer.
- Separate public-facing components/services from admin-facing ones where practical.
- Keep the current runtime and deployment shape unchanged.
- Avoid changing user-facing behavior unless needed for the refactor.

Constraints:
- This is a preparation step, not a deployment split.
- Keep changes scoped and avoid churn.

Deliverables:
- Cleaner module boundaries
- Any small routing/service refactors needed
- Regression checks
- Validation results

Update architecture docs to reflect the intended future split path.
