# Next Session Checklist

Use this checklist at the start of the next major implementation session.

## Start Sequence

1. Read the project-local skill and the main docs.
2. Read `docs/repo-map.md` and `docs/phase1-status.md`.
3. Read the current Worker, schema, registrar adapters, and frontend pages.
4. Run `pnpm check` before changing anything.
5. Summarize the current state in a few lines before implementation begins.

## First Implementation Targets

- replace demo-driven page behavior with real data access
- connect Worker routes to real D1-backed persistence
- implement domain CRUD and CSV import
- implement inquiry and offer submission flows
- implement deal creation and Xel transfer task generation

## Guardrails To Preserve

- keep Phase 1 launchable with domains still at Xel
- keep outreach draft-first
- keep direct deals escrow-first by default
- keep Stripe invoicing separate from transfer authorization
- keep Dynadot and Openprovider as scaffolds, not blockers

## Before Finishing

1. Update docs if architecture or behavior materially changed.
2. Expand tests for any new logic or endpoints.
3. Run `pnpm check` again.
