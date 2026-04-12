# Domain Seller Engine Architecture

## Goals

Domain Seller Engine is a Cloudflare-first, TypeScript-based platform for running a lean domain sales operation. The architecture is intentionally split into modular surfaces so the MVP can launch with Xel as the current registrar while later phases add stronger registrar APIs, portfolio lifecycle automation, and acquisition workflows.

## Runtime Shape

- `src/`: React + Vite frontend for admin and public portfolio experiences.
- `worker/`: Cloudflare Worker HTTP API and future background entrypoints.
- `src/server/`: backend-oriented modules that define schema, adapters, and business workflows.
- `docs/`: durable product and operational reference material.
- `.claude/skills/domain-seller-engine/`: project-local operating guidance for future Claude Code sessions.

## Core Architectural Decisions

### Frontend

The frontend is a Vite React single-page application with React Router. It supports two operating surfaces:

- admin workspace for portfolio, leads, deals, transfer tasks, and migration planning
- public portfolio site on `/portfolio` with searchable inventory and domain landing pages on `/d/:domainId`

Tailwind is used for rapid, consistent styling without locking the project into a heavyweight UI kit.

### Backend And Worker Layer

Cloudflare Workers act as the API and background execution surface. Hono provides a small routing layer. The Worker owns:

- admin and public API endpoints
- future webhook handling
- scheduled automation entrypoints
- queue producers and consumers

Business logic should stay in plain TypeScript modules so it can be reused from tests, seeds, scripts, and worker handlers.

LLM integrations and search-provider adapters should also stay in plain TypeScript modules under `src/server/ai/` so Anthropic prompting, structured output parsing, and buyer-discovery orchestration can be tested independently from Worker routes and UI surfaces.

### Data Layer

Cloudflare D1 is the primary database. Drizzle defines schema and migrations for strong typing and portability. The schema is normalized around these domains:

- portfolio and pricing
- public domain page content in a separate content layer, rather than inside the core `domains` table
- buyers, leads, contacts, and messages
- deals, transfer tasks, invoices, and provider transactions
- settings and auditability

### Adapter Strategy

The system uses adapters for:

- registrars
- transaction and closing providers
- inbound parsing providers
- outbound email transport

Each adapter exposes capabilities so Phase 1 can remain semi-manual without baking in assumptions that only hold after Phase 2.

## Safe Automation Boundaries

- Outreach is draft-first.
- Registrar actions can be prepared automatically but executed manually where required.
- Secure closing defaults to escrow or platform-managed flows.
- Stripe invoicing is available but does not imply transfer authorization.
- Any future auto-send or autonomous registrar operation must stay behind feature flags and observable audit logs.

## Deployment Model

- Cloudflare Pages hosts the frontend.
- Workers handle APIs, scheduled jobs, and queue processing.
- D1 stores operational data.
- Queues support future asynchronous drafting, classification, and sync work.
- Cron triggers support follow-up reminders, migration scans, and renewal planning.

## Extension Guidance

When adding Phase 2 and 3 features, prefer extending:

- shared domain models
- capability-based adapters
- feature flags
- explicit workflow states

Avoid rewriting the Phase 1 shape unless there is a strong operational need.

## Next Implementation Outline

Use [implementation-outline.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\implementation-outline.md) as the high-level handoff for the next build steps. Keep it coarse-grained and update it when major workstreams are completed or re-sequenced.
