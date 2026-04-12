# Inbox & Reply Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing inbox with per-inquiry status tracking, AI-powered classification (serious offer / info request / lowball / spam), thread view, and draft-only reply generation — all auditable, never auto-sent.

**Architecture:** Add three columns to `inbound_inquiries` via idempotent ALTER TABLE migration, extend the inquiry repository with thread-fetch / status / classification / draft helpers, implement a pure `inquiry-intelligence.ts` AI module, add four worker routes, wire a new `InquiryThreadPage`, and update the existing `InboxPage` with badges + links.

**Tech Stack:** Cloudflare D1 + Drizzle ORM, Hono, Anthropic API (via existing `createAnthropicClientFromEnv`), React + React Router, Zod, Vitest.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/server/db/schema.ts` | Add `status`, `classification`, `classificationReason` columns to `inboundInquiries` table |
| Modify | `src/server/db/ensure-outreach-schema.ts` | Add `ensureInquiryIntelligenceColumns()` migration helper |
| Modify | `src/server/db/inquiry-repository.ts` | Add `getInquiryWithThread`, `updateInquiryStatus`, `updateInquiryClassification`, `saveReplyDraft` |
| Create | `src/server/ai/inquiry-intelligence.ts` | Pure AI functions: `classifyInquiry`, `draftReply` |
| Create | `src/server/ai/inquiry-intelligence.test.ts` | Unit tests for AI module (mocked client) |
| Modify | `worker/index.ts` | Add 4 routes: GET thread, PATCH status, POST classify, POST draft-reply |
| Modify | `src/lib/api.ts` | Add `fetchInquiryThread`, `markInquiryRead`, `classifyInquiryApi`, `draftInquiryReplyApi` + updated types |
| Create | `src/pages/InquiryThreadPage.tsx` | Thread view: messages, classify button, draft reply button |
| Modify | `src/router.tsx` | Add `/admin/inbox/:inquiryId` route |
| Modify | `src/pages/InboxPage.tsx` | Add status/classification badges, link to thread view |

---

## Task 1: Extend Drizzle schema for inquiry intelligence columns

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Update `inboundInquiries` table definition**

In `src/server/db/schema.ts`, replace the `inboundInquiries` table definition (currently lines ~134–144) with:

```typescript
export const inboundInquiries = sqliteTable('inbound_inquiries', {
  id: text('id').primaryKey(),
  domainId: text('domain_id').references(() => domains.id),
  threadId: text('thread_id').references(() => outreachThreads.id),
  inquiryType: text('inquiry_type').notNull(),
  senderName: text('sender_name'),
  senderEmail: text('sender_email').notNull(),
  message: text('message').notNull(),
  offerAmount: integer('offer_amount'),
  status: text('status').notNull().default('new'),
  classification: text('classification'),
  classificationReason: text('classification_reason'),
  createdAt: integer('created_at').notNull(),
})
```

- [ ] **Step 2: Run typecheck to confirm schema change compiles**

```bash
pnpm typecheck
```

Expected: no errors (the new columns have defaults so no existing insert calls break).

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat: add status, classification, classificationReason columns to inboundInquiries schema"
```

---

## Task 2: Add idempotent D1 migration for new columns

**Files:**
- Modify: `src/server/db/ensure-outreach-schema.ts`

- [ ] **Step 1: Add `ensureInquiryIntelligenceColumns` to the file**

Append the following export at the end of `src/server/db/ensure-outreach-schema.ts`:

```typescript
export async function ensureInquiryIntelligenceColumns(binding: D1Database) {
  const tableInfo = await binding.prepare('PRAGMA table_info(inbound_inquiries)').all()
  const existingColumns = new Set(
    (tableInfo.results as Array<{ name: string }>).map((r) => r.name),
  )

  if (!existingColumns.has('status')) {
    await binding
      .prepare(`ALTER TABLE inbound_inquiries ADD COLUMN status TEXT NOT NULL DEFAULT 'new'`)
      .run()
  }
  if (!existingColumns.has('classification')) {
    await binding
      .prepare(`ALTER TABLE inbound_inquiries ADD COLUMN classification TEXT`)
      .run()
  }
  if (!existingColumns.has('classification_reason')) {
    await binding
      .prepare(`ALTER TABLE inbound_inquiries ADD COLUMN classification_reason TEXT`)
      .run()
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/ensure-outreach-schema.ts
git commit -m "feat: add ensureInquiryIntelligenceColumns migration helper"
```

---

## Task 3: Extend inquiry repository

**Files:**
- Modify: `src/server/db/inquiry-repository.ts`

- [ ] **Step 1: Add imports at the top of inquiry-repository.ts**

Add these imports (merge with existing import from `drizzle-orm` and schema imports):

```typescript
import { asc, and, count, desc, eq } from 'drizzle-orm'
// add messages to the schema import:
import { contacts, domains, followupTasks, inboundInquiries, leads, messages, outreachThreads } from './schema'
// add new migration import:
import { ensureInquiryIntelligenceColumns } from './ensure-outreach-schema'
```

Note: `messages` may already be imported — if so, just add `asc` to the drizzle-orm import and `ensureInquiryIntelligenceColumns` to the ensure import.

- [ ] **Step 2: Add `InquiryWithThread` interface after existing interfaces**

```typescript
export interface InquiryWithThread {
  inquiry: {
    id: string
    domainId: string | null
    threadId: string | null
    inquiryType: string
    senderName: string | null
    senderEmail: string
    message: string
    offerAmount: number | null
    status: string
    classification: string | null
    classificationReason: string | null
    createdAt: number
    domainName: string | null
  }
  messages: Array<{
    id: string
    direction: string
    channel: string
    subject: string | null
    body: string
    classification: string | null
    sentAt: number | null
    createdAt: number
  }>
}
```

- [ ] **Step 3: Add `getInquiryWithThread` function**

Append to `src/server/db/inquiry-repository.ts`:

```typescript
export async function getInquiryWithThread(
  binding: D1Database,
  id: string,
): Promise<InquiryWithThread | null> {
  await ensureOutreachSchema(binding)
  await ensureInquiryIntelligenceColumns(binding)
  const db = getDb(binding)

  const [row] = await db
    .select({
      id: inboundInquiries.id,
      domainId: inboundInquiries.domainId,
      threadId: inboundInquiries.threadId,
      inquiryType: inboundInquiries.inquiryType,
      senderName: inboundInquiries.senderName,
      senderEmail: inboundInquiries.senderEmail,
      message: inboundInquiries.message,
      offerAmount: inboundInquiries.offerAmount,
      status: inboundInquiries.status,
      classification: inboundInquiries.classification,
      classificationReason: inboundInquiries.classificationReason,
      createdAt: inboundInquiries.createdAt,
      domainName: domains.domainName,
    })
    .from(inboundInquiries)
    .leftJoin(domains, eq(inboundInquiries.domainId, domains.id))
    .where(eq(inboundInquiries.id, id))
    .limit(1)

  if (!row) return null

  const threadMessages = row.threadId
    ? await db
        .select({
          id: messages.id,
          direction: messages.direction,
          channel: messages.channel,
          subject: messages.subject,
          body: messages.body,
          classification: messages.classification,
          sentAt: messages.sentAt,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.threadId, row.threadId))
        .orderBy(asc(messages.createdAt))
    : []

  return { inquiry: row, messages: threadMessages }
}
```

- [ ] **Step 4: Add `updateInquiryStatus` function**

```typescript
export async function updateInquiryStatus(
  binding: D1Database,
  id: string,
  status: 'new' | 'read' | 'replied',
): Promise<void> {
  await ensureOutreachSchema(binding)
  await ensureInquiryIntelligenceColumns(binding)
  const db = getDb(binding)
  await db
    .update(inboundInquiries)
    .set({ status })
    .where(eq(inboundInquiries.id, id))
}
```

- [ ] **Step 5: Add `updateInquiryClassification` function**

```typescript
export async function updateInquiryClassification(
  binding: D1Database,
  id: string,
  classification: string,
  classificationReason: string,
): Promise<void> {
  await ensureOutreachSchema(binding)
  await ensureInquiryIntelligenceColumns(binding)
  const db = getDb(binding)
  await db
    .update(inboundInquiries)
    .set({ classification, classificationReason })
    .where(eq(inboundInquiries.id, id))
}
```

- [ ] **Step 6: Add `saveReplyDraft` function**

```typescript
export async function saveReplyDraft(
  binding: D1Database,
  input: { threadId: string; subject: string; body: string },
): Promise<{ id: string; subject: string; body: string }> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const id = `msg-draft-${crypto.randomUUID()}`
  const now = Date.now()

  await db.insert(messages).values({
    id,
    threadId: input.threadId,
    direction: 'outbound',
    channel: 'email',
    subject: input.subject,
    body: input.body,
    classification: 'draft_reply',
    sentAt: null,
    createdAt: now,
  })

  return { id, subject: input.subject, body: input.body }
}
```

- [ ] **Step 7: Update `listInboundInquiries` to include new columns**

Replace the existing `listInboundInquiries` return select to include `status`, `classification`, `classificationReason`. Add `ensureInquiryIntelligenceColumns(binding)` call at the start:

```typescript
export async function listInboundInquiries(binding: D1Database) {
  await ensureOutreachSchema(binding)
  await ensureInquiryIntelligenceColumns(binding)
  const db = getDb(binding)

  return db
    .select({
      id: inboundInquiries.id,
      inquiryType: inboundInquiries.inquiryType,
      senderName: inboundInquiries.senderName,
      senderEmail: inboundInquiries.senderEmail,
      message: inboundInquiries.message,
      offerAmount: inboundInquiries.offerAmount,
      status: inboundInquiries.status,
      classification: inboundInquiries.classification,
      classificationReason: inboundInquiries.classificationReason,
      createdAt: inboundInquiries.createdAt,
      domainName: domains.domainName,
    })
    .from(inboundInquiries)
    .leftJoin(domains, eq(inboundInquiries.domainId, domains.id))
    .orderBy(desc(inboundInquiries.createdAt))
}
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 9: Commit**

```bash
git add src/server/db/inquiry-repository.ts src/server/db/ensure-outreach-schema.ts
git commit -m "feat: extend inquiry repository with thread, status, classification, draft helpers"
```

---

## Task 4: Write failing tests for inquiry-intelligence AI module

**Files:**
- Create: `src/server/ai/inquiry-intelligence.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/server/ai/inquiry-intelligence.test.ts` with this content:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { classifyInquiry, draftReply } from './inquiry-intelligence'

const domain = {
  domainName: 'geboorteservies.nl',
  targetPrice: 4800,
  quickSalePrice: 2500,
  language: 'NL',
  tld: '.nl',
}

const baseInquiry = {
  senderName: 'Jan de Vries',
  senderEmail: 'jan@example.nl',
  message: 'Hallo, ik heb interesse in dit domein. Wat is de vraagprijs?',
  offerAmount: null as number | null,
  inquiryType: 'contact',
}

describe('classifyInquiry', () => {
  it('classifies a genuine offer as serious_offer', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          classification: 'serious_offer',
          reason: 'Offer near target price from an identifiable business.',
        },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({
      inquiry: { ...baseInquiry, offerAmount: 4500 },
      domain,
      client,
    })

    expect(result.classification).toBe('serious_offer')
    expect(result.reason).toBeTruthy()
    expect(client.generateObject).toHaveBeenCalledOnce()
  })

  it('classifies a very low offer as lowball', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: { classification: 'lowball', reason: 'Offer far below quick sale price.' },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({
      inquiry: { ...baseInquiry, offerAmount: 50 },
      domain,
      client,
    })

    expect(result.classification).toBe('lowball')
  })

  it('classifies a contact without offer as info_request', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: { classification: 'info_request', reason: 'No offer made, asking for price information.' },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({ inquiry: baseInquiry, domain, client })

    expect(result.classification).toBe('info_request')
    expect(result.reason).toBeTruthy()
  })

  it('classifies unrelated messages as spam', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: { classification: 'spam', reason: 'Unrelated to domain purchase.' },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({
      inquiry: { ...baseInquiry, message: 'Buy cheap SEO backlinks now!' },
      domain,
      client,
    })

    expect(result.classification).toBe('spam')
  })

  it('throws when no client is provided', async () => {
    await expect(
      classifyInquiry({ inquiry: baseInquiry, domain }),
    ).rejects.toThrow('AI client is required')
  })
})

describe('draftReply', () => {
  it('returns subject and body for an info request', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          subject: 'Re: Interesse in geboorteservies.nl',
          body: 'Hallo Jan,\n\nBedankt voor uw interesse in geboorteservies.nl.\n\nMet vriendelijke groet',
        },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await draftReply({
      inquiry: baseInquiry,
      domain,
      classification: 'info_request',
      client,
    })

    expect(result.subject).toBeTruthy()
    expect(result.body).toBeTruthy()
    expect(client.generateObject).toHaveBeenCalledOnce()
  })

  it('returns a reply for a serious offer', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          subject: 'Re: Bod op geboorteservies.nl',
          body: 'Hallo Jan,\n\nDank u voor uw bod. Uw aanbod van EUR 4500 ligt dicht bij onze vraagprijs.\n\nMet vriendelijke groet',
        },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await draftReply({
      inquiry: { ...baseInquiry, offerAmount: 4500 },
      domain,
      classification: 'serious_offer',
      client,
    })

    expect(result.subject).toContain('geboorteservies')
    expect(result.body).toBeTruthy()
  })

  it('throws when no client is provided', async () => {
    await expect(
      draftReply({ inquiry: baseInquiry, domain, classification: 'info_request' }),
    ).rejects.toThrow('AI client is required')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test:run src/server/ai/inquiry-intelligence.test.ts
```

Expected: FAIL — `Cannot find module './inquiry-intelligence'`.

---

## Task 5: Implement inquiry-intelligence.ts

**Files:**
- Create: `src/server/ai/inquiry-intelligence.ts`

- [ ] **Step 1: Create the file**

Create `src/server/ai/inquiry-intelligence.ts`:

```typescript
import { z } from 'zod'
import type { StructuredAiClient } from './anthropic'

export type InquiryClassification = 'serious_offer' | 'info_request' | 'lowball' | 'spam'

const classificationOutputSchema = z.object({
  classification: z.enum(['serious_offer', 'info_request', 'lowball', 'spam']),
  reason: z.string().min(10).max(500),
})

const draftReplyOutputSchema = z.object({
  subject: z.string().min(5).max(200),
  body: z.string().min(20).max(2_000),
})

export interface ClassifyInquiryInput {
  inquiry: {
    senderName: string | null
    senderEmail: string
    message: string
    offerAmount: number | null
    inquiryType: string
  }
  domain: {
    domainName: string
    targetPrice: number | null
    quickSalePrice: number | null
  }
  client?: StructuredAiClient
}

export interface ClassifyInquiryResult {
  classification: InquiryClassification
  reason: string
}

export interface DraftReplyInput {
  inquiry: {
    senderName: string | null
    message: string
    offerAmount: number | null
  }
  domain: {
    domainName: string
    targetPrice: number | null
    quickSalePrice: number | null
    language: string | null
    tld: string
  }
  classification: InquiryClassification
  client?: StructuredAiClient
}

export interface DraftReplyResult {
  subject: string
  body: string
}

function buildClassificationPrompt(input: ClassifyInquiryInput): string {
  const parts = [
    `You are reviewing an inbound inquiry for the domain ${input.domain.domainName}.`,
    `Sender: ${input.inquiry.senderName ?? 'Unknown'} <${input.inquiry.senderEmail}>`,
    `Message: ${input.inquiry.message}`,
  ]

  if (input.inquiry.offerAmount != null) {
    parts.push(`Offer amount: EUR ${input.inquiry.offerAmount}`)
    if (input.domain.quickSalePrice != null) {
      parts.push(`Minimum acceptable (quick sale): EUR ${input.domain.quickSalePrice}`)
    }
    if (input.domain.targetPrice != null) {
      parts.push(`Target price: EUR ${input.domain.targetPrice}`)
    }
  }

  parts.push(
    'Classify the inquiry intent:',
    '  serious_offer — genuine buyer at or near target price, or a credible business showing strong intent',
    '  info_request — asking about the domain but no clear financial commitment',
    '  lowball — offer significantly below the quick sale price',
    '  spam — unrelated, automated, or clearly not a domain purchase inquiry',
    'Return JSON with classification and a brief reason (1–2 sentences).',
  )

  return parts.join('\n')
}

function buildDraftReplyPrompt(input: DraftReplyInput): string {
  const language =
    input.domain.tld === '.nl' || input.domain.language === 'NL' ? 'Dutch' : 'English'

  const parts = [
    `You are drafting a professional reply to an inbound inquiry for the domain ${input.domain.domainName}.`,
    `Write in ${language}.`,
    `Sender: ${input.inquiry.senderName ?? 'the inquirer'}`,
    `Their message: ${input.inquiry.message}`,
  ]

  if (input.inquiry.offerAmount != null) {
    parts.push(`Their offer: EUR ${input.inquiry.offerAmount}`)
  }
  if (input.domain.targetPrice != null) {
    parts.push(`Your asking price: EUR ${input.domain.targetPrice}`)
  }

  parts.push(
    `Classification of this inquiry: ${input.classification}`,
    'Be professional and personalized. Do not auto-accept or auto-reject any offer.',
    'Invite a conversation. Keep it brief (under 120 words).',
    'Body should be plain text with no markdown formatting.',
    'Return JSON with subject and body.',
  )

  return parts.join('\n')
}

export async function classifyInquiry(
  input: ClassifyInquiryInput,
): Promise<ClassifyInquiryResult> {
  if (!input.client) {
    throw new Error('AI client is required for classification.')
  }

  const response = await input.client.generateObject({
    schema: classificationOutputSchema,
    system: 'You classify domain purchase inquiry emails. Output only structured JSON.',
    prompt: buildClassificationPrompt(input),
    maxTokens: 300,
    temperature: 0,
  })

  return {
    classification: response.data.classification,
    reason: response.data.reason,
  }
}

export async function draftReply(input: DraftReplyInput): Promise<DraftReplyResult> {
  if (!input.client) {
    throw new Error('AI client is required for draft generation.')
  }

  const response = await input.client.generateObject({
    schema: draftReplyOutputSchema,
    system: 'You draft professional domain sales email replies. Output only structured JSON.',
    prompt: buildDraftReplyPrompt(input),
    maxTokens: 600,
    temperature: 0.3,
  })

  return {
    subject: response.data.subject,
    body: response.data.body,
  }
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
pnpm test:run src/server/ai/inquiry-intelligence.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/server/ai/inquiry-intelligence.ts src/server/ai/inquiry-intelligence.test.ts
git commit -m "feat: add inquiry-intelligence AI module with classifyInquiry and draftReply"
```

---

## Task 6: Add worker routes

**Files:**
- Modify: `worker/index.ts`

- [ ] **Step 1: Add imports at the top of worker/index.ts**

Add these imports (merge into existing import block):

```typescript
import {
  getInquiryWithThread,
  updateInquiryStatus,
  updateInquiryClassification,
  saveReplyDraft,
} from '../src/server/db/inquiry-repository'
import { classifyInquiry, draftReply, type InquiryClassification } from '../src/server/ai/inquiry-intelligence'
import { createAnthropicClientFromEnv } from '../src/server/ai/anthropic'
```

Note: `createAnthropicClientFromEnv` may already be imported — check before adding.

- [ ] **Step 2: Add the four new routes after the existing `app.get('/api/inquiries', ...)` route**

```typescript
// --- Inquiry intelligence ---

const updateInquiryStatusSchema = z.object({
  status: z.enum(['new', 'read', 'replied']),
})

app.get('/api/inquiries/:id/thread', async (c) => {
  const result = await getInquiryWithThread(c.env.DB, c.req.param('id'))
  if (!result) return c.json({ error: 'Inquiry not found.' }, 404)
  return c.json(result)
})

app.patch(
  '/api/inquiries/:id/status',
  zValidator('json', updateInquiryStatusSchema),
  async (c) => {
    await updateInquiryStatus(c.env.DB, c.req.param('id'), c.req.valid('json').status)
    return c.json({ ok: true })
  },
)

app.post('/api/inquiries/:id/classify', async (c) => {
  const inquiryWithThread = await getInquiryWithThread(c.env.DB, c.req.param('id'))
  if (!inquiryWithThread) return c.json({ error: 'Inquiry not found.' }, 404)

  const domain = await getDomain(c.env.DB, inquiryWithThread.inquiry.domainId ?? '')
  if (!domain) return c.json({ error: 'Domain not found.' }, 404)

  const client = createAnthropicClientFromEnv(c.env)
  const result = await classifyInquiry({
    inquiry: {
      senderName: inquiryWithThread.inquiry.senderName,
      senderEmail: inquiryWithThread.inquiry.senderEmail,
      message: inquiryWithThread.inquiry.message,
      offerAmount: inquiryWithThread.inquiry.offerAmount,
      inquiryType: inquiryWithThread.inquiry.inquiryType,
    },
    domain: {
      domainName: domain.domainName,
      targetPrice: domain.targetPrice,
      quickSalePrice: domain.quickSalePrice,
    },
    client,
  })

  await updateInquiryClassification(
    c.env.DB,
    c.req.param('id'),
    result.classification,
    result.reason,
  )

  return c.json({ ok: true, classification: result.classification, reason: result.reason })
})

app.post('/api/inquiries/:id/draft-reply', async (c) => {
  const inquiryWithThread = await getInquiryWithThread(c.env.DB, c.req.param('id'))
  if (!inquiryWithThread) return c.json({ error: 'Inquiry not found.' }, 404)
  if (!inquiryWithThread.inquiry.threadId) {
    return c.json({ error: 'Inquiry has no associated thread.' }, 400)
  }

  const domain = await getDomain(c.env.DB, inquiryWithThread.inquiry.domainId ?? '')
  if (!domain) return c.json({ error: 'Domain not found.' }, 404)

  const client = createAnthropicClientFromEnv(c.env)
  const classification =
    (inquiryWithThread.inquiry.classification as InquiryClassification | null) ?? 'info_request'

  const result = await draftReply({
    inquiry: {
      senderName: inquiryWithThread.inquiry.senderName,
      message: inquiryWithThread.inquiry.message,
      offerAmount: inquiryWithThread.inquiry.offerAmount,
    },
    domain: {
      domainName: domain.domainName,
      targetPrice: domain.targetPrice,
      quickSalePrice: domain.quickSalePrice,
      language: domain.language,
      tld: domain.tld,
    },
    classification,
    client,
  })

  const draft = await saveReplyDraft(c.env.DB, {
    threadId: inquiryWithThread.inquiry.threadId,
    subject: result.subject,
    body: result.body,
  })

  return c.json({ ok: true, draft })
})
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes. If `getDomain` is not in scope, it's already imported — confirm at top of `worker/index.ts`.

- [ ] **Step 4: Run tests**

```bash
pnpm test:run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts
git commit -m "feat: add inquiry thread, classify, draft-reply, and status worker routes"
```

---

## Task 7: Add API client functions

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Update `InboundInquiryRecord` type to include new fields**

Find the existing `InboundInquiryRecord` interface in `src/lib/api.ts` and add the three new fields:

```typescript
export interface InboundInquiryRecord {
  id: string
  inquiryType: string
  senderName: string | null
  senderEmail: string
  message: string
  offerAmount: number | null
  status: string
  classification: string | null
  classificationReason: string | null
  createdAt: number
  domainName: string | null
}
```

- [ ] **Step 2: Add new types and functions**

Append to `src/lib/api.ts`:

```typescript
export interface InquiryThreadMessage {
  id: string
  direction: string
  channel: string
  subject: string | null
  body: string
  classification: string | null
  sentAt: number | null
  createdAt: number
}

export interface InquiryWithThreadRecord {
  inquiry: {
    id: string
    domainId: string | null
    threadId: string | null
    inquiryType: string
    senderName: string | null
    senderEmail: string
    message: string
    offerAmount: number | null
    status: string
    classification: string | null
    classificationReason: string | null
    createdAt: number
    domainName: string | null
  }
  messages: InquiryThreadMessage[]
}

export async function fetchInquiryThread(inquiryId: string): Promise<InquiryWithThreadRecord> {
  return fetchJson<InquiryWithThreadRecord>(`/api/inquiries/${inquiryId}/thread`)
}

export async function markInquiryRead(inquiryId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/api/inquiries/${inquiryId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'read' }),
  })
}

export async function classifyInquiryApi(
  inquiryId: string,
): Promise<{ classification: string; reason: string }> {
  return fetchJson<{ classification: string; reason: string }>(
    `/api/inquiries/${inquiryId}/classify`,
    { method: 'POST' },
  )
}

export async function draftInquiryReplyApi(
  inquiryId: string,
): Promise<{ ok: boolean; draft: { id: string; subject: string; body: string } }> {
  return fetchJson<{ ok: boolean; draft: { id: string; subject: string; body: string } }>(
    `/api/inquiries/${inquiryId}/draft-reply`,
    { method: 'POST' },
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add inquiry thread, classify, draft-reply, mark-read API client functions"
```

---

## Task 8: Create InquiryThreadPage

**Files:**
- Create: `src/pages/InquiryThreadPage.tsx`

- [ ] **Step 1: Create the file**

Create `src/pages/InquiryThreadPage.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import {
  classifyInquiryApi,
  draftInquiryReplyApi,
  fetchInquiryThread,
  markInquiryRead,
  type InquiryWithThreadRecord,
} from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'

const CLASSIFICATION_LABELS: Record<string, string> = {
  serious_offer: 'Serious offer',
  info_request: 'Info request',
  lowball: 'Lowball',
  spam: 'Spam',
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  serious_offer: 'bg-emerald-100 text-emerald-800',
  info_request: 'bg-blue-100 text-blue-800',
  lowball: 'bg-yellow-100 text-yellow-800',
  spam: 'bg-red-100 text-red-800',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-900 text-white',
  read: 'bg-slate-100 text-slate-700',
  replied: 'bg-emerald-100 text-emerald-800',
}

export function InquiryThreadPage() {
  const { inquiryId } = useParams<{ inquiryId: string }>()
  const [data, setData] = useState<InquiryWithThreadRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftResult, setDraftResult] = useState<{ subject: string; body: string } | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!inquiryId) return

    fetchInquiryThread(inquiryId)
      .then((result) => {
        setData(result)
        if (result.inquiry.status === 'new') {
          void markInquiryRead(inquiryId).catch(() => {
            // non-critical — ignore
          })
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [inquiryId])

  if (error) {
    return <SectionCard title="Error loading thread">{error}</SectionCard>
  }

  if (!data) {
    return <SectionCard title="Loading" subtitle="Thread ophalen...">Even geduld.</SectionCard>
  }

  const { inquiry, messages } = data

  return (
    <div className="space-y-6">
      <SectionCard
        title={`Inquiry from ${inquiry.senderName ?? inquiry.senderEmail}`}
        subtitle={inquiry.domainName ?? 'Unknown domain'}
      >
        <div className="flex flex-wrap gap-2 text-sm">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[inquiry.status] ?? STATUS_COLORS.read}`}
          >
            {inquiry.status}
          </span>
          {inquiry.classification ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${CLASSIFICATION_COLORS[inquiry.classification] ?? 'bg-slate-100 text-slate-700'}`}
            >
              {CLASSIFICATION_LABELS[inquiry.classification] ?? inquiry.classification}
            </span>
          ) : null}
          {inquiry.offerAmount ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
              {formatCurrency(inquiry.offerAmount)}
            </span>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-700">{inquiry.message}</p>

        {inquiry.classificationReason ? (
          <p className="mt-2 text-xs italic text-slate-400">{inquiry.classificationReason}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={classifying}
            onClick={async () => {
              setClassifying(true)
              setActionMessage(null)
              try {
                const result = await classifyInquiryApi(inquiryId!)
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        inquiry: {
                          ...prev.inquiry,
                          classification: result.classification,
                          classificationReason: result.reason,
                        },
                      }
                    : prev,
                )
                setActionMessage(`Classified as: ${CLASSIFICATION_LABELS[result.classification] ?? result.classification}`)
              } catch (err) {
                setActionMessage(err instanceof Error ? err.message : 'Classification failed.')
              } finally {
                setClassifying(false)
              }
            }}
            className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {classifying ? 'Classifying…' : 'Classify'}
          </button>

          <button
            type="button"
            disabled={drafting}
            onClick={async () => {
              setDrafting(true)
              setActionMessage(null)
              try {
                const result = await draftInquiryReplyApi(inquiryId!)
                setDraftResult(result.draft)
              } catch (err) {
                setActionMessage(err instanceof Error ? err.message : 'Draft generation failed.')
              } finally {
                setDrafting(false)
              }
            }}
            className="rounded-lg border border-emerald-900 px-4 py-2 text-sm text-emerald-900 disabled:opacity-50"
          >
            {drafting ? 'Generating…' : 'Draft reply'}
          </button>

          <Link
            to="/admin/inbox"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Terug naar inbox
          </Link>
        </div>

        {actionMessage ? (
          <p className="mt-3 text-sm text-slate-600">{actionMessage}</p>
        ) : null}
      </SectionCard>

      {draftResult ? (
        <SectionCard
          title="Draft reply"
          subtitle="Bekijk en verstuur handmatig via je e-mailclient — nooit automatisch verzonden."
        >
          <p className="text-sm font-medium text-slate-900">
            Subject: {draftResult.subject}
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {draftResult.body}
          </pre>
          <p className="mt-2 text-xs text-slate-400">
            Dit concept is opgeslagen in de thread. Kopieer en verstuur via je e-mailclient.
          </p>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Berichtenhistorie"
        subtitle={`${messages.length} bericht${messages.length !== 1 ? 'en' : ''} in deze thread`}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">Geen berichten gevonden in deze thread.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl p-4 text-sm ${
                  msg.direction === 'inbound' ? 'bg-slate-50' : 'bg-emerald-50'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {msg.direction === 'inbound'
                      ? 'Inbound'
                      : msg.classification === 'draft_reply'
                        ? 'Concept (niet verzonden)'
                        : 'Outbound'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {msg.sentAt
                      ? new Date(msg.sentAt).toLocaleString('nl-NL')
                      : 'Niet verzonden'}
                  </span>
                </div>
                {msg.subject ? (
                  <p className="mb-1 font-medium text-slate-800">{msg.subject}</p>
                ) : null}
                <p className="whitespace-pre-wrap leading-6 text-slate-700">{msg.body}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/pages/InquiryThreadPage.tsx
git commit -m "feat: add InquiryThreadPage with thread view, classify, and draft reply"
```

---

## Task 9: Add route + update InboxPage

**Files:**
- Modify: `src/router.tsx`
- Modify: `src/pages/InboxPage.tsx`

- [ ] **Step 1: Add the new route to `src/router.tsx`**

Add the import and route:

```typescript
// Add import:
import { InquiryThreadPage } from './pages/InquiryThreadPage'

// Add inside the admin route children array, after the inbox route:
{ path: 'admin/inbox/:inquiryId', element: <InquiryThreadPage /> },
```

The admin children array should look like:

```typescript
children: [
  { index: true, element: <DashboardPage /> },
  { path: 'login', element: <LoginPage /> },
  { path: 'admin/inbox', element: <InboxPage /> },
  { path: 'admin/inbox/:inquiryId', element: <InquiryThreadPage /> },
  { path: 'admin/deals', element: <DealsPage /> },
  { path: 'admin/domains', element: <DomainsPage /> },
  { path: 'admin/domains/:domainId', element: <DomainDetailPage /> },
  { path: 'admin/leads', element: <LeadsPage /> },
],
```

- [ ] **Step 2: Update `InboxPage.tsx` — add status/classification badges and link to thread**

In `src/pages/InboxPage.tsx`, add the classification/status helpers and update the inquiry card. Make these changes:

**Add import at top:**
```typescript
import { Link } from 'react-router-dom'
// Link is already imported — confirm it's there, or add it
```

**Add badge helpers after imports:**
```typescript
const CLASSIFICATION_LABELS: Record<string, string> = {
  serious_offer: 'Serious offer',
  info_request: 'Info request',
  lowball: 'Lowball',
  spam: 'Spam',
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  serious_offer: 'bg-emerald-100 text-emerald-800',
  info_request: 'bg-blue-100 text-blue-800',
  lowball: 'bg-yellow-100 text-yellow-800',
  spam: 'bg-red-100 text-red-800',
}
```

**In the inquiry card `article`, update the header div to include badges and a link to the thread:**

Replace the existing header `<div>` block (containing `<p>` type label and `<h2>` sender name) with:

```typescript
<div>
  <div className="flex flex-wrap items-center gap-2">
    <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">
      {item.inquiryType === 'offer' ? 'Offer' : 'Contact'}
    </p>
    {item.status === 'new' ? (
      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">Nieuw</span>
    ) : null}
    {item.classification ? (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_COLORS[item.classification] ?? 'bg-slate-100 text-slate-700'}`}
      >
        {CLASSIFICATION_LABELS[item.classification] ?? item.classification}
      </span>
    ) : null}
  </div>
  <Link to={`/admin/inbox/${item.id}`}>
    <h2 className="mt-2 text-xl font-semibold text-slate-950 hover:text-emerald-800">
      {item.senderName ?? item.senderEmail}
    </h2>
  </Link>
  <p className="mt-1 text-sm text-slate-600">{item.senderEmail}</p>
</div>
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Run full build**

```bash
pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test:run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/router.tsx src/pages/InboxPage.tsx
git commit -m "feat: add thread route and status/classification badges to InboxPage"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Inbox list with status (new/read/replied) | Task 2 (schema), Task 3 (repo), Task 7 (api), Task 9 (InboxPage) |
| Thread view showing full message history | Task 3 (getInquiryWithThread), Task 8 (InquiryThreadPage) |
| Auto-mark as read on open | Task 8 (markInquiryRead in useEffect) |
| AI classification (serious/info/lowball/spam) | Task 4+5 (AI module), Task 6 (route POST classify) |
| Store classification + reason auditably | Task 3 (updateInquiryClassification), Task 6 (stores to D1) |
| Draft-only reply (never auto-sent) | Task 5 (draftReply), Task 6 (route POST draft-reply), Task 8 (UI shows as read-only) |
| Draft stored in thread as message | Task 3 (saveReplyDraft inserts with sentAt=null), Task 8 (shows as "Concept (niet verzonden)") |
| No auto-send behavior | All draft routes only insert, never trigger send |
| Tests for AI module | Task 4 (7 tests) |
| ANTHROPIC_API_KEY | Already configured — no new secrets needed |

### Placeholder scan: none found.

### Type consistency

- `InquiryClassification` defined in Task 5, used in Task 6 worker route — matches.
- `InquiryWithThread` interface in Task 3, return type of `getInquiryWithThread` — matches `InquiryWithThreadRecord` in Task 7 api.ts.
- `saveReplyDraft` returns `{ id, subject, body }` in Task 3 — matches worker response shape in Task 6 — matches `draftInquiryReplyApi` return type in Task 7.
- `status: 'new' | 'read' | 'replied'` in schema Task 1, `updateInquiryStatus` Task 3, route schema Task 6 — all consistent.
