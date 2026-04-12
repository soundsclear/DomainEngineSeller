# Repository Map

Use this document as a quick orientation layer before making changes.

## Core Docs

- `docs/claude-code-handoff-prompt.md`: primary next-session implementation prompt
- `docs/implementation-outline.md`: high-level build direction
- `docs/next-session-checklist.md`: short start/end checklist
- `docs/phase1-status.md`: what is already done versus still missing for Phase 1
- `docs/architecture.md`: runtime shape and architectural rules
- `docs/phases.md`: Phase 1, 2, and 3 strategy
- `docs/registrars.md`: registrar architecture and Xel constraints
- `docs/deliverability.md`: outreach and deliverability guardrails
- `docs/closing-workflows.md`: secure closing and transfer rules

## Frontend

- `src/router.tsx`: route map
- `src/App.tsx`: app shell outlet
- `src/components/`: shared UI components
- `src/pages/`: admin and public page surfaces
- `src/lib/demo-data.ts`: current placeholder/demo records

## Core Business Logic

- `src/lib/pricing-engine.ts`: deterministic pricing starter
- `src/lib/outreach-guardrails.ts`: outreach eligibility rules
- `src/lib/closing-rules.ts`: secure closing decision rules
- `src/lib/*.test.ts`: current unit test coverage

## Backend And Persistence

- `worker/index.ts`: Worker API entrypoint
- `src/server/db/schema.ts`: Drizzle schema
- `drizzle/0000_initial.sql`: initial SQL migration
- `drizzle.config.ts`: Drizzle config

## Registrar Layer

- `src/server/registrars/adapter.ts`: registrar contract
- `src/server/registrars/xel.ts`: Phase 1 semi-automated adapter
- `src/server/registrars/dynadot.ts`: Phase 2 scaffold
- `src/server/registrars/openprovider.ts`: Phase 2 scaffold

## Data And Setup

- `data/sample-domains.csv`: sample import file
- `scripts/seed.ts`: simple seed/demo summary script
- `.env.example`: environment template
- `wrangler.jsonc`: Cloudflare runtime config
