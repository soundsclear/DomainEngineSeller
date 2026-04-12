# Implementation Outline

This document is intentionally high-level. It exists to help future Claude Code sessions understand what the current scaffold should grow into without locking the project into low-value detail too early.

## Recommended Execution Order

Use this order unless local repository reality strongly suggests a better sequence:

1. inspect docs, schema, worker routes, registrar adapters, and current pages
2. replace demo flows with real persistence and API wiring
3. implement domain CRUD and import
4. implement inbound inquiry and offer handling
5. implement deals, closing progression, and Xel transfer tasks
6. expand tests and update docs

## 1. Turn The Frontend Into A Real Product Surface

The current React pages should evolve from demo-data views into real app surfaces backed by API calls and database state.

Main areas:

- replace demo-data rendering with real fetching and mutation flows
- add working forms for domain import, manual domain editing, inquiries, and offers
- add operational views for deals, transfer tasks, and settings
- keep the split between admin workspace and public portfolio pages

Relevant files:

- `src/router.tsx`
- `src/pages/`
- `src/components/`

## 2. Expand The Worker Into The Real API Layer

The Worker should become the main HTTP interface for admin and public actions.

Main areas:

- add CRUD-style routes for domains, leads, deals, inquiries, and invoices
- add endpoints for pricing refresh, deal progression, and transfer task generation
- add auth/session handling for the admin side
- keep routing thin and move business logic into reusable server-side modules

Relevant files:

- `worker/index.ts`
- `src/server/`

## 3. Move From Schema-Only To Real Persistence

The Drizzle schema and initial SQL migration are the foundation, but the project still needs real database-backed flows.

Main areas:

- wire repositories or services to D1 through Drizzle
- add follow-up migrations as real CRUD and query needs become clearer
- turn the seed script and sample CSV into realistic import/bootstrap tooling
- replace hardcoded dashboard metrics with database-derived metrics

Relevant files:

- `src/server/db/schema.ts`
- `drizzle/`
- `scripts/seed.ts`
- `data/sample-domains.csv`

## 4. Grow The Core Business Logic Modules

The pure TypeScript logic modules should remain the home for deterministic product rules.

Main areas:

- expand pricing logic and rationale generation
- expand outreach eligibility, throttling, and stop conditions
- expand deal progression and secure-closing decision logic
- keep these rules testable outside the UI and Worker layer

Relevant files:

- `src/lib/pricing-engine.ts`
- `src/lib/outreach-guardrails.ts`
- `src/lib/closing-rules.ts`

## 5. Make Xel Useful First, Keep Phase 2 Ready

The registrar layer must first solve Phase 1 operational needs without waiting for API-first registrar adoption.

Main areas:

- make the Xel adapter generate semi-manual transfer workflows and checklist outputs
- store transfer preparation state, deadlines, and manual checkpoints
- keep Dynadot and Openprovider as capability-based scaffolds for later activation
- avoid Phase 2 complexity that blocks the Xel-first MVP

Relevant files:

- `src/server/registrars/adapter.ts`
- `src/server/registrars/xel.ts`
- `src/server/registrars/dynadot.ts`
- `src/server/registrars/openprovider.ts`
- `docs/registrars.md`

## 6. Keep The Docs And Skill As Project Control Points

The scaffold is meant to survive multiple future sessions without re-architecture.

Main areas:

- update the project-local skill when the operating rules materially change
- keep architecture and phase docs aligned with implementation reality
- document what is still manual, draft-only, or feature-flagged
- prevent future work from weakening the Xel-first, escrow-first, and draft-first constraints

Relevant files:

- `.claude/skills/domain-seller-engine/SKILL.md`
- `docs/architecture.md`
- `docs/phases.md`
- `docs/registrars.md`
- `docs/deliverability.md`
- `docs/closing-workflows.md`

## 7. Finish The Operational Layer Around The Code

The project should remain easy to continue and safe to operate.

Main areas:

- keep environment configuration current as integrations are added
- extend tests as real workflows land
- keep deployment and local-run instructions current
- validate new work through typecheck, lint, tests, and production builds

Relevant files:

- `.env.example`
- `wrangler.jsonc`
- `drizzle.config.ts`
- `README.md`
- `src/lib/*.test.ts`
