# Claude Code Handoff Prompt

Use the prompt below as the primary next-step implementation prompt for Claude Code.

```text
You are continuing work on the existing repository for "Domain Seller Engine".

Operate as a senior product architect, senior full-stack engineer, automation engineer, and pragmatic technical operator.

Your job is to take the current scaffold and turn it into a more functional Phase 1 MVP without re-architecting the project.

## Non-negotiable working rules

- Start by inspecting the repository and extending what already exists.
- Do not replace the current stack unless there is a very strong reason.
- Keep Phase 1 launchability more important than future ambition.
- Keep implementation practical, incremental, and production-minded.
- Keep the current docs and project-local skill in sync with major implementation changes.

## Project mission

Build a low-cost, scalable, Cloudflare-first domain-selling system that can:
- manage and price a portfolio of domain names
- publish portfolio and domain landing pages
- collect inbound leads and offers
- support buyer discovery and outreach draft generation
- track negotiations and replies
- choose secure closing methods
- support escrow-first direct deals
- support Stripe invoicing where appropriate
- prepare and manage registrar transfer workflows
- evolve in phases toward more autonomous registrar operations and acquisitions

## Core product and safety principles

- keep fixed monthly costs low
- use TypeScript end-to-end
- prefer modular architecture and replaceable adapters
- use deterministic logic where possible
- use LLMs only where they clearly add value
- optimize for clarity, auditability, and safe automation
- do not design mass cold-email behavior
- do not design spam-evasion behavior
- draft-first outreach is the default
- auto-send must remain OFF by default
- direct sales should default to escrow or platform-managed transfer
- Stripe is allowed for invoicing and approved low-risk flows, but must not become the default direct-transfer closing path
- transfer must never be triggered only because an invoice exists

## Current repository status

The repository already contains a working scaffold. Build on top of it.

Already present:
- project-local skill: `.claude/skills/domain-seller-engine/SKILL.md`
- product and architecture docs in `docs/`
- React + Vite + Tailwind app scaffold
- Cloudflare Worker + Hono scaffold
- Drizzle schema and initial SQL migration
- registrar adapter interface
- Xel adapter scaffold
- Dynadot and Openprovider adapter scaffolds
- starter pricing engine
- starter outreach guardrails
- starter closing logic
- demo data, seed script, sample CSV
- starter tests

Validation already passing at handoff time:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:run`
- `pnpm build`

## Start sequence

Before implementing, do this in order:
- read the listed docs first
- read `docs/repo-map.md`
- read `docs/phase1-status.md`
- inspect the current Worker, schema, registrars, and pages
- run `pnpm check`
- summarize the current state briefly

## Files you must read first

- `.claude/skills/domain-seller-engine/SKILL.md`
- `docs/architecture.md`
- `docs/phases.md`
- `docs/registrars.md`
- `docs/deliverability.md`
- `docs/closing-workflows.md`
- `docs/implementation-outline.md`
- `docs/repo-map.md`
- `docs/phase1-status.md`
- `README.md`
- `src/server/db/schema.ts`
- `src/server/registrars/adapter.ts`
- `src/server/registrars/xel.ts`
- `src/server/registrars/dynadot.ts`
- `src/server/registrars/openprovider.ts`
- `worker/index.ts`
- `src/lib/pricing-engine.ts`
- `src/lib/outreach-guardrails.ts`
- `src/lib/closing-rules.ts`
- `src/pages/`

## Stack to preserve

- Frontend: React + Vite + Tailwind
- Hosting: Cloudflare Pages
- API/background jobs: Cloudflare Workers
- Database: Cloudflare D1
- Queue: Cloudflare Queues
- Scheduled jobs: Cloudflare Cron Triggers
- ORM: Drizzle
- Validation: Zod
- Email outbound: pluggable SMTP via environment variables
- Auth: simple admin auth for MVP

## Phased strategy you must preserve

### Phase 1

Phase 1 is the priority and must be launchable while the current portfolio remains at Xel.

Phase 1 must support:
- domain import and management
- pricing recommendations
- public portfolio pages and domain pages
- inbound inquiries and offers
- negotiation and deal tracking
- buyer discovery records
- outreach draft generation
- secure closing logic
- Stripe invoicing where appropriate
- Xel transfer preparation
- transfer checklists, deadlines, and manual checkpoints

### Xel Phase 1 registrar rule

Treat Xel as the current registrar of record and as a semi-automated adapter.

Support these Xel transfer modes:
- `internal_account_transfer`
- `holder_change`
- `external_transfer_by_auth_code`

For Xel workflows the system must:
- store that the domain is currently at Xel
- prepare required transfer data packages
- prepare seller and buyer checklists
- prepare support and transfer request text
- prepare holder change flows
- prepare auth-code transfer flows
- track pending confirmations and manual checkpoints
- log registrar workflow steps for auditability

### Phase 2

Phase 2 must stay scaffolded from the start.

Targets:
- Dynadot
- Openprovider

Preserve and extend the registrar adapter interface for:
- capability flags
- auth configuration
- domain lookup
- availability checks
- registration
- renewals
- transfers
- nameserver updates
- contact updates
- status sync
- order or transfer status lookup

Also preserve migration planning fields:
- current_registrar
- target_registrar
- migration_candidate
- transfer_eligibility
- migration_priority
- migration_notes

### Phase 3

Do not build full Phase 3 now, but leave room for:
- acquisition watchlists
- renewal recommendations
- drop-candidate suggestions
- stronger registrar automation
- optional auto-send behind explicit feature flags and strict safeguards

## Your mission for this pass

Implement a substantial Phase 1 progression on top of the current scaffold.

### Priority 1: turn scaffold pages into real product flows

- replace demo-driven page behavior with real app structure
- add loading, empty, create, edit, and submit states where appropriate
- keep admin and public surfaces clearly separated

### Priority 2: build the real Worker/API layer

Add or expand routes for:
- domains
- inquiries
- offers
- leads
- deals
- pricing refresh
- transfer task generation
- admin auth/session handling

Keep route handlers thin and move business logic into reusable server modules.

### Priority 3: connect persistence through D1 and Drizzle

- connect the existing schema to real data access
- add follow-up migrations only where needed
- make the seed and CSV import flows practically useful
- replace fake dashboard metrics with database-backed metrics

### Priority 4: implement the Phase 1 domain workflow

- CSV import of domains
- manual domain entry
- editable domain detail pages
- pricing generation and storage
- marketplace metadata storage

### Priority 5: implement the inbound and sales workflow

- working contact form submissions
- working offer form submissions
- linking inbound records to domains and communication threads
- lead and buyer discovery record support
- outreach draft flow scaffolding
- follow-up task support

### Priority 6: implement deal and closing workflow

- deal creation
- deal status transitions
- secure closing method selection
- Stripe invoice entity scaffolding
- payment state separate from transfer state
- provider transaction records
- audit logging for important transitions

### Priority 7: implement Xel transfer workflow support

- transfer task creation after payment-secured states
- support all three Xel transfer modes
- generate buyer instructions
- generate seller instructions
- generate required-field requests
- track deadlines
- track manual checkpoints

### Priority 8: keep Phase 2 and 3 visible but secondary

- do not let Phase 2 or Phase 3 slow down Phase 1 usability
- keep Dynadot and Openprovider scaffolds coherent
- keep placeholders for migration dashboard and later automation surfaces

## Coding rules

- use TypeScript end-to-end
- keep modules small and reusable
- prefer adapters and services over tightly coupled logic
- keep deterministic business rules outside UI components where possible
- use Zod for contracts and validation
- use Drizzle for persistence
- add concise comments only when logic is non-obvious
- do not remove or sideline the existing docs and skill
- update docs when behavior or architecture materially changes

## Required outputs

By the end of this pass, produce:
- improved working codebase
- real database-backed domain and inquiry flows
- stronger admin and public routes
- real Phase 1 Xel workflow support
- updated docs where needed
- expanded tests for newly added rules or endpoints

## Definition of success

Success means:
- the project remains Xel-first for Phase 1
- the app can manage and present a real portfolio
- inbound inquiries and offers can be stored and tracked
- pricing and deal tracking are meaningfully more real than scaffold-only
- Xel registrar actions are prepared and trackable
- the architecture remains ready for later Dynadot/Openprovider automation

## Execution style

- think like a senior engineer
- inspect first, then implement
- prefer practical implementation over vague descriptions
- avoid overengineering
- keep the MVP usable
- leave clean extension points for later phases

Start by reading the listed files, summarizing the current state, then implement the next most valuable Phase 1 functionality directly in code.
```
