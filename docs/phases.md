# Product Phases

## Phase 1: Xel-First MVP

Launch the product while the existing portfolio remains at Xel.

Deliverables:

- import and manage domains
- pricing recommendations
- public portfolio and domain pages
- inbound inquiries and offers
- negotiation and deal tracking
- outreach draft generation
- Stripe invoice support for approved flows
- secure closing scaffolding
- Xel transfer preparation, checklists, and manual checkpoints

Operational stance:

- no forced registrar migration
- no mass outreach
- no unsafe direct-transfer assumptions

## Phase 2: API-First Registrar Expansion

Introduce Dynadot or Openprovider support through the registrar adapter interface.

Add:

- search and availability APIs
- registration, renewals, and transfer workflows
- nameserver and contact management
- migration planning dashboard
- acquisition-enabling surfaces

Operational stance:

- recommend migrations, do not auto-run them by default

## Phase 3: Controlled Autonomy

Add higher-leverage automation only once observability and guardrails are mature.

Add:

- stronger registrar automation
- acquisition watchlists
- renewal recommendations
- drop-candidate suggestions
- selective auto-send behind feature flags
- expanded analytics and ROI tracking

Operational stance:

- increase autonomy conservatively
- preserve reversibility and auditability

## Implementation Handoff

For the practical next build sequence across frontend, worker APIs, data persistence, registrar workflows, and testing, use [implementation-outline.md](C:\Users\FD111\Documents\Course\Regenplanner\Domain Seller Engine\docs\implementation-outline.md).
