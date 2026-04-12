# Domain CRUD, Real Metrics & CSV Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all demo-data-driven behaviour with real D1-backed domain CRUD, CSV import, and live dashboard metrics so the admin can manage an actual portfolio.

**Architecture:** A new `domain-repository.ts` handles all DB reads/writes for domains. The Worker routes are updated to call it. Pricing is computed on-the-fly by `generatePriceRecommendation` (already deterministic and tested) and embedded in the API response to satisfy the `DomainRecord` shape the frontend expects. A pure `csv-import.ts` module handles CSV row parsing and validation — testable without D1.

**Tech Stack:** Drizzle ORM, Cloudflare D1, Hono (Worker), React + Vite (frontend), Zod, papaparse (already in dependencies), vitest

---

## ⚠️ Things That Require The User (Do NOT implement these)

These are noted here so nothing is forgotten — but skip them during execution:

| What | Why user is needed |
|------|-------------------|
| Real portfolio CSV | User needs to provide their actual domain list |
| `EMAIL_FROM_ADDRESS` → real domain | User needs to purchase a dedicated domain and verify it in Resend |
| Cloudflare deployment | User needs to provide their CF account ID, zone, and pages project |
| Stripe account | For invoicing flows — not yet needed in Phase 1 test |

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/server/db/domain-repository.ts` | **Create** | List, get, create, update, delete, bulk-import domains |
| `src/lib/csv-import.ts` | **Create** | Parse + validate CSV rows into domain input objects (pure, no I/O) |
| `src/lib/csv-import.test.ts` | **Create** | Unit tests for CSV parsing |
| `src/server/db/ensure-outreach-schema.ts` | **Modify** | Add `price_recommendations` and remaining tables to `CREATE IF NOT EXISTS` block |
| `worker/index.ts` | **Modify** | Replace demo routes, add domain CRUD + CSV import routes, real dashboard metrics |
| `src/pages/DomainsPage.tsx` | **Modify** | Add "New domain" inline form + CSV upload button |
| `src/pages/DomainDetailPage.tsx` | **Modify** | Add inline edit form |

---

## Task 1: CSV parsing module (pure, tested first)

**Files:**
- Create: `src/lib/csv-import.ts`
- Create: `src/lib/csv-import.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/csv-import.test.ts
import { describe, expect, it } from 'vitest'
import { parseDomainCsvRow, parseDomainCsvRows } from './csv-import'

describe('parseDomainCsvRow', () => {
  it('parses a valid row', () => {
    const result = parseDomainCsvRow({
      domain_name: 'test.nl',
      tld: '.nl',
      language: 'nl',
      category: 'marketing',
      status: 'listed',
      sell_mode: 'portfolio_redirect',
      current_registrar: 'xel',
      acquisition_cost: '45',
      annual_renewal_cost: '12',
      notes: 'Test domain',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.domainName).toBe('test.nl')
      expect(result.value.tld).toBe('.nl')
      expect(result.value.acquisitionCost).toBe(45)
      expect(result.value.annualRenewalCost).toBe(12)
    }
  })

  it('normalises tld to include leading dot', () => {
    const result = parseDomainCsvRow({
      domain_name: 'test.nl',
      tld: 'nl',
      language: 'nl',
      category: 'marketing',
      status: 'listed',
      sell_mode: 'portfolio_redirect',
      current_registrar: 'xel',
      acquisition_cost: '',
      annual_renewal_cost: '',
      notes: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tld).toBe('.nl')
    }
  })

  it('returns error when domain_name is missing', () => {
    const result = parseDomainCsvRow({
      domain_name: '',
      tld: '.nl',
      language: 'nl',
      category: 'marketing',
      status: 'listed',
      sell_mode: 'portfolio_redirect',
      current_registrar: 'xel',
      acquisition_cost: '',
      annual_renewal_cost: '',
      notes: '',
    })
    expect(result.ok).toBe(false)
  })

  it('defaults missing optional fields', () => {
    const result = parseDomainCsvRow({
      domain_name: 'test.nl',
      tld: '.nl',
      language: '',
      category: '',
      status: '',
      sell_mode: '',
      current_registrar: '',
      acquisition_cost: '',
      annual_renewal_cost: '',
      notes: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.language).toBe('EN')
      expect(result.value.status).toBe('listed')
      expect(result.value.sellMode).toBe('portfolio_redirect')
      expect(result.value.currentRegistrar).toBe('xel')
      expect(result.value.acquisitionCost).toBe(0)
    }
  })
})

describe('parseDomainCsvRows', () => {
  it('returns parsed values and errors separately', () => {
    const result = parseDomainCsvRows([
      { domain_name: 'good.nl', tld: '.nl', language: 'nl', category: 'marketing', status: 'listed', sell_mode: 'portfolio_redirect', current_registrar: 'xel', acquisition_cost: '10', annual_renewal_cost: '12', notes: '' },
      { domain_name: '', tld: '.nl', language: 'nl', category: 'marketing', status: 'listed', sell_mode: 'portfolio_redirect', current_registrar: 'xel', acquisition_cost: '', annual_renewal_cost: '', notes: '' },
    ])
    expect(result.imported).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].row).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:run src/lib/csv-import.test.ts
```
Expected: FAIL — `csv-import` module not found

- [ ] **Step 3: Create `src/lib/csv-import.ts`**

```typescript
export interface DomainCsvRow {
  domain_name: string
  tld: string
  language: string
  category: string
  status: string
  sell_mode: string
  current_registrar: string
  acquisition_cost: string
  annual_renewal_cost: string
  notes: string
}

export interface DomainImportInput {
  domainName: string
  tld: string
  language: string
  category: string
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function parseDomainCsvRow(row: DomainCsvRow): ParseResult<DomainImportInput> {
  if (!row.domain_name || !row.domain_name.trim()) {
    return { ok: false, error: 'domain_name is required' }
  }

  const tld = row.tld.trim()
  const normalisedTld = tld.startsWith('.') ? tld : `.${tld}`

  return {
    ok: true,
    value: {
      domainName: row.domain_name.trim().toLowerCase(),
      tld: normalisedTld,
      language: row.language?.trim().toUpperCase() || 'EN',
      category: row.category?.trim() || 'general',
      status: row.status?.trim() || 'listed',
      sellMode: row.sell_mode?.trim() || 'portfolio_redirect',
      currentRegistrar: row.current_registrar?.trim() || 'xel',
      acquisitionCost: row.acquisition_cost ? Number(row.acquisition_cost) : 0,
      annualRenewalCost: row.annual_renewal_cost ? Number(row.annual_renewal_cost) : 0,
      notes: row.notes?.trim() || '',
      migrationCandidate: false,
    },
  }
}

export interface CsvImportResult {
  imported: DomainImportInput[]
  errors: Array<{ row: number; error: string }>
}

export function parseDomainCsvRows(rows: DomainCsvRow[]): CsvImportResult {
  const imported: DomainImportInput[] = []
  const errors: Array<{ row: number; error: string }> = []

  rows.forEach((row, index) => {
    const result = parseDomainCsvRow(row)
    if (result.ok) {
      imported.push(result.value)
    } else {
      errors.push({ row: index, error: result.error })
    }
  })

  return { imported, errors }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run src/lib/csv-import.test.ts
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv-import.ts src/lib/csv-import.test.ts
git commit -m "feat: add pure CSV row parsing module with tests"
```

---

## Task 2: Domain DB repository

**Files:**
- Create: `src/server/db/domain-repository.ts`

- [ ] **Step 1: Create `src/server/db/domain-repository.ts`**

```typescript
import { and, count, desc, eq, sum } from 'drizzle-orm'
import type { DomainImportInput } from '../../lib/csv-import'
import { generatePriceRecommendation } from '../../lib/pricing-engine'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { domains } from './schema'

export interface DomainRow {
  id: string
  domainName: string
  tld: string
  language: string | null
  category: string | null
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number | null
  annualRenewalCost: number | null
  notes: string | null
  migrationCandidate: boolean
  targetRegistrar: string | null
  createdAt: number
  updatedAt: number
}

export interface DomainApiRecord {
  id: string
  domainName: string
  tld: string
  language: string
  category: string
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
  targetRegistrar: string | null
  quickSalePrice: number
  targetPrice: number
  aspirationalPrice: number
}

export interface CreateDomainInput {
  domainName: string
  tld: string
  language: string
  category: string
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
  targetRegistrar?: string
}

export interface UpdateDomainInput {
  language?: string
  category?: string
  status?: string
  sellMode?: string
  notes?: string
  acquisitionCost?: number
  annualRenewalCost?: number
  migrationCandidate?: boolean
  targetRegistrar?: string | null
}

function domainId(domainName: string): string {
  return domainName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function withPrices(row: DomainRow): DomainApiRecord {
  const rec = generatePriceRecommendation({
    domainName: row.domainName,
    extension: row.tld,
    language: row.language ?? undefined,
    category: row.category ?? undefined,
  })

  return {
    id: row.id,
    domainName: row.domainName,
    tld: row.tld,
    language: row.language ?? 'EN',
    category: row.category ?? 'general',
    status: row.status,
    sellMode: row.sellMode,
    currentRegistrar: row.currentRegistrar,
    acquisitionCost: row.acquisitionCost ?? 0,
    annualRenewalCost: row.annualRenewalCost ?? 0,
    notes: row.notes ?? '',
    migrationCandidate: row.migrationCandidate,
    targetRegistrar: row.targetRegistrar ?? null,
    quickSalePrice: rec.quickSalePrice,
    targetPrice: rec.targetPrice,
    aspirationalPrice: rec.aspirationalPrice,
  }
}

export async function listDomains(binding: D1Database): Promise<DomainApiRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const rows = await db
    .select()
    .from(domains)
    .orderBy(desc(domains.createdAt)) as DomainRow[]
  return rows.map(withPrices)
}

export async function getDomain(binding: D1Database, id: string): Promise<DomainApiRecord | null> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [row] = await db.select().from(domains).where(eq(domains.id, id)).limit(1) as DomainRow[]
  return row ? withPrices(row) : null
}

export async function createDomain(binding: D1Database, input: CreateDomainInput): Promise<DomainApiRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const now = Date.now()
  const id = domainId(input.domainName)

  await db.insert(domains).values({
    id,
    domainName: input.domainName,
    tld: input.tld,
    language: input.language,
    category: input.category,
    status: input.status,
    sellMode: input.sellMode,
    currentRegistrar: input.currentRegistrar,
    currentRegistrarReference: null,
    acquisitionCost: input.acquisitionCost,
    annualRenewalCost: input.annualRenewalCost,
    notes: input.notes,
    trafficNotes: null,
    whoisOwnerState: null,
    nameserverState: null,
    authCodeStatus: null,
    migrationCandidate: input.migrationCandidate,
    targetRegistrar: input.targetRegistrar ?? null,
    transferEligibility: null,
    migrationPriority: null,
    migrationNotes: null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing()

  const domain = await getDomain(binding, id)
  if (!domain) throw new Error(`Domain ${input.domainName} could not be created.`)
  return domain
}

export async function updateDomain(binding: D1Database, id: string, input: UpdateDomainInput): Promise<DomainApiRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const updates: Record<string, unknown> = { updatedAt: Date.now() }
  if (input.language !== undefined) updates.language = input.language
  if (input.category !== undefined) updates.category = input.category
  if (input.status !== undefined) updates.status = input.status
  if (input.sellMode !== undefined) updates.sellMode = input.sellMode
  if (input.notes !== undefined) updates.notes = input.notes
  if (input.acquisitionCost !== undefined) updates.acquisitionCost = input.acquisitionCost
  if (input.annualRenewalCost !== undefined) updates.annualRenewalCost = input.annualRenewalCost
  if (input.migrationCandidate !== undefined) updates.migrationCandidate = input.migrationCandidate
  if (input.targetRegistrar !== undefined) updates.targetRegistrar = input.targetRegistrar

  await db.update(domains).set(updates).where(eq(domains.id, id))

  const domain = await getDomain(binding, id)
  if (!domain) throw new Error(`Domain ${id} not found after update.`)
  return domain
}

export async function deleteDomain(binding: D1Database, id: string): Promise<void> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  await db.delete(domains).where(eq(domains.id, id))
}

export async function importDomains(binding: D1Database, inputs: DomainImportInput[]): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0

  for (const input of inputs) {
    try {
      await createDomain(binding, {
        ...input,
        migrationCandidate: input.migrationCandidate ?? false,
      })
      created++
    } catch {
      skipped++
    }
  }

  return { created, skipped }
}

export interface DashboardMetrics {
  domains: number
  inboundInquiries: number
  dealsInProgress: number
  migrationCandidates: number
  pipelineValue: number
}

export async function getDashboardMetrics(binding: D1Database): Promise<DashboardMetrics> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const [domainCount] = await db
    .select({ value: count() })
    .from(domains)

  const { inboundInquiries, deals } = await import('./schema').then((m) => m)

  const [inquiryCount] = await db
    .select({ value: count() })
    .from(inboundInquiries)

  const [dealCount] = await db
    .select({ value: count() })
    .from(deals)
    .where(and(
      eq(deals.status, 'offer_accepted'),
    ))

  const [migrationCount] = await db
    .select({ value: count() })
    .from(domains)
    .where(eq(domains.migrationCandidate, true))

  const [pipeline] = await db
    .select({ value: sum(deals.agreedPrice) })
    .from(deals)

  return {
    domains: domainCount?.value ?? 0,
    inboundInquiries: inquiryCount?.value ?? 0,
    dealsInProgress: dealCount?.value ?? 0,
    migrationCandidates: migrationCount?.value ?? 0,
    pipelineValue: Number(pipeline?.value ?? 0),
  }
}
```

- [ ] **Step 2: Run full check to verify types compile**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/db/domain-repository.ts
git commit -m "feat: add domain DB repository with CRUD, import, and dashboard metrics"
```

---

## Task 3: Worker routes — replace demo with real DB

**Files:**
- Modify: `worker/index.ts`

- [ ] **Step 1: Replace demo-driven routes**

Replace the imports block at the top of `worker/index.ts`. Find and replace the existing imports for `demoDeals`, `demoDomains`, `demoLeads` and the existing `/api/domains`, `/api/domains/:domainId`, `/api/dashboard`, and `/api/leads` routes. Also add new domain CRUD routes. Replace the full file content:

Add these imports to the existing imports at the top of `worker/index.ts`:

```typescript
import { parseDomainCsvRows, type DomainCsvRow } from '../src/lib/csv-import'
import {
  createDomain,
  deleteDomain,
  getDashboardMetrics,
  getDomain,
  importDomains,
  listDomains,
  updateDomain,
} from '../src/server/db/domain-repository'
```

Remove these imports (no longer needed):

```typescript
import { demoDeals, demoDomains, demoLeads } from '../src/lib/demo-data'
```

- [ ] **Step 2: Add Zod schemas for domain CRUD**

Add after the existing `progressDealSchema` in `worker/index.ts`:

```typescript
const createDomainSchema = z.object({
  domainName: z.string().min(3),
  tld: z.string().min(2),
  language: z.enum(['NL', 'EN']).default('EN'),
  category: z.string().min(1),
  status: z.enum(['draft', 'listed', 'inbound_only', 'outbound_research', 'negotiation', 'deal_in_progress', 'sold', 'drop_candidate']).default('listed'),
  sellMode: z.enum(['afternic_lander', 'sedo_lander', 'portfolio_redirect']).default('portfolio_redirect'),
  currentRegistrar: z.enum(['xel', 'dynadot', 'openprovider']).default('xel'),
  acquisitionCost: z.coerce.number().min(0).default(0),
  annualRenewalCost: z.coerce.number().min(0).default(0),
  notes: z.string().default(''),
  migrationCandidate: z.boolean().default(false),
  targetRegistrar: z.enum(['dynadot', 'openprovider']).optional(),
})

const updateDomainSchema = createDomainSchema.partial().omit({ domainName: true, tld: true })

const csvImportSchema = z.object({
  rows: z.array(z.object({
    domain_name: z.string(),
    tld: z.string(),
    language: z.string(),
    category: z.string(),
    status: z.string(),
    sell_mode: z.string(),
    current_registrar: z.string(),
    acquisition_cost: z.string(),
    annual_renewal_cost: z.string(),
    notes: z.string(),
  })),
})
```

- [ ] **Step 3: Replace demo routes with real DB routes**

Replace the existing `app.get('/api/dashboard', ...)` route with:

```typescript
app.get('/api/dashboard', async (c) => {
  const metrics = await getDashboardMetrics(c.env.DB)
  return c.json({
    metrics: {
      ...metrics,
      xelTransferCheckpoints: 0,
      repliesAwaitingAction: 0,
      followUpsDueThisWeek: 0,
      draftOutreachQueue: 0,
    },
  })
})
```

Replace the existing `app.get('/api/domains', ...)` route with:

```typescript
app.get('/api/domains', async (c) => {
  const items = await listDomains(c.env.DB)
  return c.json({
    items,
    meta: {
      currentRegistrar: 'xel',
      migrationCandidates: items.filter((d) => d.migrationCandidate).length,
    },
  })
})
```

Replace the existing `app.get('/api/domains/:domainId', ...)` route with:

```typescript
app.get('/api/domains/:domainId', async (c) => {
  const domain = await getDomain(c.env.DB, c.req.param('domainId'))

  if (!domain) {
    return c.json({ error: 'Domain not found.' }, 404)
  }

  const recommendation = generatePriceRecommendation({
    domainName: domain.domainName,
    extension: domain.tld,
    language: domain.language,
    category: domain.category,
  })

  return c.json({ item: domain, recommendation })
})
```

Replace the existing `app.get('/api/leads', ...)` route with:

```typescript
app.get('/api/leads', (c) =>
  c.json({
    items: [],
    meta: { total: 0, doNotContact: 0 },
  }),
)
```

Add new domain mutation routes after the existing `/api/domains/:domainId` GET route:

```typescript
app.post('/api/domains', zValidator('json', createDomainSchema), async (c) => {
  try {
    const domain = await createDomain(c.env.DB, c.req.valid('json'))
    return c.json({ ok: true, item: domain }, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not create domain.' }, 400)
  }
})

app.put('/api/domains/:domainId', zValidator('json', updateDomainSchema), async (c) => {
  try {
    const domain = await updateDomain(c.env.DB, c.req.param('domainId'), c.req.valid('json'))
    return c.json({ ok: true, item: domain })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not update domain.' }, 400)
  }
})

app.delete('/api/domains/:domainId', async (c) => {
  try {
    await deleteDomain(c.env.DB, c.req.param('domainId'))
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not delete domain.' }, 400)
  }
})

app.post('/api/domains/import', zValidator('json', csvImportSchema), async (c) => {
  const { rows } = c.req.valid('json')
  const parsed = parseDomainCsvRows(rows as DomainCsvRow[])
  const result = await importDomains(c.env.DB, parsed.imported)
  return c.json({ ok: true, ...result, parseErrors: parsed.errors })
})
```

- [ ] **Step 4: Update `src/lib/api.ts` with new client functions**

Add these functions to `src/lib/api.ts`:

```typescript
export interface CreateDomainPayload {
  domainName: string
  tld: string
  language: 'NL' | 'EN'
  category: string
  status: DomainStatus
  sellMode: SellMode
  currentRegistrar: 'xel' | 'dynadot' | 'openprovider'
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
  targetRegistrar?: 'dynadot' | 'openprovider'
}

export function createDomainApi(payload: CreateDomainPayload) {
  return fetchJson<{ ok: true; item: DomainRecord }>('/api/domains', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateDomainApi(domainId: string, payload: Partial<Omit<CreateDomainPayload, 'domainName' | 'tld'>>) {
  return fetchJson<{ ok: true; item: DomainRecord }>(`/api/domains/${domainId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteDomainApi(domainId: string) {
  return fetchJson<{ ok: true }>(`/api/domains/${domainId}`, {
    method: 'DELETE',
  })
}

export function importDomainsApi(rows: Array<Record<string, string>>) {
  return fetchJson<{ ok: true; created: number; skipped: number; parseErrors: Array<{ row: number; error: string }> }>('/api/domains/import', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  })
}
```

- [ ] **Step 5: Run full check**

```bash
pnpm check
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts src/lib/api.ts
git commit -m "feat: replace demo domain routes with real D1-backed CRUD"
```

---

## Task 4: Admin — domain create form

**Files:**
- Modify: `src/pages/DomainsPage.tsx`

- [ ] **Step 1: Add create form to DomainsPage**

Replace the contents of `src/pages/DomainsPage.tsx` with:

```typescript
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import { createDomainApi, fetchDomains, importDomainsApi, type CreateDomainPayload } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import type { DomainRecord } from '@/types/domain'

const EMPTY_FORM: CreateDomainPayload = {
  domainName: '',
  tld: '',
  language: 'NL',
  category: '',
  status: 'listed',
  sellMode: 'portfolio_redirect',
  currentRegistrar: 'xel',
  acquisitionCost: 0,
  annualRenewalCost: 0,
  notes: '',
  migrationCandidate: false,
}

export function DomainsPage() {
  const [domains, setDomains] = useState<DomainRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateDomainPayload>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load() {
    let active = true
    fetchDomains()
      .then((response) => { if (active) { setDomains(response.items); setLoaded(true) } })
      .catch((err: Error) => { if (active) { setError(err.message); setLoaded(true) } })
    return () => { active = false }
  }

  useEffect(load, [])

  function deriveTld(domainName: string) {
    const parts = domainName.split('.')
    return parts.length >= 2 ? `.${parts[parts.length - 1]}` : ''
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const tld = form.tld || deriveTld(form.domainName)
      await createDomainApi({ ...form, tld })
      setForm(EMPTY_FORM)
      setShowForm(false)
      load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create domain.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportStatus('Importing...')
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map((h) => h.trim())
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim())
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
    try {
      const result = await importDomainsApi(rows)
      setImportStatus(`Imported ${result.created} domain(s). Skipped ${result.skipped}. Errors: ${result.parseErrors.length}.`)
      load()
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed.')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (error) {
    return <SectionCard title="Domain portfolio" subtitle="Kon de domeinen niet laden.">{error}</SectionCard>
  }

  if (!loaded) {
    return <SectionCard title="Domain portfolio" subtitle="Domeinen laden...">Even geduld.</SectionCard>
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Domain portfolio"
        subtitle="Phase 1 keeps current domains at Xel while tracking pricing, migration readiness, and lander state."
      >
        <div className="mb-4 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ New domain'}
          </button>
          <label className="cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
          {importStatus ? <span className="self-center text-sm text-slate-600">{importStatus}</span> : null}
        </div>

        {showForm ? (
          <form className="mb-6 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2" onSubmit={handleCreate}>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Domain name</label>
              <input
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="example.nl"
                value={form.domainName}
                onChange={(e) => setForm((f) => ({ ...f, domainName: e.target.value, tld: deriveTld(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Category</label>
              <input
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="e.g. marketing"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Language</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as 'NL' | 'EN' }))}
              >
                <option value="NL">NL</option>
                <option value="EN">EN</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Status</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CreateDomainPayload['status'] }))}
              >
                {(['draft','listed','inbound_only','outbound_research','negotiation','deal_in_progress','sold','drop_candidate'] as const).map((s) => (
                  <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Acquisition cost (€)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.acquisitionCost}
                onChange={(e) => setForm((f) => ({ ...f, acquisitionCost: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Annual renewal (€)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.annualRenewalCost}
                onChange={(e) => setForm((f) => ({ ...f, annualRenewalCost: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Notes</label>
              <textarea
                className="min-h-16 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {submitError ? <p className="md:col-span-2 text-sm text-rose-700">{submitError}</p> : null}
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Add domain'}
              </button>
            </div>
          </form>
        ) : null}

        {domains.length === 0 ? (
          <p className="text-sm text-slate-500">No domains yet. Add one above or import a CSV.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Registrar</th>
                  <th className="px-4 py-3">Target price</th>
                  <th className="px-4 py-3">Migration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <td className="px-4 py-4">
                      <Link className="font-medium text-emerald-800 hover:text-emerald-600" to={`/admin/domains/${domain.id}`}>
                        {domain.domainName}
                      </Link>
                    </td>
                    <td className="px-4 py-4 capitalize">{domain.status.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-4 uppercase">{domain.currentRegistrar}</td>
                    <td className="px-4 py-4">{formatCurrency(domain.targetPrice)}</td>
                    <td className="px-4 py-4">{domain.migrationCandidate ? `Candidate for ${domain.targetRegistrar}` : 'Hold at Xel'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
```

- [ ] **Step 2: Run check**

```bash
pnpm check
```
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/pages/DomainsPage.tsx
git commit -m "feat: add domain create form and CSV import to admin domains page"
```

---

## Task 5: Admin — domain edit form

**Files:**
- Modify: `src/pages/DomainDetailPage.tsx`

- [ ] **Step 1: Replace DomainDetailPage with editable version**

Replace the contents of `src/pages/DomainDetailPage.tsx` with:

```typescript
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import { deleteDomainApi, fetchDomain, updateDomainApi, type CreateDomainPayload, type PriceRecommendationSummary } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import type { DomainRecord } from '@/types/domain'

export function DomainDetailPage() {
  const { domainId } = useParams()
  const missingDomainId = !domainId
  const [domain, setDomain] = useState<DomainRecord | null>(null)
  const [recommendation, setRecommendation] = useState<PriceRecommendationSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Omit<CreateDomainPayload, 'domainName' | 'tld'>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (missingDomainId) return
    let active = true
    fetchDomain(domainId)
      .then((response) => {
        if (active) {
          setDomain(response.item)
          setRecommendation(response.recommendation)
        }
      })
      .catch((err: Error) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [domainId, missingDomainId])

  function startEdit() {
    if (!domain) return
    setForm({
      language: domain.language as 'NL' | 'EN',
      category: domain.category,
      status: domain.status,
      sellMode: domain.sellMode,
      notes: domain.notes,
      acquisitionCost: domain.acquisitionCost,
      annualRenewalCost: domain.annualRenewalCost,
      migrationCandidate: domain.migrationCandidate,
      targetRegistrar: domain.targetRegistrar as 'dynadot' | 'openprovider' | undefined,
    })
    setEditing(true)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!domainId) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateDomainApi(domainId, form)
      setDomain(updated.item)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!domainId || !confirm(`Delete ${domain?.domainName}? This cannot be undone.`)) return
    try {
      await deleteDomainApi(domainId)
      window.history.back()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not delete.')
    }
  }

  if (missingDomainId) return <SectionCard title="Domain detail" subtitle="Geen domein geselecteerd.">Kies eerst een domein.</SectionCard>
  if (error) return <SectionCard title="Domain detail" subtitle="Kon het domein niet laden.">{error}</SectionCard>
  if (!domain || !recommendation) return <SectionCard title="Domain detail" subtitle="Laden...">Even geduld.</SectionCard>

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <SectionCard title={domain.domainName} subtitle="Domain details, pricing, and registrar state.">
        {editing ? (
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSave}>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Category</label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.category ?? ''} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Language</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.language ?? 'EN'} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as 'NL' | 'EN' }))}>
                <option value="NL">NL</option>
                <option value="EN">EN</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Status</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.status ?? 'listed'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DomainRecord['status'] }))}>
                {(['draft','listed','inbound_only','outbound_research','negotiation','deal_in_progress','sold','drop_candidate'] as const).map((s) => (
                  <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Sell mode</label>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.sellMode ?? 'portfolio_redirect'} onChange={(e) => setForm((f) => ({ ...f, sellMode: e.target.value as DomainRecord['sellMode'] }))}>
                <option value="portfolio_redirect">Portfolio redirect</option>
                <option value="afternic_lander">Afternic lander</option>
                <option value="sedo_lander">Sedo lander</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Acquisition cost (€)</label>
              <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.acquisitionCost ?? 0} onChange={(e) => setForm((f) => ({ ...f, acquisitionCost: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Annual renewal (€)</label>
              <input type="number" min="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.annualRenewalCost ?? 0} onChange={(e) => setForm((f) => ({ ...f, annualRenewalCost: Number(e.target.value) }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Notes</label>
              <textarea className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {saveError ? <p className="md:col-span-2 text-sm text-rose-700">{saveError}</p> : null}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save changes'}</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700">Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <dl className="grid gap-4 md:grid-cols-2">
              <Detail label="Category" value={domain.category} />
              <Detail label="Status" value={domain.status.replaceAll('_', ' ')} />
              <Detail label="Current registrar" value={domain.currentRegistrar.toUpperCase()} />
              <Detail label="Sell mode" value={domain.sellMode.replaceAll('_', ' ')} />
              <Detail label="Acquisition cost" value={formatCurrency(domain.acquisitionCost)} />
              <Detail label="Renewal cost" value={formatCurrency(domain.annualRenewalCost)} />
            </dl>
            <div className="mt-4 flex gap-3">
              <button onClick={startEdit} className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">Edit domain</button>
              <button onClick={handleDelete} className="rounded-full border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50">Delete</button>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Pricing engine" subtitle="Deterministic signals generate quick-sale, target, and aspirational price bands.">
        <div className="grid gap-4 md:grid-cols-3">
          <Detail label="Quick sale" value={formatCurrency(recommendation.quickSalePrice)} />
          <Detail label="Target" value={formatCurrency(recommendation.targetPrice)} />
          <Detail label="Aspirational" value={formatCurrency(recommendation.aspirationalPrice)} />
        </div>
        <div className="mt-5 rounded-3xl bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-950">Confidence {recommendation.confidenceScore}/100</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-emerald-950/80">
            {recommendation.rationale.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 text-lg font-medium capitalize text-slate-950">{value}</dd>
    </div>
  )
}
```

- [ ] **Step 2: Run check**

```bash
pnpm check
```
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/pages/DomainDetailPage.tsx
git commit -m "feat: add inline edit and delete to domain detail page"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full check**

```bash
pnpm check
```
Expected: typecheck pass, lint pass, 83+ tests pass, build pass

- [ ] **Step 2: Start both servers and do a manual smoke test**

```bash
# Terminal 1
pnpm cf:dev

# Terminal 2
pnpm dev
```

Manual checks:
- `http://localhost:5173/` — dashboard shows 0 domains (real DB, not demo data)
- `http://localhost:5173/admin/domains` — empty state with "No domains yet"
- Click "+ New domain", fill in a domain, click "Add domain" — domain appears in list
- Click the domain — detail page shows pricing, "Edit domain" button works
- `http://localhost:5173/portfolio` — shows domains from DB
- Go to a domain's public page, submit the inquiry form — email arrives at `info@soundsclear.nl`
- `http://localhost:5173/admin/inbox` — inquiry appears

- [ ] **Step 3: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "feat: Phase 1 domain CRUD MVP complete"
```
