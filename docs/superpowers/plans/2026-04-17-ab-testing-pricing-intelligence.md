# A/B Testing & Pricing Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track which outreach email variants perform best and learn from pricing data, with automatic round-robin rotation, funnel-wide outcome tracking, and an admin experiments page.

**Architecture:** Four new DB tables (experiments, variants, assignments, outcomes) slot into the existing Drizzle schema. A rotation module picks the active variant for each lead at draft-time. Outcomes are logged automatically from existing worker endpoints. A new `/admin/experiments` page shows results and pricing intelligence.

**Tech Stack:** Drizzle ORM + D1 SQLite, Hono worker, React + TypeScript frontend, Zod validation.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/server/db/schema.ts` | Modify | Add 4 new Drizzle table definitions |
| `drizzle/0001_experiments.sql` | Create | Migration SQL for new tables |
| `src/server/db/experiment-repository.ts` | Create | All DB reads/writes for experiments system |
| `src/lib/outreach-draft.ts` | Modify | Add `hasPrice` + configurable `followupDays` params |
| `src/server/experiment-rotation.ts` | Create | Round-robin variant selection logic |
| `src/server/experiment-outcomes.ts` | Create | Functions to log outcome events |
| `worker/index.ts` | Modify | Add experiment API endpoints + hook outcomes into inquiry/deal handlers |
| `src/server/buyer-outreach.ts` | Modify | Pass variant config from rotation into draft builder |
| `src/lib/api.ts` | Modify | Add client-side experiment API calls |
| `src/pages/ExperimentsPage.tsx` | Create | Admin UI: experiment results + pricing intelligence |
| `src/components/AppShell.tsx` | Modify | Add Experiments nav link |

---

## Task 1: DB Schema — four new tables

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0001_experiments.sql`

- [ ] **Step 1: Add tables to schema.ts**

Open `src/server/db/schema.ts`. After the `auditLog` table at the bottom, add:

```ts
export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'), // active | paused | completed
  createdAt: integer('created_at').notNull(),
})

export const experimentVariants = sqliteTable('experiment_variants', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull().references(() => experiments.id),
  label: text('label').notNull(), // "A", "B", "C"
  tone: text('tone').notNull().default('standard'), // concise | standard | detailed
  hasPrice: integer('has_price', { mode: 'boolean' }).notNull().default(false),
  subjectSlot: text('subject_slot').notNull().default('default'), // default | question | benefit
  followupDays1: integer('followup_days_1').notNull().default(5),
  followupDays2: integer('followup_days_2').notNull().default(7),
})

export const experimentAssignments = sqliteTable('experiment_assignments', {
  id: text('id').primaryKey(),
  experimentId: text('experiment_id').notNull().references(() => experiments.id),
  variantId: text('variant_id').notNull().references(() => experimentVariants.id),
  leadId: text('lead_id').notNull().references(() => leads.id),
  threadId: text('thread_id').references(() => outreachThreads.id),
  assignedAt: integer('assigned_at').notNull(),
})

export const experimentOutcomes = sqliteTable('experiment_outcomes', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().references(() => experimentAssignments.id),
  outcomeType: text('outcome_type').notNull(), // reply_received | reply_positive | offer_made | deal_closed
  value: integer('value'), // eurocents for offer_made / deal_closed, null otherwise
  occurredAt: integer('occurred_at').notNull(),
})
```

- [ ] **Step 2: Create migration file**

Create `drizzle/0001_experiments.sql`:

```sql
CREATE TABLE experiments (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at integer NOT NULL
);

CREATE TABLE experiment_variants (
  id text PRIMARY KEY NOT NULL,
  experiment_id text NOT NULL REFERENCES experiments(id),
  label text NOT NULL,
  tone text NOT NULL DEFAULT 'standard',
  has_price integer NOT NULL DEFAULT 0,
  subject_slot text NOT NULL DEFAULT 'default',
  followup_days_1 integer NOT NULL DEFAULT 5,
  followup_days_2 integer NOT NULL DEFAULT 7
);

CREATE TABLE experiment_assignments (
  id text PRIMARY KEY NOT NULL,
  experiment_id text NOT NULL REFERENCES experiments(id),
  variant_id text NOT NULL REFERENCES experiment_variants(id),
  lead_id text NOT NULL REFERENCES leads(id),
  thread_id text REFERENCES outreach_threads(id),
  assigned_at integer NOT NULL
);

CREATE TABLE experiment_outcomes (
  id text PRIMARY KEY NOT NULL,
  assignment_id text NOT NULL REFERENCES experiment_assignments(id),
  outcome_type text NOT NULL,
  value integer,
  occurred_at integer NOT NULL
);
```

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts drizzle/0001_experiments.sql
git commit -m "feat: experiment schema — 4 new tables"
```

---

## Task 2: Experiment repository

**Files:**
- Create: `src/server/db/experiment-repository.ts`
- Create: `src/server/db/experiment-repository.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/server/db/experiment-repository.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  insertExperiment,
  insertExperimentVariant,
  insertExperimentAssignment,
  insertExperimentOutcome,
  getActiveExperiment,
  getExperimentWithVariants,
  countAssignmentsPerVariant,
  getAssignmentByThreadId,
  listExperiments,
  updateExperimentStatus,
  getExperimentResults,
  getPricingIntelligence,
} from './experiment-repository'

// These tests use in-memory stubs — they verify shapes, not DB calls.
// Integration tests against a real D1 binding are out of scope for this plan.

it('insertExperiment returns record with id', () => {
  const exp = insertExperiment({ name: 'Test', status: 'active' })
  expect(exp).toMatchObject({ name: 'Test', status: 'active' })
  expect(typeof exp.id).toBe('string')
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm test:run src/server/db/experiment-repository.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create experiment-repository.ts**

Create `src/server/db/experiment-repository.ts`:

```ts
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import {
  experimentAssignments,
  experimentOutcomes,
  experiments,
  experimentVariants,
  deals,
  domains,
  inboundInquiries,
} from './schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExperimentRecord {
  id: string
  name: string
  status: string
  createdAt: number
}

export interface ExperimentVariantRecord {
  id: string
  experimentId: string
  label: string
  tone: string
  hasPrice: boolean
  subjectSlot: string
  followupDays1: number
  followupDays2: number
}

export interface ExperimentAssignmentRecord {
  id: string
  experimentId: string
  variantId: string
  leadId: string
  threadId: string | null
  assignedAt: number
}

export interface ExperimentOutcomeRecord {
  id: string
  assignmentId: string
  outcomeType: string
  value: number | null
  occurredAt: number
}

export interface VariantResult {
  variantId: string
  label: string
  tone: string
  hasPrice: boolean
  subjectSlot: string
  sent: number
  replies: number
  replyPositive: number
  offerCount: number
  avgOffer: number | null
  dealCount: number
}

export interface PricingRow {
  category: string
  avgFirstOffer: number | null
  avgOfferPct: number | null
  avgClosingPrice: number | null
  dataPoints: number
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export function insertExperiment(input: { name: string; status: string }): ExperimentRecord {
  return { id: `exp-${crypto.randomUUID()}`, ...input, createdAt: Date.now() }
}

export async function saveExperiment(db: D1Database, input: { name: string }): Promise<ExperimentRecord> {
  const drizzle = getDb(db)
  const record: ExperimentRecord = {
    id: `exp-${crypto.randomUUID()}`,
    name: input.name,
    status: 'active',
    createdAt: Date.now(),
  }
  await drizzle.insert(experiments).values(record)
  return record
}

export async function listExperiments(db: D1Database): Promise<ExperimentRecord[]> {
  const drizzle = getDb(db)
  return drizzle.select().from(experiments).orderBy(desc(experiments.createdAt))
}

export async function getActiveExperiment(db: D1Database): Promise<ExperimentRecord | null> {
  const drizzle = getDb(db)
  const rows = await drizzle.select().from(experiments).where(eq(experiments.status, 'active')).limit(1)
  return rows[0] ?? null
}

export async function updateExperimentStatus(
  db: D1Database,
  id: string,
  status: 'active' | 'paused' | 'completed',
): Promise<void> {
  const drizzle = getDb(db)
  await drizzle.update(experiments).set({ status }).where(eq(experiments.id, id))
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export async function saveExperimentVariant(
  db: D1Database,
  input: Omit<ExperimentVariantRecord, 'id'>,
): Promise<ExperimentVariantRecord> {
  const drizzle = getDb(db)
  const record: ExperimentVariantRecord = { id: `var-${crypto.randomUUID()}`, ...input }
  await drizzle.insert(experimentVariants).values({
    ...record,
    hasPrice: record.hasPrice ? 1 : 0,
  } as never)
  return record
}

export async function getExperimentWithVariants(
  db: D1Database,
  experimentId: string,
): Promise<{ experiment: ExperimentRecord; variants: ExperimentVariantRecord[] } | null> {
  const drizzle = getDb(db)
  const expRows = await drizzle.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1)
  if (!expRows[0]) return null
  const variantRows = await drizzle
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, experimentId))
  return { experiment: expRows[0], variants: variantRows }
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function countAssignmentsPerVariant(
  db: D1Database,
  experimentId: string,
): Promise<Record<string, number>> {
  const drizzle = getDb(db)
  const rows = await drizzle
    .select({ variantId: experimentAssignments.variantId, count: sql<number>`count(*)` })
    .from(experimentAssignments)
    .where(eq(experimentAssignments.experimentId, experimentId))
    .groupBy(experimentAssignments.variantId)
  const result: Record<string, number> = {}
  for (const row of rows) {
    result[row.variantId] = row.count
  }
  return result
}

export async function saveExperimentAssignment(
  db: D1Database,
  input: Omit<ExperimentAssignmentRecord, 'id' | 'assignedAt'>,
): Promise<ExperimentAssignmentRecord> {
  const drizzle = getDb(db)
  const record: ExperimentAssignmentRecord = {
    id: `asgn-${crypto.randomUUID()}`,
    assignedAt: Date.now(),
    ...input,
  }
  await drizzle.insert(experimentAssignments).values(record)
  return record
}

export async function updateAssignmentThread(
  db: D1Database,
  assignmentId: string,
  threadId: string,
): Promise<void> {
  const drizzle = getDb(db)
  await drizzle
    .update(experimentAssignments)
    .set({ threadId })
    .where(eq(experimentAssignments.id, assignmentId))
}

export async function getAssignmentByThreadId(
  db: D1Database,
  threadId: string,
): Promise<ExperimentAssignmentRecord | null> {
  const drizzle = getDb(db)
  const rows = await drizzle
    .select()
    .from(experimentAssignments)
    .where(eq(experimentAssignments.threadId, threadId))
    .limit(1)
  return rows[0] ?? null
}

export async function getAssignmentByLeadId(
  db: D1Database,
  leadId: string,
): Promise<ExperimentAssignmentRecord | null> {
  const drizzle = getDb(db)
  const rows = await drizzle
    .select()
    .from(experimentAssignments)
    .where(eq(experimentAssignments.leadId, leadId))
    .orderBy(desc(experimentAssignments.assignedAt))
    .limit(1)
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export async function saveExperimentOutcome(
  db: D1Database,
  input: Omit<ExperimentOutcomeRecord, 'id' | 'occurredAt'>,
): Promise<void> {
  const drizzle = getDb(db)
  await drizzle.insert(experimentOutcomes).values({
    id: `out-${crypto.randomUUID()}`,
    occurredAt: Date.now(),
    ...input,
  })
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export async function getExperimentResults(
  db: D1Database,
  experimentId: string,
): Promise<VariantResult[]> {
  const drizzle = getDb(db)
  const variantRows = await drizzle
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, experimentId))

  const results: VariantResult[] = []

  for (const variant of variantRows) {
    const assignments = await drizzle
      .select({ id: experimentAssignments.id })
      .from(experimentAssignments)
      .where(
        and(
          eq(experimentAssignments.experimentId, experimentId),
          eq(experimentAssignments.variantId, variant.id),
        ),
      )
    const assignmentIds = assignments.map((a) => a.id)
    const sent = assignmentIds.length

    if (sent === 0) {
      results.push({
        variantId: variant.id,
        label: variant.label,
        tone: variant.tone,
        hasPrice: Boolean(variant.hasPrice),
        subjectSlot: variant.subjectSlot,
        sent: 0,
        replies: 0,
        replyPositive: 0,
        offerCount: 0,
        avgOffer: null,
        dealCount: 0,
      })
      continue
    }

    const outcomes = await drizzle
      .select()
      .from(experimentOutcomes)
      .where(sql`${experimentOutcomes.assignmentId} IN (${sql.join(assignmentIds.map((id) => sql`${id}`), sql`, `)})`)

    const replies = outcomes.filter((o) => o.outcomeType === 'reply_received').length
    const replyPositive = outcomes.filter((o) => o.outcomeType === 'reply_positive').length
    const offers = outcomes.filter((o) => o.outcomeType === 'offer_made' && o.value != null)
    const offerCount = offers.length
    const avgOffer = offerCount > 0 ? Math.round(offers.reduce((sum, o) => sum + (o.value ?? 0), 0) / offerCount) : null
    const dealCount = outcomes.filter((o) => o.outcomeType === 'deal_closed').length

    results.push({
      variantId: variant.id,
      label: variant.label,
      tone: variant.tone,
      hasPrice: Boolean(variant.hasPrice),
      subjectSlot: variant.subjectSlot,
      sent,
      replies,
      replyPositive,
      offerCount,
      avgOffer,
      dealCount,
    })
  }

  return results
}

export async function getPricingIntelligence(db: D1Database): Promise<PricingRow[]> {
  const drizzle = getDb(db)

  // Pull all offer outcomes joined to their domain's targetPrice via leads → domains
  const offerRows = await drizzle
    .select({
      category: domains.category,
      offerValue: experimentOutcomes.value,
      targetPrice: sql<number>`d.target_price`,
    })
    .from(experimentOutcomes)
    .innerJoin(experimentAssignments, eq(experimentOutcomes.assignmentId, experimentAssignments.id))
    .innerJoin(domains.as('d'), sql`d.id = (SELECT domain_id FROM leads WHERE id = ${experimentAssignments.leadId})`)
    .where(eq(experimentOutcomes.outcomeType, 'offer_made'))

  // Pull all deal outcomes
  const dealRows = await drizzle
    .select({
      category: domains.category,
      agreedPrice: deals.agreedPrice,
      targetPrice: sql<number>`d.target_price`,
    })
    .from(deals)
    .innerJoin(domains.as('d'), eq(deals.domainId, domains.id))
    .where(sql`${deals.agreedPrice} IS NOT NULL`)

  // Group by category
  const categoryMap: Record<string, { offers: number[]; closings: number[]; targetPrices: number[] }> = {}

  for (const row of offerRows) {
    const cat = row.category ?? 'Unknown'
    if (!categoryMap[cat]) categoryMap[cat] = { offers: [], closings: [], targetPrices: [] }
    if (row.offerValue != null) categoryMap[cat].offers.push(row.offerValue)
    if (row.targetPrice != null) categoryMap[cat].targetPrices.push(row.targetPrice)
  }

  for (const row of dealRows) {
    const cat = row.category ?? 'Unknown'
    if (!categoryMap[cat]) categoryMap[cat] = { offers: [], closings: [], targetPrices: [] }
    if (row.agreedPrice != null) categoryMap[cat].closings.push(row.agreedPrice)
  }

  return Object.entries(categoryMap).map(([category, data]) => {
    const avgFirstOffer = data.offers.length > 0
      ? Math.round(data.offers.reduce((a, b) => a + b, 0) / data.offers.length)
      : null
    const avgTargetPrice = data.targetPrices.length > 0
      ? data.targetPrices.reduce((a, b) => a + b, 0) / data.targetPrices.length
      : null
    const avgOfferPct = avgFirstOffer != null && avgTargetPrice != null && avgTargetPrice > 0
      ? Math.round((avgFirstOffer / avgTargetPrice) * 100)
      : null
    const avgClosingPrice = data.closings.length > 0
      ? Math.round(data.closings.reduce((a, b) => a + b, 0) / data.closings.length)
      : null
    const dataPoints = data.offers.length + data.closings.length

    return { category, avgFirstOffer, avgOfferPct, avgClosingPrice, dataPoints }
  })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test:run src/server/db/experiment-repository.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/db/experiment-repository.ts src/server/db/experiment-repository.test.ts
git commit -m "feat: experiment repository — CRUD + results queries"
```

---

## Task 3: outreach-draft.ts — add hasPrice + configurable followupDays

**Files:**
- Modify: `src/lib/outreach-draft.ts`
- Test: `src/lib/outreach-draft.test.ts` (existing)

- [ ] **Step 1: Add hasPrice and followupDays to the Zod schema**

In `src/lib/outreach-draft.ts`, find `outreachDraftInputSchema` and add two fields:

```ts
export const outreachDraftInputSchema = z.object({
  domain: z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    language: z.enum(['NL', 'EN']),
    targetPrice: z.number().positive(),
    currency: z.string().default('EUR'),
    notes: z.string().optional(),
  }),
  lead: z.object({
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    website: z.string().optional(),
    buyerFitReason: z.string().min(1),
    outreachCount: z.number().int().min(0),
    doNotContact: z.boolean(),
    uninterested: z.boolean(),
  }),
  sender: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  tone: z.enum(['concise', 'standard', 'detailed']).default('standard'),
  hasPrice: z.boolean().default(false),          // NEW
  followupDays1: z.number().int().min(1).default(5), // NEW
  followupDays2: z.number().int().min(1).default(7), // NEW
  autoSendEnabled: z.boolean().default(false),
  dailyLimit: z.number().int().min(0).default(10),
})
```

- [ ] **Step 2: Replace hardcoded followUpDays() with input values**

Find the `followUpDays` function and the `generateOutreachDraft` function. Replace the hardcoded function with input-driven values:

Remove:
```ts
function followUpDays(step: OutreachSequenceStep): number | null {
  if (step === 'initial') return 5
  if (step === 'follow_up_1') return 7
  return null
}
```

In `generateOutreachDraft`, replace the `followUpDays(step)` call:
```ts
const recommendedFollowUpDays =
  step === 'initial' ? input.followupDays1 :
  step === 'follow_up_1' ? input.followupDays2 :
  null
```

- [ ] **Step 3: Thread hasPrice into initial mail builders**

In `buildNL`, in the `initial` step, the `standard` and `detailed` tones currently never show the price. Add a conditional price line controlled by `input.hasPrice`.

In `buildNL` signature, add `hasPrice: boolean` parameter and pass `input.hasPrice` when calling from `generateOutreachDraft`.

For standard NL initial, add at the end of body before CTA:
```ts
const priceLine = hasPrice ? `\nDe vraagprijs is ${price}.\n` : ''

body = `Hallo ${firstName},

Ik neem even contact op omdat ${domain.name} beschikbaar is en ik denk dat het strategisch interessant kan zijn. Het is een domein dat ${angle}.

Omdat jullie ${lead.buyerFitReason}
${priceLine}
Is aankoop van dit domein iets wat jullie zou aanspreken? Als dat zo is, deel ik graag de voorwaarden en prijsindicatie.

Groeten,
${sender.name}
${sender.email}`
```

Apply the same `priceLine` pattern to concise and detailed NL variants, and all EN variants.

- [ ] **Step 4: Run existing tests**

```bash
pnpm test:run src/lib/outreach-draft.test.ts
```

Expected: all pass. Fix any snapshot mismatches caused by the new defaults.

- [ ] **Step 5: Commit**

```bash
git add src/lib/outreach-draft.ts src/lib/outreach-draft.test.ts
git commit -m "feat: outreach-draft hasPrice + configurable followup days"
```

---

## Task 4: Rotation logic

**Files:**
- Create: `src/server/experiment-rotation.ts`
- Create: `src/server/experiment-rotation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/server/experiment-rotation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickVariant } from './experiment-rotation'
import type { ExperimentVariantRecord } from './db/experiment-repository'

const makeVariant = (id: string, label: string): ExperimentVariantRecord => ({
  id,
  experimentId: 'exp-1',
  label,
  tone: 'standard',
  hasPrice: false,
  subjectSlot: 'default',
  followupDays1: 5,
  followupDays2: 7,
})

describe('pickVariant', () => {
  it('picks variant with fewest assignments', () => {
    const variants = [makeVariant('v-a', 'A'), makeVariant('v-b', 'B'), makeVariant('v-c', 'C')]
    const counts = { 'v-a': 5, 'v-b': 3, 'v-c': 5 }
    const picked = pickVariant(variants, counts)
    expect(picked.id).toBe('v-b')
  })

  it('picks first variant when all counts are equal', () => {
    const variants = [makeVariant('v-a', 'A'), makeVariant('v-b', 'B')]
    const counts = { 'v-a': 2, 'v-b': 2 }
    const picked = pickVariant(variants, counts)
    expect(picked.id).toBe('v-a')
  })

  it('treats missing count as zero', () => {
    const variants = [makeVariant('v-a', 'A'), makeVariant('v-b', 'B')]
    const counts = { 'v-a': 1 }
    const picked = pickVariant(variants, counts)
    expect(picked.id).toBe('v-b')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test:run src/server/experiment-rotation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement experiment-rotation.ts**

Create `src/server/experiment-rotation.ts`:

```ts
import type { ExperimentVariantRecord } from './db/experiment-repository'
import {
  getActiveExperiment,
  getExperimentWithVariants,
  countAssignmentsPerVariant,
  saveExperimentAssignment,
} from './db/experiment-repository'

export function pickVariant(
  variants: ExperimentVariantRecord[],
  counts: Record<string, number>,
): ExperimentVariantRecord {
  return variants.reduce((best, variant) => {
    const bestCount = counts[best.id] ?? 0
    const thisCount = counts[variant.id] ?? 0
    return thisCount < bestCount ? variant : best
  })
}

export interface RotationResult {
  assignmentId: string
  variant: ExperimentVariantRecord
}

export async function assignVariantForLead(
  db: D1Database,
  leadId: string,
): Promise<RotationResult | null> {
  const experiment = await getActiveExperiment(db)
  if (!experiment) return null

  const withVariants = await getExperimentWithVariants(db, experiment.id)
  if (!withVariants || withVariants.variants.length === 0) return null

  const counts = await countAssignmentsPerVariant(db, experiment.id)
  const variant = pickVariant(withVariants.variants, counts)

  const assignment = await saveExperimentAssignment(db, {
    experimentId: experiment.id,
    variantId: variant.id,
    leadId,
    threadId: null,
  })

  return { assignmentId: assignment.id, variant }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test:run src/server/experiment-rotation.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/experiment-rotation.ts src/server/experiment-rotation.test.ts
git commit -m "feat: variant rotation — round-robin assignment"
```

---

## Task 5: Outcome logging

**Files:**
- Create: `src/server/experiment-outcomes.ts`
- Create: `src/server/experiment-outcomes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/server/experiment-outcomes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { logOutcomeForThread, logOutcomeForLead } from './experiment-outcomes'

it('logOutcomeForThread is a function', () => {
  expect(typeof logOutcomeForThread).toBe('function')
})

it('logOutcomeForLead is a function', () => {
  expect(typeof logOutcomeForLead).toBe('function')
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test:run src/server/experiment-outcomes.test.ts
```

- [ ] **Step 3: Implement experiment-outcomes.ts**

Create `src/server/experiment-outcomes.ts`:

```ts
import { getAssignmentByThreadId, getAssignmentByLeadId, saveExperimentOutcome } from './db/experiment-repository'

export type OutcomeType = 'reply_received' | 'reply_positive' | 'offer_made' | 'deal_closed'

export async function logOutcomeForThread(
  db: D1Database,
  threadId: string,
  outcomeType: OutcomeType,
  value?: number,
): Promise<void> {
  const assignment = await getAssignmentByThreadId(db, threadId)
  if (!assignment) return
  await saveExperimentOutcome(db, { assignmentId: assignment.id, outcomeType, value: value ?? null })
}

export async function logOutcomeForLead(
  db: D1Database,
  leadId: string,
  outcomeType: OutcomeType,
  value?: number,
): Promise<void> {
  const assignment = await getAssignmentByLeadId(db, leadId)
  if (!assignment) return
  await saveExperimentOutcome(db, { assignmentId: assignment.id, outcomeType, value: value ?? null })
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm test:run src/server/experiment-outcomes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/server/experiment-outcomes.ts src/server/experiment-outcomes.test.ts
git commit -m "feat: experiment outcome logging"
```

---

## Task 6: Worker API endpoints

**Files:**
- Modify: `worker/index.ts`

- [ ] **Step 1: Add imports at top of worker/index.ts**

Find the existing imports block. Add:

```ts
import { saveExperiment, listExperiments, updateExperimentStatus, saveExperimentVariant, getExperimentResults, getPricingIntelligence } from '../src/server/db/experiment-repository'
import { assignVariantForLead } from '../src/server/experiment-rotation'
import { logOutcomeForThread, logOutcomeForLead } from '../src/server/experiment-outcomes'
```

- [ ] **Step 2: Add Zod schemas for experiment endpoints**

After the existing schema definitions near the top of `worker/index.ts`, add:

```ts
const createExperimentSchema = z.object({
  name: z.string().min(1),
})

const createVariantSchema = z.object({
  label: z.string().min(1),
  tone: z.enum(['concise', 'standard', 'detailed']).default('standard'),
  hasPrice: z.boolean().default(false),
  subjectSlot: z.enum(['default', 'question', 'benefit']).default('default'),
  followupDays1: z.number().int().min(1).default(5),
  followupDays2: z.number().int().min(1).default(7),
})

const updateExperimentStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'completed']),
})
```

- [ ] **Step 3: Add experiment API routes**

Find the section where other API routes are defined. Add these five routes:

```ts
app.get('/api/experiments', async (c) => {
  const items = await listExperiments(c.env.DB)
  return c.json({ items })
})

app.post('/api/experiments', zValidator('json', createExperimentSchema), async (c) => {
  const experiment = await saveExperiment(c.env.DB, c.req.valid('json'))
  return c.json(experiment, 201)
})

app.patch(
  '/api/experiments/:id',
  zValidator('json', updateExperimentStatusSchema),
  async (c) => {
    await updateExperimentStatus(c.env.DB, c.req.param('id'), c.req.valid('json').status)
    return c.json({ ok: true })
  },
)

app.post(
  '/api/experiments/:id/variants',
  zValidator('json', createVariantSchema),
  async (c) => {
    const variant = await saveExperimentVariant(c.env.DB, {
      experimentId: c.req.param('id'),
      ...c.req.valid('json'),
    })
    return c.json(variant, 201)
  },
)

app.get('/api/experiments/:id/results', async (c) => {
  const [variants, pricing] = await Promise.all([
    getExperimentResults(c.env.DB, c.req.param('id')),
    getPricingIntelligence(c.env.DB),
  ])
  return c.json({ variants, pricing })
})
```

- [ ] **Step 4: Hook outcome logging into the inquiry endpoint**

Find the handler that saves an inbound inquiry (look for `saveInboundInquiry` call). After a successful save, add:

```ts
// Log reply_received outcome if thread is linked to an experiment
if (saved.inquiry.threadId) {
  await logOutcomeForThread(c.env.DB, saved.inquiry.threadId, 'reply_received').catch(() => {})
}
// Log offer_made if there's an offer amount
if (saved.inquiry.offerAmount != null && saved.inquiry.threadId) {
  await logOutcomeForThread(c.env.DB, saved.inquiry.threadId, 'offer_made', saved.inquiry.offerAmount).catch(() => {})
}
```

Find the handler that classifies an inquiry (look for `classifyInquiry` call). After classification is saved, add:

```ts
if (['serious_offer', 'info_request'].includes(classification) && inquiry.threadId) {
  await logOutcomeForThread(c.env.DB, inquiry.threadId, 'reply_positive').catch(() => {})
}
```

Find the handler that creates a deal (look for `createDeal` or the `POST /api/inquiries/:id/deal` route). After deal creation, add:

```ts
if (deal.leadId) {
  await logOutcomeForLead(c.env.DB, deal.leadId, 'deal_closed', deal.agreedPrice ?? undefined).catch(() => {})
}
```

- [ ] **Step 5: Hook rotation into the outreach draft endpoint**

Find the `POST /api/domains/:domainId/leads/:leadId/outreach` handler (the one that calls `buildBuyerDiscoveryOutreachDraft`). Before building the draft, add:

```ts
const rotation = await assignVariantForLead(c.env.DB, leadId).catch(() => null)
const variantConfig = rotation?.variant ?? null

// Use variant config if available, otherwise fall back to request body
const tone = variantConfig?.tone ?? c.req.valid('json').tone ?? 'standard'
const hasPrice = variantConfig?.hasPrice ?? false
const followupDays1 = variantConfig?.followupDays1 ?? 5
const followupDays2 = variantConfig?.followupDays2 ?? 7
```

Then pass these into `buildBuyerDiscoveryOutreachDraft`:

```ts
const response = buildBuyerDiscoveryOutreachDraft({
  lead,
  domain,
  sender: c.req.valid('json').sender,
  tone,
  hasPrice,
  followupDays1,
  followupDays2,
  outreachCount,
  autoSendEnabled: c.req.valid('json').autoSendEnabled,
  dailyLimit: c.req.valid('json').dailyLimit,
})
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test:run
```

Expected: all pass. Fix any type errors from new parameters.

- [ ] **Step 7: Commit**

```bash
git add worker/index.ts
git commit -m "feat: experiment API endpoints + outcome hooks in worker"
```

---

## Task 7: buyer-outreach.ts — pass variant config through

**Files:**
- Modify: `src/server/buyer-outreach.ts`

- [ ] **Step 1: Extend BuyerOutreachInput with variant fields**

In `src/server/buyer-outreach.ts`, find `BuyerOutreachInput` and add:

```ts
export interface BuyerOutreachInput {
  lead: LeadRecord
  domain: DomainApiRecord
  sender: { name: string; email: string }
  tone?: OutreachTone
  hasPrice?: boolean       // NEW
  followupDays1?: number   // NEW
  followupDays2?: number   // NEW
  outreachCount: number
  autoSendEnabled?: boolean
  dailyLimit?: number
}
```

- [ ] **Step 2: Pass fields into generateOutreachDraft**

In `buildBuyerDiscoveryOutreachDraft`, pass the new fields to `generateOutreachDraft`:

```ts
const result = generateOutreachDraft({
  domain: { ... },
  lead: { ... },
  sender: input.sender,
  tone: input.tone ?? 'standard',
  hasPrice: input.hasPrice ?? false,        // NEW
  followupDays1: input.followupDays1 ?? 5,  // NEW
  followupDays2: input.followupDays2 ?? 7,  // NEW
  autoSendEnabled: input.autoSendEnabled ?? false,
  dailyLimit: input.dailyLimit ?? 10,
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm test:run src/server/buyer-outreach.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/server/buyer-outreach.ts
git commit -m "feat: pass variant config through buyer-outreach"
```

---

## Task 8: Client API + Experiments page

**Files:**
- Modify: `src/lib/api.ts`
- Create: `src/pages/ExperimentsPage.tsx`
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Add experiment API calls to api.ts**

In `src/lib/api.ts`, add at the bottom:

```ts
export interface ExperimentRecord {
  id: string
  name: string
  status: string
  createdAt: number
}

export interface VariantResult {
  variantId: string
  label: string
  tone: string
  hasPrice: boolean
  subjectSlot: string
  sent: number
  replies: number
  replyPositive: number
  offerCount: number
  avgOffer: number | null
  dealCount: number
}

export interface PricingRow {
  category: string
  avgFirstOffer: number | null
  avgOfferPct: number | null
  avgClosingPrice: number | null
  dataPoints: number
}

export async function fetchExperiments(): Promise<ExperimentRecord[]> {
  const res = await fetch('/api/experiments')
  const data = await res.json<{ items: ExperimentRecord[] }>()
  return data.items
}

export async function createExperiment(name: string): Promise<ExperimentRecord> {
  const res = await fetch('/api/experiments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function updateExperimentStatus(
  id: string,
  status: 'active' | 'paused' | 'completed',
): Promise<void> {
  await fetch(`/api/experiments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

export async function createExperimentVariant(
  experimentId: string,
  variant: {
    label: string
    tone: 'concise' | 'standard' | 'detailed'
    hasPrice: boolean
    subjectSlot: 'default' | 'question' | 'benefit'
    followupDays1: number
    followupDays2: number
  },
): Promise<void> {
  await fetch(`/api/experiments/${experimentId}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variant),
  })
}

export async function fetchExperimentResults(
  id: string,
): Promise<{ variants: VariantResult[]; pricing: PricingRow[] }> {
  const res = await fetch(`/api/experiments/${id}/results`)
  return res.json()
}
```

- [ ] **Step 2: Create ExperimentsPage.tsx**

Create `src/pages/ExperimentsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { SectionCard } from '@/components/SectionCard'
import { useToast } from '@/components/Toast'
import {
  fetchExperiments,
  fetchExperimentResults,
  createExperiment,
  createExperimentVariant,
  updateExperimentStatus,
  type ExperimentRecord,
  type VariantResult,
  type PricingRow,
} from '@/lib/api'

function formatEur(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export function ExperimentsPage() {
  const { showToast } = useToast()
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [variants, setVariants] = useState<VariantResult[]>([])
  const [pricing, setPricing] = useState<PricingRow[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchExperiments()
      .then((items) => {
        setExperiments(items)
        if (items.length > 0) setSelectedId(items[0].id)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    fetchExperimentResults(selectedId).then(({ variants: v, pricing: p }) => {
      setVariants(v)
      setPricing(p)
    })
  }, [selectedId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const exp = await createExperiment(newName.trim())
    setExperiments((prev) => [exp, ...prev])
    setSelectedId(exp.id)
    setNewName('')
    showToast('Experiment aangemaakt', 'success')
  }

  async function handleStatus(id: string, status: 'active' | 'paused' | 'completed') {
    await updateExperimentStatus(id, status)
    setExperiments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)))
    showToast('Status bijgewerkt', 'success')
  }

  const selected = experiments.find((e) => e.id === selectedId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-white">Experiments</h1>
      </div>

      {/* New experiment */}
      <SectionCard title="Nieuw experiment">
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Naam (bijv. 'Eerste mail Q2 2026')"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          >
            Aanmaken
          </button>
        </form>
      </SectionCard>

      {/* Experiment selector */}
      {experiments.length > 0 && (
        <SectionCard title="Experiment kiezen">
          <div className="flex flex-wrap gap-2">
            {experiments.map((exp) => (
              <button
                key={exp.id}
                onClick={() => setSelectedId(exp.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedId === exp.id
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                {exp.name}
                <span className={`ml-2 text-xs ${exp.status === 'active' ? 'text-green-400' : 'text-white/30'}`}>
                  {exp.status}
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="mt-3 flex gap-2">
              {selected.status !== 'active' && (
                <button
                  onClick={() => handleStatus(selected.id, 'active')}
                  className="px-3 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white"
                >
                  Activeren
                </button>
              )}
              {selected.status === 'active' && (
                <button
                  onClick={() => handleStatus(selected.id, 'paused')}
                  className="px-3 py-1 rounded text-xs bg-yellow-700 hover:bg-yellow-600 text-white"
                >
                  Pauzeren
                </button>
              )}
              {selected.status !== 'completed' && (
                <button
                  onClick={() => handleStatus(selected.id, 'completed')}
                  className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-white/60"
                >
                  Afsluiten
                </button>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Variant results */}
      {selectedId && variants.length > 0 && (
        <SectionCard title="Resultaten per variant">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="pb-2 pr-4">Variant</th>
                  <th className="pb-2 pr-4">Toon</th>
                  <th className="pb-2 pr-4">Prijs</th>
                  <th className="pb-2 pr-4">Verzonden</th>
                  <th className="pb-2 pr-4">Replies</th>
                  <th className="pb-2 pr-4">Reply rate</th>
                  <th className="pb-2 pr-4">Biedingen</th>
                  <th className="pb-2 pr-4">Gem. bod</th>
                  <th className="pb-2">Deals</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variantId} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-semibold text-white">{v.label}</td>
                    <td className="py-2 pr-4">{v.tone}</td>
                    <td className="py-2 pr-4">{v.hasPrice ? 'Ja' : 'Nee'}</td>
                    <td className="py-2 pr-4">{v.sent}</td>
                    <td className="py-2 pr-4">{v.replies}</td>
                    <td className="py-2 pr-4">
                      {v.sent > 0 ? `${Math.round((v.replies / v.sent) * 100)}%` : '—'}
                    </td>
                    <td className="py-2 pr-4">{v.offerCount}</td>
                    <td className="py-2 pr-4">{formatEur(v.avgOffer)}</td>
                    <td className="py-2">{v.dealCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Pricing intelligence */}
      {pricing.length > 0 && (
        <SectionCard title="Pricing intelligence">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="pb-2 pr-4">Categorie</th>
                  <th className="pb-2 pr-4">Gem. eerste bod</th>
                  <th className="pb-2 pr-4">% van vraagprijs</th>
                  <th className="pb-2 pr-4">Gem. slotprijs</th>
                  <th className="pb-2">Datapunten</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((row) => (
                  <tr key={row.category} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-medium text-white">{row.category}</td>
                    <td className="py-2 pr-4">{formatEur(row.avgFirstOffer)}</td>
                    <td className="py-2 pr-4">{row.avgOfferPct != null ? `${row.avgOfferPct}%` : '—'}</td>
                    <td className="py-2 pr-4">{formatEur(row.avgClosingPrice)}</td>
                    <td className="py-2 text-white/40">{row.dataPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {!loading && experiments.length === 0 && (
        <p className="text-white/40 text-sm">Nog geen experimenten. Maak er een aan om te beginnen.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add Experiments to AppShell nav and router**

In `src/components/AppShell.tsx`, find the nav items array. Add:

```tsx
{ to: '/admin/experiments', label: 'Experiments', icon: FlaskConical }
```

Also add the import at the top: `import { FlaskConical } from 'lucide-react'`

In the router file (likely `src/main.tsx` or `src/App.tsx`), add:

```tsx
import { ExperimentsPage } from './pages/ExperimentsPage'
// inside the router:
{ path: '/admin/experiments', element: <ExperimentsPage /> }
```

- [ ] **Step 4: Run full test suite and type check**

```bash
pnpm test:run
pnpm typecheck 2>/dev/null || pnpm tsc --noEmit
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/pages/ExperimentsPage.tsx src/components/AppShell.tsx
git commit -m "feat: experiments admin page + nav link"
```

---

## Task 9: Run migration locally and smoke test

- [ ] **Step 1: Apply migration to local D1**

```bash
pnpm wrangler d1 execute domain-seller-engine --local --file=drizzle/0001_experiments.sql
```

Expected: no errors.

- [ ] **Step 2: Start dev server**

```bash
pnpm dev:up
```

- [ ] **Step 3: Smoke test via curl**

```bash
# Create an experiment
curl -s -X POST http://localhost:8787/api/experiments \
  -H "Content-Type: application/json" \
  -d '{"name":"Test experiment"}' | jq .

# Add variant A
curl -s -X POST http://localhost:8787/api/experiments/<ID>/variants \
  -H "Content-Type: application/json" \
  -d '{"label":"A","tone":"standard","hasPrice":false,"subjectSlot":"default","followupDays1":5,"followupDays2":7}' | jq .

# Add variant B
curl -s -X POST http://localhost:8787/api/experiments/<ID>/variants \
  -H "Content-Type: application/json" \
  -d '{"label":"B","tone":"concise","hasPrice":true,"subjectSlot":"default","followupDays1":3,"followupDays2":5}' | jq .

# Check results
curl -s http://localhost:8787/api/experiments/<ID>/results | jq .
```

- [ ] **Step 4: Open /admin/experiments in browser and verify page renders**

Navigate to `http://localhost:5173/admin/experiments`. Verify:
- Experiment appears in selector
- Variants show in results table (0 sent, 0 replies)
- Pricing intelligence section is empty (no data yet — that's correct)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: A/B testing + pricing intelligence — complete"
```
