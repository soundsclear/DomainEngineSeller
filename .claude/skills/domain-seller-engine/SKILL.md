---
name: domain-seller-engine
description: Build, extend, or operate the Domain Seller Engine project. Use when working on domain portfolio management, pricing, landing pages, inbound lead handling, outreach drafts, deal tracking, registrar workflows, Stripe invoicing, or phased registrar automation. Especially use for tasks that must respect the Xel-first Phase 1 constraint, escrow-first closing rules, conservative outreach guardrails, and the phased architecture across Phase 1, Phase 2, and Phase 3.
---

# Domain Seller Engine

Treat this repository as a production-bound domain sales operating system that must stay launchable in Phase 1 while remaining easy to extend in later phases.

## Mission

Build a low-cost, auditable, Cloudflare-first system for:

- managing and pricing a domain portfolio
- publishing a public portfolio site and per-domain landers
- collecting inbound inquiries and offers
- tracking negotiations, outreach drafts, replies, and deal progression
- preparing secure closing and registrar transfer workflows
- evolving toward API-first registrar operations without forcing a premature migration

## Work By Phase

### Phase 1

Keep the current portfolio at Xel. Make the product useful without requiring registrar migration.

Prioritize:

- domain import and management
- pricing recommendations with deterministic logic
- public portfolio and domain pages
- inbound inquiry and offer capture
- negotiation and deal tracking
- outreach research records and draft generation
- secure closing workflow scaffolding
- Stripe invoices only for approved low-risk flows
- Xel semi-manual transfer preparation and checklist tracking

### Phase 2

Introduce API-first registrar support, preferably Dynadot or Openprovider.

Prepare:

- a registrar adapter interface
- `xel`, `dynadot`, and `openprovider` adapters
- migration planning fields and dashboards
- acquisition and portfolio operations that depend on registrar APIs

Do not auto-migrate by default.

### Phase 3

Expand autonomy only where the system is observable, reversible, and safe.

Allow room for:

- autonomous registrar operations behind clear safeguards
- acquisition watchlists and opportunity scoring
- renewal recommendations and lifecycle automation
- optional auto-send outreach only behind explicit feature flags and strict throttling

## Architectural Rules

- Keep fixed monthly costs low and prefer Cloudflare-native services where reasonable.
- Use TypeScript end-to-end.
- Prefer deterministic business logic for pricing, deal routing, and operational decisions.
- Use LLM calls only where they add value, such as summarization, buyer-fit reasoning, draft writing, or reply classification.
- Keep modules replaceable: UI, worker API, registrar adapters, messaging providers, and payment providers should not be tightly coupled.
- Preserve auditability. Important decisions, transitions, and manual checkpoints should be recordable and explainable.
- Favor simple admin auth in the MVP and avoid premature enterprise auth complexity.

## Registrar Logic

Model registrars through a shared adapter interface with capability flags.

### Xel

Treat Xel as registrar of record in Phase 1 and as a semi-automated adapter.

Support these Xel transfer modes:

- `internal_account_transfer`
- `holder_change`
- `external_transfer_by_auth_code`

For Xel tasks, prepare:

- seller checklist
- buyer checklist
- required data package
- support-request copy
- buyer-facing instructions
- seller-facing instructions
- deadlines and manual checkpoints
- audit log entries

Do not block the sales workflow because the final registrar action is manual.

### Dynadot And Openprovider

Keep adapter scaffolds ready for:

- capability discovery
- availability checks
- registration
- renewals
- transfer flows
- nameserver updates
- contact updates
- order or transfer status sync

## Closing Rules

- Default direct deals to secure methods such as escrow or platform-managed transfer.
- Treat `stripe_invoice_manual_transfer` as an exception flow, not the default.
- Never assume a paid Stripe invoice alone is enough to trigger a registrar transfer.
- Require explicit admin confirmation before invoice-only direct transfer.
- Record payment state, transfer state, deadlines, references, and buyer approval signals separately.

## Outreach Guardrails

- Draft-first outreach is the default.
- Do not design mass blasting or spam-evasion behavior.
- Respect `do_not_contact`, low-volume throttles, and stop signals.
- Optimize for lawful, relevant, plain-text outreach and sender reputation.
- If auto-send is ever added, keep it off by default and behind feature flags, daily caps, and reviewable audit logs.

## Coding Conventions

- Organize code by capability: shared logic, frontend views, worker/API code, adapters, and schemas.
- Keep pure business rules framework-agnostic where possible so they can be tested in isolation.
- Use Zod for input contracts and Drizzle for schema typing.
- Add comments only where decision logic is subtle.
- Prefer small services with explicit inputs and outputs over large stateful classes.
- Keep demo data, sample CSVs, and seed logic aligned with the real schema.

## Continuing Work In Later Sessions

- Extend the current adapter interfaces rather than bypassing them.
- Add new registrar automation behind capability flags and feature toggles.
- Preserve Phase 1 usability while adding Phase 2 and 3 scaffolding.
- Update `docs/architecture.md`, `docs/phases.md`, and `docs/registrars.md` whenever the system shape changes materially.
- When adding automation, state what remains manual, what is draft-only, and what has irreversible side effects.
