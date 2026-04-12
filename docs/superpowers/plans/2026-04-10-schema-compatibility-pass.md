# Schema And Architecture Compatibility Pass

Scope: prompts 1-10 for Domain Seller Engine. This note is a compatibility check only. No product behavior changes.

## Current Baseline

The repo already has these canonical structures:

- `domains`
- `leads`
- `contacts`
- `outreach_threads`
- `messages`
- `followup_tasks`
- `inbound_inquiries`
- `deals`
- `deal_events`
- `transfer_tasks`
- `audit_log`

Important current-state facts:

- `leads.source` already exists in both the Drizzle schema and the initial SQL migration.
- `leads.do_not_contact` already exists and is the canonical suppression flag for outreach.
- `audit_log` already exists as a table, but there are no write paths wired to it yet.
- There is no dedicated public-content table yet for generated SEO copy or per-domain lander content.
- There is no dedicated draft table yet for outreach/reply/negotiation drafts.
- The public router is currently `/portfolio` and `/d/:domainId`; admin lives under `/admin/*`.

## Exact Collision Risks

### Prompts 1-4: Public Content And SEO

Main risk:

- Prompt 3 and Prompt 4 will likely need a new content-storage model.
- If that content is stored directly on `domains`, later prompt work will collide with operational fields like pricing, migration, and registrar state.

Recommended ownership:

- keep generated public content in a separate table, not on `domains`
- prefer a table named `domain_page_content` or `domain_page_contents`
- keep raw generated JSON or model metadata separate from rendered HTML/text if auditability matters later

Route risk:

- avoid switching to root-level `/:slug` landers now
- keep public routes on `/portfolio` and `/d/:domainId` until the later public/admin/API split is complete

### Prompt 5: Buyer Discovery

Main risk:

- do not add a second `source` field to `leads`
- do not create a separate buyer-discovery lead table if the existing `leads` table can carry the record

Current state:

- `leads.source` already exists, so any prompt that assumes it is missing will create a redundant migration

Recommended ownership:

- buyer discovery owns lead creation, buyer-fit reasoning, and deduplication
- it should write into `leads` and, if needed, a supporting reasons/notes table
- it should not own outreach sending or reply classification

### Prompts 6-7: Inbox, Reply Intelligence, Negotiation Assistant

Main risk:

- these prompts can easily invent a second conversation model
- that would conflict with the existing `outreach_threads` / `messages` / `followup_tasks` / `inbound_inquiries` structure

Recommended ownership:

- keep `outreach_threads`, `messages`, `followup_tasks`, and `inbound_inquiries` as the canonical conversation spine
- if draft persistence is needed, add one shared draft table rather than separate draft tables per prompt
- a good shared name would be `communication_drafts` or `message_drafts`
- do not let prompt 7 define its own thread or message model

### Prompts 8-9: Outreach Drafts And Guarded Auto-Send

Main risk:

- prompt 8 may want draft persistence
- prompt 9 may want send attempts, caps, pause flags, and audit logging
- if these are modeled ad hoc, they will drift apart fast

Current state:

- `do_not_contact` already exists on `leads`
- `audit_log` already exists, so new work should write to it rather than creating a parallel audit table

Recommended ownership:

- use `do_not_contact` as the canonical suppression flag for now
- add send/draft audit records into the existing `audit_log` table
- if outreach drafts need persistence, store them in a dedicated draft table separate from `messages`
- keep `messages` immutable as the sent/inbound communication record

### Prompt 10: Public/Admin/API Split Preparation

Main risk:

- if the split is started before prompts 1-9 settle, the refactor will chase moving targets
- route, UI, and worker boundaries all overlap with the public lander and outreach surfaces

Recommended ownership:

- treat prompt 10 as a boundary-cleanup pass after the public content and intelligence slices stabilize
- do not move route ownership while prompt 1-4 are still defining public pages
- do not refactor communication storage while prompt 6-9 are still defining the message lifecycle

## Safe Ordering

### Order For The Next Agents

1. Public Content Agent: prompts 1-4
2. AI Intelligence Agent: prompts 5-7
3. Outreach Safety & Architecture Agent: prompts 8-10

### Internal Order Within Each Agent

Public Content Agent:

1. public portfolio overview
2. public domain page
3. content storage schema
4. SEO generation

AI Intelligence Agent:

1. buyer discovery
2. reply intelligence
3. negotiation assistant

Outreach Safety & Architecture Agent:

1. boundary audit
2. outreach draft workflow
3. persistence and audit plumbing
4. guarded auto-send
5. public/admin/API split cleanup

## Schema Ownership Rules

- `domains`: operational domain record only
- `leads`: buyer record, with `source` and `do_not_contact` already canonical
- `inbound_inquiries`: public inbound capture
- `outreach_threads`, `messages`, `followup_tasks`: communication spine
- `audit_log`: cross-cutting audit trail
- new generated public content: separate content table
- new draft persistence: separate draft table

## Migration Collision Watchlist

- no migration should add `leads.source`
- no migration should add a second `do_not_contact` field or a global suppression table unless a later phase explicitly requires it
- no migration should replace `audit_log` with a new audit table
- no migration should store generated SEO text directly on `domains`
- no migration should create separate thread models for buyer discovery, inbox replies, and negotiation
- no migration should change public routes to root-level slugs before the boundary split is complete

## Suggested Implementation Checkpoints

- verify all current D1 tables before any new migration lands
- write one shared AI/provider helper before multiple prompts introduce separate Anthropic wrappers
- prefer additive tables over widening `domains` or `messages`
- keep generated content and operational state separated so later admin editing stays clean

## Main-Thread Integration Checklist

Use this as the narrow handoff list during implementation:

### Schema / API cautions

- Do not add `leads.source`; it already exists.
- Do not add a second `do_not_contact` field; keep `leads.do_not_contact` canonical.
- Do not replace `audit_log`; write future audit events into the existing table.
- Do not store generated SEO/lander content on `domains`; use a separate content table.
- Do not create separate thread/message models for buyer discovery, inbox replies, or negotiation; keep one communication spine.
- Do not change public routes to root-level slugs before the public/admin/API split work is complete.

### File-boundary cautions

- Keep public content work in the public content slice only; do not mix it with buyer discovery or outreach sending.
- Keep buyer discovery inside the intelligence slice; do not let it own outbound send logic.
- Keep outreach draft/auto-send work separate from reply intelligence and negotiation logic.
- Treat prompt 10 as boundary cleanup after the public and intelligence slices settle, not as a first-pass refactor.
- Prefer one shared AI/provider helper over multiple prompt-specific Anthropic wrappers in different folders.
