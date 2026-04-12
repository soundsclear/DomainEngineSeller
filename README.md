# Domain Seller Engine

Domain Seller Engine is a phased, Cloudflare-first system for managing a domain portfolio, publishing sales landers, handling inbound leads, generating safe outreach drafts, tracking negotiations, and preparing secure closing workflows.

This scaffold is intentionally optimized for Phase 1: launch while the current portfolio remains at Xel.

## Claude Code Start Here

If a future Claude Code session is continuing this repository, start with:

- [docs/claude-code-handoff-prompt.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\claude-code-handoff-prompt.md)
- [docs/implementation-outline.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\implementation-outline.md)
- [docs/next-session-checklist.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\next-session-checklist.md)
- [docs/repo-map.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\repo-map.md)
- [docs/phase1-status.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\phase1-status.md)
- [docs/architecture.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\architecture.md)
- [docs/phases.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\phases.md)
- [docs/registrars.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\registrars.md)

Recommended repo verification command:

```bash
pnpm check
```

## Current Scope

- project-local Claude skill for future repository sessions
- architecture, phase, registrar, deliverability, and closing docs
- React + Vite + Tailwind frontend scaffold
- Cloudflare Worker API scaffold with Hono
- Drizzle schema and initial SQL migration
- registrar adapter interface plus Xel, Dynadot, and Openprovider adapters
- deterministic pricing engine
- outreach and closing guardrail logic
- demo portfolio, sample CSV, and seed summary script
- basic tests for pricing, outreach, and closing rules

## Stack

- Frontend: React + Vite + Tailwind
- API/background: Cloudflare Workers + Hono
- Database: Cloudflare D1
- Queue and cron: Cloudflare Queues and Cron Triggers
- ORM: Drizzle
- Validation: Zod
- Charts: Recharts

## Local Development

1. Install dependencies:

```bash
pnpm install
```

2. Start the frontend:

```bash
pnpm dev
```

3. Start the Worker API:

```bash
pnpm cf:dev
```

4. Run tests:

```bash
pnpm test:run
```

5. Run the full verification pass:

```bash
pnpm check
```

## Useful Files

- `/.claude/skills/domain-seller-engine/SKILL.md`
- `/docs/claude-code-handoff-prompt.md`
- `/docs/implementation-outline.md`
- `/docs/next-session-checklist.md`
- `/docs/repo-map.md`
- `/docs/phase1-status.md`
- `/docs/architecture.md`
- `/docs/phases.md`
- `/docs/registrars.md`
- `/src/server/db/schema.ts`
- `/src/server/registrars/`
- `/worker/index.ts`
- `/data/sample-domains.csv`

## Notes

- Phase 1 treats Xel as registrar of record and models it as a semi-automated adapter.
- Direct sales should default to escrow-first or platform-managed transfers.
- Stripe invoicing is supported as a controlled workflow, not as implicit transfer authorization.
- Outreach remains draft-first by default.
