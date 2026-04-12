# Buyer Discovery Engine — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Goal

Given a domain, automatically find potential buyers by combining web search (Brave Search API) with LLM-powered semantic reasoning (Anthropic). Results are stored as leads in the existing D1 `leads` table and surfaced in the domain detail page.

---

## Architecture

### Trigger

User clicks "Find buyers" on the `DomainDetailPage`. This calls:

```
POST /api/domains/:id/buyer-discovery
```

The worker runs the discovery pipeline and returns the newly created leads.

### Pipeline (two-phase)

```
Worker receives request
  → Phase 1: LLM generates 5-8 search queries (different buyer angles)
  → Phase 2: Execute all queries in parallel via Brave Search API
  → Phase 3: LLM synthesizes all results into a deduplicated lead list (max 10)
  → Phase 4: Insert new leads into D1 (skip duplicates by website)
  ← Return created leads to frontend
```

### New Cloudflare secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | LLM calls (query generation + synthesis) |
| `BRAVE_SEARCH_API_KEY` | Web search |

---

## LLM Strategy

### Call 1 — Query generation

**Input:** domain name, TLD, category, language, notes

**Task:** Think in multiple buyer angles and generate 1-2 Brave search queries per angle.

**Angles:**
- Direct user (company that naturally wants this exact type of name)
- SEO value (who benefits from having the search term in their domain)
- Geographic (for .nl: companies in the implied city/region)
- Defensive acquisition (competitor preventing others from owning it)
- Indirect vertical (adjacent industries that could benefit)

**Output:** `Array<{ angle: string, query: string }>` — maximum 8 queries.

### Call 2 — Synthesis

**Input:** all Brave search results combined + domain info

**Task:** Filter noise, deduplicate, and return a scored lead list.

**Output:**
```typescript
Array<{
  companyName: string
  website: string
  buyerFitReason: string   // 1-2 sentences why this company would want this domain
  angle: string
  priorityScore: number    // 1-10
}>
```

Maximum 10 leads per run. `buyerFitReason` maps directly to the `buyer_fit_reason` column in the `leads` table.

---

## Data Model

Reuses the existing `leads` table. No schema changes needed.

| Column | Value |
|---|---|
| `domain_id` | ID of the domain being searched |
| `source` | `'buyer_discovery'` |
| `buyer_fit_reason` | LLM-generated explanation |
| `priority_score` | LLM score 1-10 |
| `company_name` | From synthesis |
| `website` | From synthesis |

**Deduplication:** Before inserting, check if a lead with the same `website` and `domain_id` already exists. If so, skip. This makes re-runs safe and additive.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/buyer-discovery.ts` | Pure discovery pipeline — LLM calls, search calls, dedup logic |
| `src/server/db/leads-repository.ts` | Query: find existing leads for domain; Insert: create new leads |
| `worker/index.ts` | Add POST `/api/domains/:id/buyer-discovery` route |
| `src/pages/DomainDetailPage.tsx` | Add "Potential buyers" card with Find buyers button |
| `src/lib/api.ts` | Add `triggerBuyerDiscovery(domainId)` function |

---

## UI

A third `SectionCard` is added to the `DomainDetailPage` grid below the existing two cards.

**"Potential buyers" card:**
- "Find buyers" button — triggers discovery, shows loading state during run
- On completion: list of leads, each showing:
  - Company name + website (clickable link)
  - Buyer fit reason (1-2 sentences)
  - Priority score badge (1-10)
  - "via buyer discovery" source label
- If leads already exist from a previous run, they are shown immediately on page load
- Re-running adds new unique results; duplicates are silently skipped
- Full lead management (edit, delete) lives in the separate Leads page

---

## Error Handling

- If Brave API key is missing: return 500 with `"BRAVE_SEARCH_API_KEY not configured"`
- If Anthropic API key is missing: return 500 with `"ANTHROPIC_API_KEY not configured"`
- If a single Brave query fails: log and continue with remaining results (partial results are fine)
- If synthesis returns 0 leads: return `{ items: [] }` — not an error
- Frontend shows inline error message if the request fails

---

## What Requires the User

Before this feature works in production:
1. **Anthropic API key** — add as `ANTHROPIC_API_KEY` secret in Cloudflare Workers dashboard
2. **Brave Search API key** — sign up at api.search.brave.com, add as `BRAVE_SEARCH_API_KEY` secret
3. For local dev: add both to `wrangler.jsonc` vars (not committed to git)
