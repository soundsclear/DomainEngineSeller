import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseDomainCsvRows, type DomainCsvRow } from '../src/lib/csv-import'
import { determineClosingNextStep } from '../src/lib/closing-rules'
import { generatePriceRecommendation } from '../src/lib/pricing-engine'
import { buildLeadOutreachDraft } from '../src/server/outreach'
import { buildBuyerDiscoveryOutreachDraft } from '../src/server/buyer-outreach'
import type { OutreachTone } from '../src/lib/outreach-draft'
import { createLeadOutreachWorkflow } from '../src/server/outreach-workflow'
import {
  approveOutreachWorkflow,
  countOutreachWorkflowsForLead,
  getOutreachWorkflowByThreadId,
  listOutreachWorkflows,
  listSendableApprovedOutreachWorkflows,
  markOutreachWorkflowSent,
  saveOutreachWorkflow,
} from '../src/server/db/outreach-repository'
import { getSetting, listSettings, upsertSetting } from '../src/server/db/settings-repository'
import { countInboundInquiries, listInboundInquiries, saveInboundInquiry, getInquiryWithThread, updateInquiryStatus, updateInquiryClassification, saveReplyDraft, saveNegotiationDraft, markMessageSent, type NegotiationDraftPayload } from '../src/server/db/inquiry-repository'
import { writeAudit, listAuditLog } from '../src/server/db/audit-repository'
import { runApifyContactEnrichment } from '../src/server/ai/apify-contact-enrichment'
import { classifyInquiry, draftReply, negotiateCounter, type InquiryClassification } from '../src/server/ai/inquiry-intelligence'
import { createAnthropicClientFromEnv } from '../src/server/ai/anthropic'
import { createDealFromInquiry, getDeal, listDeals, progressDeal } from '../src/server/db/deal-repository'
import { buildStripeInvoicePayload } from '../src/server/stripe-invoice'
import { getDashboardMetrics as getRealDashboardMetrics } from '../src/server/db/metrics-repository'
import { listTransferTasks } from '../src/server/db/transfer-task-repository'
import {
  listProviderTransactions,
  createProviderTransaction,
} from '../src/server/db/provider-transaction-repository'
import {
  createDomain,
  deleteDomain,
  getDashboardMetrics,
  getDomain,
  importDomains,
  listDomains,
  updateDomain,
} from '../src/server/db/domain-repository'
import {
  getDomainPageContent,
  getPublicDomain,
  listPublicDomains,
  upsertDomainPageContent,
} from '../src/server/db/public-domain-repository'
import {
  getLeadById,
  listLeadsForDomain,
  listAllLeads,
  createManualLead,
  updateLeadDoNotContact,
  deleteLead,
  upsertLeadContactSnapshot,
} from '../src/server/db/lead-repository'
import {
  completeLeadEnrichmentRun,
  createLeadEnrichmentRun,
  failLeadEnrichmentRun,
  listLeadEnrichmentSummariesForDomain,
} from '../src/server/db/lead-enrichment-repository'
import { discoverAndStoreBuyerLeads } from '../src/server/ai/buyer-discovery'
import { generateAndStoreDomainSeoContent } from '../src/server/ai/seo-generation'
import { sendInquiryNotification, sendOutreachEmail, sendTestEmail } from '../src/server/email'
import { saveExperiment, listExperiments, updateExperimentStatus, saveExperimentVariant, getExperimentResults, getPricingIntelligence, updateAssignmentThread } from '../src/server/db/experiment-repository'
import { assignVariantForLead } from '../src/server/experiment-rotation'
import { logOutcomeForThread } from '../src/server/experiment-outcomes'

type Bindings = {
  DB: D1Database
  OUTREACH_AUTO_SEND_ENABLED: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
  BRAVE_SEARCH_API_KEY?: string
  RESEND_API_KEY: string
  ADMIN_NOTIFY_EMAIL: string
  EMAIL_FROM_ADDRESS: string
  TEST_EMAIL_OVERRIDE?: string
  TURNSTILE_SECRET_KEY?: string
  APIFY_API_TOKEN?: string
  APIFY_CONTACT_SCRAPER_ACTOR_ID?: string
  OUTREACH_CONTACT_ENABLED?: string
  ADMIN_PASSWORD?: string
  ADMIN_SESSION_SECRET?: string
  ASSETS?: Fetcher
}

const app = new Hono<{ Bindings: Bindings }>()

function parseNegotiationDraftMessage(body: string): NegotiationDraftPayload | null {
  try {
    const parsed = JSON.parse(body) as Partial<NegotiationDraftPayload>
    if (
      typeof parsed.suggestedPrice === 'number' &&
      typeof parsed.reasoning === 'string' &&
      typeof parsed.draftSubject === 'string' &&
      typeof parsed.draftBody === 'string'
    ) {
      return {
        suggestedPrice: parsed.suggestedPrice,
        reasoning: parsed.reasoning,
        draftSubject: parsed.draftSubject,
        draftBody: parsed.draftBody,
      }
    }
  } catch {
    return null
  }

  return null
}

function requireOutreachEmailConfig(env: Bindings) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM_ADDRESS) {
    throw new Error('Email is not configured. Set RESEND_API_KEY and EMAIL_FROM_ADDRESS.')
  }

  return {
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM_ADDRESS,
  }
}

function parseTruthyFlag(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function getSettingStringValue(setting: Awaited<ReturnType<typeof getSetting>>) {
  if (typeof setting?.value !== 'string') {
    return null
  }

  const trimmed = setting.value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function pickBestApifyContactSnapshot(
  companyName: string,
  website: string,
  contacts: Array<{
    type: string
    value: string
    label?: string | null
    sourceUrl?: string | null
    confidence: number
  }>,
) {
  const ranked = [...contacts].sort((left, right) => right.confidence - left.confidence)
  const bestEmail = ranked.find((contact) => contact.type === 'email') ?? null
  const bestNamedContact =
    ranked.find((contact) => Boolean(contact.label?.trim()) && contact.type === 'email') ??
    ranked.find((contact) => Boolean(contact.label?.trim())) ??
    null

  return {
    contactName: bestNamedContact?.label?.trim() || companyName,
    contactEmail: bestEmail?.value ?? null,
    contactPageUrl: bestEmail?.sourceUrl ?? ranked[0]?.sourceUrl ?? website,
  }
}

async function getOutreachAutoSendDailyLimit(binding: D1Database) {
  const setting = await getSetting(binding, 'OUTREACH_DAILY_LIMIT')
  const rawValue = setting?.value

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.max(0, Math.floor(rawValue))
  }

  if (typeof rawValue === 'string') {
    const parsed = Number(rawValue)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }

  return 10
}

async function getBooleanSetting(
  binding: D1Database,
  key: string,
  fallback: boolean,
) {
  const setting = await getSetting(binding, key)
  const rawValue = setting?.value

  if (typeof rawValue !== 'string') {
    return fallback
  }

  return parseTruthyFlag(rawValue)
}

async function isContactSendingEnabled(binding: D1Database, env: Bindings) {
  if (typeof env.OUTREACH_CONTACT_ENABLED === 'string') {
    return parseTruthyFlag(env.OUTREACH_CONTACT_ENABLED)
  }

  return getBooleanSetting(binding, 'OUTREACH_CONTACT_ENABLED', false)
}

async function getPublicTurnstileSiteKey(binding: D1Database) {
  const setting = await getSetting(binding, 'TURNSTILE_SITE_KEY')
  return typeof setting?.value === 'string' && setting.value.trim() ? setting.value.trim() : null
}

async function getTurnstileSecret(binding: D1Database, env: Bindings) {
  if (env.TURNSTILE_SECRET_KEY?.trim()) {
    return env.TURNSTILE_SECRET_KEY.trim()
  }

  const setting = await getSetting(binding, 'TURNSTILE_SECRET_KEY')
  return typeof setting?.value === 'string' && setting.value.trim() ? setting.value.trim() : null
}

async function verifyTurnstileToken(
  binding: D1Database,
  env: Bindings,
  token: string | undefined,
) {
  const secret = await getTurnstileSecret(binding, env)

  if (!secret) {
    return true
  }

  if (!token) {
    return false
  }

  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    return false
  }

  const payload = (await response.json()) as { success?: boolean }
  return payload.success === true
}

async function sendApprovedOutreachWorkflow(
  binding: D1Database,
  env: Bindings,
  threadId: string,
) {
  if (!(await isContactSendingEnabled(binding, env))) {
    throw new Error('Contact sending is disabled in this environment.')
  }

  const workflow = await getOutreachWorkflowByThreadId(binding, threadId)

  if (!workflow) {
    throw new Error('Outreach workflow not found.')
  }

  if (workflow.message.sentAt != null || workflow.thread.status === 'sent') {
    throw new Error('Outreach workflow has already been sent.')
  }

  if (workflow.thread.status !== 'approved_to_send') {
    throw new Error('Outreach workflow must be approved before sending.')
  }

  if (workflow.lead.doNotContact) {
    throw new Error('Lead is marked do-not-contact.')
  }

  if (!workflow.lead.contactEmail) {
    throw new Error('Outreach workflow is missing a contact email.')
  }

  const emailConfig = requireOutreachEmailConfig(env)
  const testOverride = env.TEST_EMAIL_OVERRIDE?.trim() || null
  const to = testOverride ?? workflow.lead.contactEmail
  const subject = testOverride
    ? `[TEST → ${workflow.lead.contactEmail}] ${workflow.message.subject || `${workflow.domain.domainName} outreach`}`
    : (workflow.message.subject || `${workflow.domain.domainName} outreach`)
  await sendOutreachEmail({ ...emailConfig, to, subject, body: workflow.message.body })

  const updated = await markOutreachWorkflowSent(binding, threadId)
  return updated
}

export interface ScheduledOutreachAutoSendResult {
  enabled: boolean
  dailyLimit: number
  considered: number
  sent: number
  failed: number
  skipped: number
  skippedReason: string | null
}

export async function runScheduledOutreachAutoSend(
  binding: D1Database,
  env: Bindings,
): Promise<ScheduledOutreachAutoSendResult> {
  if (!(await isContactSendingEnabled(binding, env))) {
    return {
      enabled: false,
      dailyLimit: 0,
      considered: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: 'Contact sending is disabled in this environment.',
    }
  }

  if (!parseTruthyFlag(env.OUTREACH_AUTO_SEND_ENABLED)) {
    return {
      enabled: false,
      dailyLimit: 0,
      considered: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skippedReason: 'OUTREACH_AUTO_SEND_ENABLED is disabled.',
    }
  }

  const dailyLimit = await getOutreachAutoSendDailyLimit(binding)
  const suppressUnsubscribed = await getBooleanSetting(
    binding,
    'GDPR_SUPPRESS_UNSUBSCRIBED',
    true,
  )
  const candidates = (await listSendableApprovedOutreachWorkflows(binding))
    .filter(
      (workflow) =>
        workflow.thread.autoSendEnabled &&
        (suppressUnsubscribed ? !workflow.lead.doNotContact : true),
    )
    .sort((left, right) => Date.parse(left.thread.createdAt) - Date.parse(right.thread.createdAt))

  const items = candidates.slice(0, dailyLimit)
  let sent = 0
  let failed = 0

  for (const workflow of items) {
    try {
      const updated = await sendApprovedOutreachWorkflow(binding, env, workflow.thread.id)
      if (updated) {
        sent += 1
      }
    } catch (error) {
      failed += 1
      console.error('Scheduled outreach auto-send failed:', error)
    }
  }

  return {
    enabled: true,
    dailyLimit,
    considered: candidates.length,
    sent,
    failed,
    skipped: Math.max(0, candidates.length - items.length),
    skippedReason: null,
  }
}

// --- Zod schemas ---

const inquiryInputSchema = z.object({
  domainId: z.string().min(1),
  senderName: z.string().min(1),
  senderEmail: z.string().email(),
  offerAmount: z.coerce.number().int().positive().optional(),
  message: z.string().min(10),
  cfTurnstileToken: z.string().optional(),
})

const outreachDraftRequestSchema = z.object({
  sender: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  tone: z.enum(['concise', 'standard', 'detailed']).default('standard'),
  outreachCount: z.number().int().min(0).max(2).default(0),
  autoSendEnabled: z.boolean().default(false),
  dailyLimit: z.number().int().min(0).default(10),
})

const createDealFromInquirySchema = z.object({
  closingMethod: z.enum(['escrow_com', 'sedo_transfer', 'afternic_network']),
})

const progressDealSchema = z.object({
  paymentSecured: z.boolean(),
  buyerUsesXel: z.boolean(),
  buyerApprovalState: z.enum(['pending', 'approved', 'disputed']),
  buyerXelAccount: z.string().optional(),
  buyerRegistrar: z.string().optional(),
})

const outreachBatchSendSchema = z.object({
  threadIds: z.array(z.string().min(1)).optional().default([]),
})

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

const leadEnrichmentBatchSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(20),
})

const settingValueSchema = z.object({
  value: z.any(),
})

const createDomainSchema = z.object({
  domainName: z.string().min(3),
  tld: z.string().min(2),
  language: z.enum(['NL', 'EN']).default('EN'),
  category: z.string().min(1),
  status: z
    .enum(['draft', 'listed', 'inbound_only', 'outbound_research', 'negotiation', 'deal_in_progress', 'sold', 'drop_candidate'])
    .default('listed'),
  sellMode: z.enum(['afternic_lander', 'sedo_lander', 'portfolio_redirect']).default('portfolio_redirect'),
  currentRegistrar: z.enum(['xel', 'dynadot', 'openprovider']).default('xel'),
  acquisitionCost: z.coerce.number().min(0).default(0),
  annualRenewalCost: z.coerce.number().min(0).default(0),
  notes: z.string().default(''),
  migrationCandidate: z.boolean().default(false),
  targetRegistrar: z.enum(['dynadot', 'openprovider']).optional(),
})

const updateDomainSchema = createDomainSchema.partial().omit({ domainName: true, tld: true })

const domainPageContentSchema = z.object({
  seoTitle: z.string().min(10),
  metaDescription: z.string().min(20),
  heroHeadline: z.string().min(5),
  heroSubheadline: z.string().min(10),
  bodyContent: z.string().min(40),
  contentStatus: z.enum(['draft', 'generated', 'manual']).default('draft'),
  generatedAt: z.number().int().nullable().optional(),
})

const generateDomainPageContentSchema = z.object({
  force: z.boolean().optional().default(false),
})

const csvImportSchema = z.object({
  rows: z.array(
    z.object({
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
    }),
  ),
})

// --- Admin auth helpers ---

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function buildSessionCookie(secret: string): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + 8 * 3600 * 1000 })
  const b64 = btoa(payload)
  const sig = await signPayload(b64, secret)
  return `admin_session=${b64}.${sig}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`
}

async function verifySession(cookieHeader: string | null, secret: string): Promise<boolean> {
  if (!cookieHeader) return false
  const match = cookieHeader.match(/admin_session=([^;]+)/)
  if (!match) return false
  const [b64, sig] = match[1].split('.')
  if (!b64 || !sig) return false
  const expected = await signPayload(b64, secret)
  if (expected !== sig) return false
  try {
    const { exp } = JSON.parse(atob(b64)) as { exp: number }
    return Date.now() < exp
  } catch { return false }
}

app.post('/api/admin/login', async (c) => {
  const { ADMIN_PASSWORD, ADMIN_SESSION_SECRET } = c.env
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
    return c.json({ error: 'Auth not configured.' }, 503)
  }
  const body = await c.req.json<{ password?: string }>()
  if (body.password !== ADMIN_PASSWORD) {
    return c.json({ error: 'Invalid password.' }, 401)
  }
  const cookie = await buildSessionCookie(ADMIN_SESSION_SECRET)
  c.header('Set-Cookie', cookie)
  return c.json({ ok: true })
})

app.post('/api/admin/logout', (c) => {
  c.header('Set-Cookie', 'admin_session=; Max-Age=0; Path=/')
  return c.json({ ok: true })
})

app.get('/api/admin/me', async (c) => {
  const { ADMIN_SESSION_SECRET } = c.env
  if (!ADMIN_SESSION_SECRET) return c.json({ error: 'Auth not configured.' }, 503)
  const valid = await verifySession(c.req.header('Cookie') ?? null, ADMIN_SESSION_SECRET)
  if (!valid) return c.json({ error: 'Not authenticated.' }, 401)
  return c.json({ ok: true })
})

app.get('/api/admin/audit', async (c) => {
  const entries = await listAuditLog(c.env.DB)
  return c.json({ items: entries })
})

// --- Health ---

app.get('/api/health', (c) => c.json({ ok: true, phase: 'phase1' }))

// --- Dashboard ---

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

// --- Domains ---

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

app.get('/api/public/portfolio', async (c) => {
  const items = await listPublicDomains(c.env.DB)
  return c.json({ items })
})

app.get('/api/public/domains/:domainId', async (c) => {
  const item = await getPublicDomain(c.env.DB, c.req.param('domainId'))

  if (!item) {
    return c.json({ error: 'Public domain not found.' }, 404)
  }

  return c.json(item)
})

app.get('/api/public/config', async (c) => {
  const turnstileSiteKey = await getPublicTurnstileSiteKey(c.env.DB)
  return c.json({ turnstileSiteKey })
})

// --- Settings ---

app.get('/api/settings', async (c) => {
  const items = await listSettings(c.env.DB)
  return c.json({ items })
})

app.put('/api/settings/:key', zValidator('json', settingValueSchema), async (c) => {
  try {
    const item = await upsertSetting(
      c.env.DB,
      c.req.param('key'),
      String(c.req.valid('json').value ?? ''),
    )
    return c.json({ ok: true, item })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not update setting.' }, 400)
  }
})

// Import must be registered before :domainId to avoid route conflict
app.post('/api/domains/import', zValidator('json', csvImportSchema), async (c) => {
  const { rows } = c.req.valid('json')
  const parsed = parseDomainCsvRows(rows as DomainCsvRow[])
  const result = await importDomains(c.env.DB, parsed.imported)
  return c.json({ ok: true, ...result, parseErrors: parsed.errors })
})

app.post('/api/domains', zValidator('json', createDomainSchema), async (c) => {
  try {
    const domain = await createDomain(c.env.DB, c.req.valid('json'))
    return c.json({ ok: true, item: domain }, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not create domain.' }, 400)
  }
})

app.get('/api/domains/:domainId/page-content', async (c) => {
  const item = await getDomainPageContent(c.env.DB, c.req.param('domainId'))
  return c.json({ item })
})

app.post('/api/domains/:domainId/page-content/generate', zValidator('json', generateDomainPageContentSchema), async (c) => {
  try {
    const result = await generateAndStoreDomainSeoContent({
      binding: c.env.DB,
      domainId: c.req.param('domainId'),
      force: c.req.valid('json').force,
      ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: c.env.ANTHROPIC_MODEL,
    })

    return c.json({
      ok: true,
      item: result.content,
      meta: {
        provider: result.provider,
        model: result.model,
      },
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not generate domain page content.' }, 400)
  }
})

app.put('/api/domains/:domainId/page-content', zValidator('json', domainPageContentSchema), async (c) => {
  try {
    const item = await upsertDomainPageContent(c.env.DB, c.req.param('domainId'), c.req.valid('json'))
    return c.json({ ok: true, item })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not save domain page content.' }, 400)
  }
})

app.get('/api/domains/:domainId/leads', async (c) => {
  const items = await listLeadsForDomain(c.env.DB, c.req.param('domainId'))
  return c.json({ items })
})

app.get('/api/domains/:domainId/lead-enrichment', async (c) => {
  const items = await listLeadEnrichmentSummariesForDomain(c.env.DB, c.req.param('domainId'))
  return c.json({ items })
})

app.post('/api/domains/:domainId/leads/:leadId/enrich-contacts', async (c) => {
  const domainId = c.req.param('domainId')
  const leadId = c.req.param('leadId')
  const lead = await getLeadById(c.env.DB, leadId)

  if (!lead || lead.domainId !== domainId) {
    return c.json({ error: 'Lead not found for this domain.' }, 404)
  }

  if (!lead.website) {
    return c.json({ error: 'Lead has no website to enrich.' }, 400)
  }

  const token =
    c.env.APIFY_API_TOKEN?.trim() ||
    getSettingStringValue(await getSetting(c.env.DB, 'APIFY_API_TOKEN'))
  const actorId =
    c.env.APIFY_CONTACT_SCRAPER_ACTOR_ID?.trim() ||
    getSettingStringValue(await getSetting(c.env.DB, 'APIFY_CONTACT_SCRAPER_ACTOR_ID')) ||
    'poidata/contact-details-scraper'

  if (!token) {
    return c.json({ error: 'Apify is not configured. Set APIFY_API_TOKEN.' }, 400)
  }

  const run = await createLeadEnrichmentRun(c.env.DB, {
    leadId,
    provider: 'apify',
    actorId,
    sourceWebsite: lead.website,
  })

  try {
    const result = await runApifyContactEnrichment({
      website: lead.website,
      actorId,
      token,
    })

    const summary = await completeLeadEnrichmentRun(c.env.DB, {
      runId: run.id,
      contacts: result.contacts,
      rawPayloadJson: JSON.stringify(result.rawItems),
    })
    const snapshot = pickBestApifyContactSnapshot(lead.companyName, lead.website, result.contacts)
    await upsertLeadContactSnapshot(c.env.DB, {
      leadId,
      contactName: snapshot.contactName,
      contactEmail: snapshot.contactEmail,
      contactPageUrl: snapshot.contactPageUrl,
    })

    return c.json({
      ok: true,
      item: summary,
      meta: {
        provider: result.provider,
        actorId: result.actorId,
        website: result.website,
        enriched: 1,
        contactsFound: result.contacts.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not enrich lead contacts.'
    await failLeadEnrichmentRun(c.env.DB, { runId: run.id, errorMessage: message })
    return c.json({ error: message }, 400)
  }
})

app.post('/api/domains/:domainId/lead-enrichment/run', zValidator('json', leadEnrichmentBatchSchema), async (c) => {
  const domainId = c.req.param('domainId')
  const requestedLeadIds = c.req.valid('json').leadIds
  const results: Array<{
    leadId: string
    ok: boolean
    contactsFound?: number
    error?: string
  }> = []

  for (const leadId of requestedLeadIds) {
    const lead = await getLeadById(c.env.DB, leadId)
    if (!lead || lead.domainId !== domainId) {
      results.push({ leadId, ok: false, error: 'Lead not found for this domain.' })
      continue
    }

    if (!lead.website) {
      results.push({ leadId, ok: false, error: 'Lead has no website to enrich.' })
      continue
    }

    const token =
      c.env.APIFY_API_TOKEN?.trim() ||
      getSettingStringValue(await getSetting(c.env.DB, 'APIFY_API_TOKEN'))
    const actorId =
      c.env.APIFY_CONTACT_SCRAPER_ACTOR_ID?.trim() ||
      getSettingStringValue(await getSetting(c.env.DB, 'APIFY_CONTACT_SCRAPER_ACTOR_ID')) ||
      'poidata/contact-details-scraper'

    if (!token) {
      return c.json({ error: 'Apify is not configured. Set APIFY_API_TOKEN.' }, 400)
    }

    const run = await createLeadEnrichmentRun(c.env.DB, {
      leadId,
      provider: 'apify',
      actorId,
      sourceWebsite: lead.website,
    })

    try {
      const result = await runApifyContactEnrichment({
        website: lead.website,
        actorId,
        token,
      })

      await completeLeadEnrichmentRun(c.env.DB, {
        runId: run.id,
        contacts: result.contacts,
        rawPayloadJson: JSON.stringify(result.rawItems),
      })
      const snapshot = pickBestApifyContactSnapshot(lead.companyName, lead.website, result.contacts)
      await upsertLeadContactSnapshot(c.env.DB, {
        leadId,
        contactName: snapshot.contactName,
        contactEmail: snapshot.contactEmail,
        contactPageUrl: snapshot.contactPageUrl,
      })

      results.push({
        leadId,
        ok: true,
        contactsFound: result.contacts.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not enrich lead contacts.'
      await failLeadEnrichmentRun(c.env.DB, { runId: run.id, errorMessage: message })
      results.push({ leadId, ok: false, error: message })
    }
  }

  const items = await listLeadEnrichmentSummariesForDomain(c.env.DB, domainId)
  return c.json({
    ok: true,
    items,
    meta: {
      enriched: results.filter((item) => item.ok).length,
      contactsFound: results.reduce((sum, item) => sum + (item.contactsFound ?? 0), 0),
      skipped: results.filter((item) => !item.ok).length,
    },
    summary: {
      requested: requestedLeadIds.length,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    },
  })
})

app.post(
  '/api/domains/:domainId/leads/:leadId/outreach-draft',
  zValidator('json', outreachDraftRequestSchema),
  async (c) => {
    try {
      const domainId = c.req.param('domainId')
      const leadId = c.req.param('leadId')
      const lead = await getLeadById(c.env.DB, leadId)

      if (!lead || lead.domainId !== domainId) {
        return c.json({ error: 'Lead not found for this domain.' }, 404)
      }

      const domain = await getDomain(c.env.DB, domainId)
      if (!domain) {
        return c.json({ error: 'Domain not found.' }, 404)
      }

      const outreachCount = await countOutreachWorkflowsForLead(c.env.DB, leadId)
      const draftRotation = await assignVariantForLead(c.env.DB, leadId).catch(() => null)
      const draftVariantConfig = draftRotation?.variant ?? null
      const validTones = ['concise', 'standard', 'detailed'] as const
      const rawDraftTone = draftVariantConfig?.tone
      const draftTone: OutreachTone = (validTones as readonly string[]).includes(rawDraftTone ?? '') ? (rawDraftTone as OutreachTone) : (c.req.valid('json').tone ?? 'standard')
      const draftHasPrice = draftVariantConfig?.hasPrice ?? false
      const draftFollowupDays1 = draftVariantConfig?.followupDays1 ?? 5
      const draftFollowupDays2 = draftVariantConfig?.followupDays2 ?? 7
      const response = buildBuyerDiscoveryOutreachDraft({
        lead,
        domain,
        sender: c.req.valid('json').sender,
        tone: draftTone,
        hasPrice: draftHasPrice,
        followupDays1: draftFollowupDays1,
        followupDays2: draftFollowupDays2,
        outreachCount,
        autoSendEnabled: c.req.valid('json').autoSendEnabled,
        dailyLimit: c.req.valid('json').dailyLimit,
      })

      return c.json(response)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not build outreach draft.' }, 400)
    }
  },
)

app.post(
  '/api/domains/:domainId/leads/:leadId/outreach-workflow',
  zValidator('json', outreachDraftRequestSchema),
  async (c) => {
    try {
      const domainId = c.req.param('domainId')
      const leadId = c.req.param('leadId')
      const lead = await getLeadById(c.env.DB, leadId)

      if (!lead || lead.domainId !== domainId) {
        return c.json({ error: 'Lead not found for this domain.' }, 404)
      }

      const domain = await getDomain(c.env.DB, domainId)
      if (!domain) {
        return c.json({ error: 'Domain not found.' }, 404)
      }

      const outreachCount = await countOutreachWorkflowsForLead(c.env.DB, leadId)
      const rotation = await assignVariantForLead(c.env.DB, leadId).catch(() => null)
      const variantConfig = rotation?.variant ?? null
      const validTones2 = ['concise', 'standard', 'detailed'] as const
      const rawTone = variantConfig?.tone
      const tone: OutreachTone = (validTones2 as readonly string[]).includes(rawTone ?? '') ? (rawTone as OutreachTone) : (c.req.valid('json').tone ?? 'standard')
      const hasPrice = variantConfig?.hasPrice ?? false
      const followupDays1 = variantConfig?.followupDays1 ?? 5
      const followupDays2 = variantConfig?.followupDays2 ?? 7
      const built = buildBuyerDiscoveryOutreachDraft({
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

      if (!built.result.eligible || !built.result.draft) {
        return c.json({ error: built.result.reason }, 400)
      }

      const workflow = {
        thread: {
          id: `thread-${crypto.randomUUID()}`,
          leadId: lead.id,
          domainId: domain.id,
          status: 'draft_prepared' as const,
          autoSendEnabled: c.req.valid('json').autoSendEnabled ?? false,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: {
          id: `msg-${crypto.randomUUID()}`,
          threadId: '',
          direction: 'outbound' as const,
          channel: 'email' as const,
          subject: built.result.draft.subject,
          body: built.result.draft.body,
          classification: 'draft' as const,
          createdAt: new Date().toISOString(),
        },
        followupTask: {
          id: `followup-${crypto.randomUUID()}`,
          threadId: '',
          dueAt:
            built.result.draft.recommendedFollowUpDays == null
              ? null
              : new Date(
                  Date.now() + built.result.draft.recommendedFollowUpDays * 24 * 60 * 60 * 1000,
                ).toISOString(),
          status:
            built.result.draft.recommendedFollowUpDays == null
              ? ('not_needed' as const)
              : ('pending' as const),
          createdAt: new Date().toISOString(),
        },
        lead: {
          id: lead.id,
          companyName: lead.companyName,
          contactName: lead.companyName,
          doNotContact: lead.doNotContact,
        },
        domain: {
          id: domain.id,
          domainName: domain.domainName,
        },
        draft: built.result.draft,
      }

      workflow.message.threadId = workflow.thread.id
      workflow.followupTask.threadId = workflow.thread.id

      const record = await saveOutreachWorkflow(c.env.DB, workflow)

      if (rotation) {
        await updateAssignmentThread(c.env.DB, rotation.assignmentId, workflow.thread.id).catch(() => {})
      }

      return c.json({ ok: true, item: record }, 201)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not save outreach workflow.' }, 400)
    }
  },
)

app.post('/api/domains/:domainId/buyer-discovery', async (c) => {
  try {
    const apifyToken =
      c.env.APIFY_API_TOKEN?.trim() ||
      getSettingStringValue(await getSetting(c.env.DB, 'APIFY_API_TOKEN')) ||
      undefined
    const apifyActorId =
      c.env.APIFY_CONTACT_SCRAPER_ACTOR_ID?.trim() ||
      getSettingStringValue(await getSetting(c.env.DB, 'APIFY_CONTACT_SCRAPER_ACTOR_ID')) ||
      undefined

    const result = await discoverAndStoreBuyerLeads({
      binding: c.env.DB,
      domainId: c.req.param('domainId'),
      ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: c.env.ANTHROPIC_MODEL,
      BRAVE_SEARCH_API_KEY: c.env.BRAVE_SEARCH_API_KEY,
      APIFY_API_TOKEN: apifyToken,
      APIFY_CONTACT_SCRAPER_ACTOR_ID: apifyActorId,
    })

    return c.json({
      ok: true,
      items: result.created,
      meta: {
        queryCount: result.queryPlan.length,
        resultGroups: result.searchResults.length,
        created: result.created.length,
        skipped: result.skippedWebsiteKeys.length,
        searchErrors: result.searchErrors.length,
        enriched: result.enriched.length,
        enrichmentErrors: result.enrichmentErrors.length,
        contactsFound: result.enriched.reduce((sum, item) => sum + item.contactsFound, 0),
      },
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not run buyer discovery.' }, 400)
  }
})

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

// --- Leads ---

app.get('/api/leads', async (c) => {
  const items = await listAllLeads(c.env.DB)
  return c.json({
    items,
    meta: {
      total: items.length,
      doNotContact: items.filter((lead) => lead.doNotContact).length,
    },
  })
})

const createLeadSchema = z.object({
  companyName: z.string().min(1),
  website: z.string().url().optional(),
  domainId: z.string().optional(),
  country: z.string().optional(),
})

app.post('/api/leads', zValidator('json', createLeadSchema), async (c) => {
  try {
    const lead = await createManualLead(c.env.DB, c.req.valid('json'))
    return c.json({ ok: true, item: lead }, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not create lead.' }, 400)
  }
})

const updateLeadSchema = z.object({
  doNotContact: z.boolean(),
})

app.patch('/api/leads/:leadId', zValidator('json', updateLeadSchema), async (c) => {
  try {
    await updateLeadDoNotContact(c.env.DB, c.req.param('leadId'), c.req.valid('json').doNotContact)
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not update lead.' }, 400)
  }
})

app.delete('/api/leads/:leadId', async (c) => {
  try {
    await deleteLead(c.env.DB, c.req.param('leadId'))
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not delete lead.' }, 400)
  }
})

app.post(
  '/api/leads/:leadId/outreach-draft',
  zValidator('json', outreachDraftRequestSchema),
  async (c) => {
    try {
      const response = buildLeadOutreachDraft({
        leadId: c.req.param('leadId'),
        ...c.req.valid('json'),
      })
      return c.json(response)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not build outreach draft.' }, 404)
    }
  },
)

app.get('/api/outreach/workflows', (c) =>
  listOutreachWorkflows(c.env.DB).then((items) => c.json({ items })),
)

app.post(
  '/api/leads/:leadId/outreach-workflows',
  zValidator('json', outreachDraftRequestSchema),
  async (c) => {
    try {
      const workflow = createLeadOutreachWorkflow({
        leadId: c.req.param('leadId'),
        ...c.req.valid('json'),
      })
      const record = await saveOutreachWorkflow(c.env.DB, workflow)
      return c.json({ ok: true, item: record }, 201)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not save outreach workflow.' }, 400)
    }
  },
)

app.post('/api/outreach/workflows/:threadId/approve', async (c) => {
  try {
    const item = await approveOutreachWorkflow(c.env.DB, c.req.param('threadId'))

    if (!item) {
      return c.json({ error: 'Outreach workflow not found.' }, 404)
    }

    return c.json({ ok: true, item })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not approve outreach workflow.'
    const status = message.includes('not found') ? 404 : 400

    return c.json({ error: message }, status)
  }
})

app.post('/api/outreach/workflows/:threadId/send-now', async (c) => {
  try {
    const item = await sendApprovedOutreachWorkflow(c.env.DB, c.env, c.req.param('threadId'))
    return c.json({ ok: true, item })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send outreach workflow.'
    const status =
      message.includes('not found') ? 404 : message.includes('already been sent') ? 409 : 400

    return c.json({ error: message }, status)
  }
})

app.post('/api/outreach/workflows/send-approved', zValidator('json', outreachBatchSendSchema), async (c) => {
  try {
    requireOutreachEmailConfig(c.env)
    const requestedThreadIds = new Set(c.req.valid('json').threadIds)
    const items = (await listSendableApprovedOutreachWorkflows(c.env.DB)).filter((workflow) =>
      requestedThreadIds.size === 0 ? true : requestedThreadIds.has(workflow.thread.id),
    )
    const sent: Array<Awaited<ReturnType<typeof getOutreachWorkflowByThreadId>>> = []
    const failed: Array<{ threadId: string; error: string }> = []

    for (const workflow of items) {
      try {
        const updated = await sendApprovedOutreachWorkflow(c.env.DB, c.env, workflow.thread.id)
        if (updated) {
          sent.push(updated)
        }
      } catch (error) {
        failed.push({
          threadId: workflow.thread.id,
          error: error instanceof Error ? error.message : 'Could not send outreach workflow.',
        })
      }
    }

    return c.json({
      ok: true,
      summary: {
        considered: items.length,
        sent: sent.length,
        failed: failed.length,
      },
      items: sent,
      failed,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not send approved outreach workflows.' }, 400)
  }
})

// --- Inquiries ---

app.get('/api/inquiries', async (c) => {
  const items = await listInboundInquiries(c.env.DB)
  return c.json({ items })
})

app.post('/api/inquiries', zValidator('json', inquiryInputSchema), async (c) => {
  try {
    const payload = c.req.valid('json')
    const turnstileValid = await verifyTurnstileToken(
      c.env.DB,
      c.env,
      payload.cfTurnstileToken,
    )

    if (!turnstileValid) {
      return c.json({ error: 'CAPTCHA verification failed.' }, 400)
    }

    const saved = await saveInboundInquiry(c.env.DB, payload)

    // Log experiment outcomes — fire-and-forget, must not block the response
    if (saved.inquiry.threadId) {
      logOutcomeForThread(c.env.DB, saved.inquiry.threadId, 'reply_received').catch(() => {})
      if (saved.inquiry.offerAmount != null) {
        logOutcomeForThread(c.env.DB, saved.inquiry.threadId, 'offer_made', saved.inquiry.offerAmount).catch(() => {})
      }
    }

    writeAudit(c.env.DB, { entityType: 'inquiry', entityId: saved.inquiry.id, action: 'inquiry_received', actor: 'public', metadata: { domainName: saved.domainName, senderEmail: saved.inquiry.senderEmail } }).catch(() => {})

    const apiKey = c.env.RESEND_API_KEY
    const to = c.env.ADMIN_NOTIFY_EMAIL
    const from = c.env.EMAIL_FROM_ADDRESS

    if (apiKey && to && from) {
      void sendInquiryNotification({
        apiKey,
        from,
        to,
        domainName: saved.domainName,
        senderName: saved.inquiry.senderName,
        senderEmail: saved.inquiry.senderEmail,
        message: saved.inquiry.message,
        offerAmount: saved.inquiry.offerAmount,
        inquiryId: saved.inquiry.id,
        threadId: saved.inquiry.threadId,
      }).catch((err: unknown) => {
        console.error('Inquiry notification email failed:', err)
      })
    }

    return c.json(
      {
        ok: true,
        item: saved.inquiry,
        lead: saved.lead,
        thread: saved.thread,
        followupTask: saved.followupTask,
        message: `Inquiry for ${saved.domainName} received and queued for follow-up.`,
      },
      201,
    )
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not save inquiry.' }, 400)
  }
})

// --- Deals ---

app.get('/api/deals', async (c) => {
  const items = await listDeals(c.env.DB)
  return c.json({ items })
})

app.get('/api/transfer-tasks', async (c) => {
  const items = await listTransferTasks(c.env.DB)
  return c.json({ items })
})

app.post('/api/inquiries/:inquiryId/create-deal', zValidator('json', createDealFromInquirySchema), async (c) => {
  try {
    const body = c.req.valid('json')
    const result = await createDealFromInquiry(c.env.DB, {
      inquiryId: c.req.param('inquiryId'),
      ...body,
    })
    writeAudit(c.env.DB, { entityType: 'deal', entityId: result.dealId, action: 'deal_created', actor: 'admin', metadata: { closingMethod: body.closingMethod } }).catch(() => {})
    return c.json({ ok: true, ...result }, result.created ? 201 : 200)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not create deal.' }, 400)
  }
})

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

  if (result.classification === 'serious_offer' && inquiryWithThread.inquiry.threadId) {
    logOutcomeForThread(c.env.DB, inquiryWithThread.inquiry.threadId, 'reply_positive').catch(() => {})
  }

  writeAudit(c.env.DB, { entityType: 'inquiry', entityId: c.req.param('id'), action: 'inquiry_classified', actor: 'admin', metadata: { classification: result.classification } }).catch(() => {})

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

app.post('/api/inquiries/:id/send-reply', async (c) => {
  const inquiryWithThread = await getInquiryWithThread(c.env.DB, c.req.param('id'))
  if (!inquiryWithThread) return c.json({ error: 'Inquiry not found.' }, 404)
  if (!inquiryWithThread.inquiry.threadId) {
    return c.json({ error: 'Inquiry has no associated thread.' }, 400)
  }

  const { messageId } = (await c.req.json().catch(() => ({}))) as { messageId?: string }

  // Find the message to send: specified messageId or latest unsent draft_reply
  const candidate = messageId
    ? inquiryWithThread.messages.find((m) => m.id === messageId && m.classification === 'draft_reply')
    : [...inquiryWithThread.messages]
        .reverse()
        .find((m) => m.classification === 'draft_reply' && m.sentAt === null)

  if (!candidate) return c.json({ error: 'No unsent draft reply found.' }, 400)
  if (candidate.sentAt !== null) return c.json({ error: 'This draft was already sent.' }, 400)

  const emailConfig = requireOutreachEmailConfig(c.env)
  await sendOutreachEmail({
    ...emailConfig,
    to: inquiryWithThread.inquiry.senderEmail,
    subject: candidate.subject ?? `Re: domain inquiry`,
    body: candidate.body,
  })

  await markMessageSent(c.env.DB, candidate.id)
  await updateInquiryStatus(c.env.DB, c.req.param('id'), 'replied')

  writeAudit(c.env.DB, { entityType: 'inquiry', entityId: c.req.param('id'), action: 'reply_sent', actor: 'admin', metadata: { to: inquiryWithThread.inquiry.senderEmail } }).catch(() => {})

  return c.json({ ok: true, messageId: candidate.id })
})

app.post('/api/inquiries/:id/negotiate', async (c) => {
  const inquiryWithThread = await getInquiryWithThread(c.env.DB, c.req.param('id'))
  if (!inquiryWithThread) return c.json({ error: 'Inquiry not found.' }, 404)
  if (!inquiryWithThread.inquiry.threadId) {
    return c.json({ error: 'Inquiry has no associated thread.' }, 400)
  }
  if (inquiryWithThread.inquiry.classification !== 'serious_offer') {
    return c.json({ error: 'Negotiation is only available for serious offers.' }, 400)
  }

  const domain = await getDomain(c.env.DB, inquiryWithThread.inquiry.domainId ?? '')
  if (!domain) return c.json({ error: 'Domain not found.' }, 404)

  const deal = await createDealFromInquiry(c.env.DB, {
    inquiryId: c.req.param('id'),
    closingMethod: 'escrow_com',
  })

  const client = createAnthropicClientFromEnv(c.env)
  const result = await negotiateCounter({
    inquiry: {
      senderName: inquiryWithThread.inquiry.senderName,
      senderEmail: inquiryWithThread.inquiry.senderEmail,
      message: inquiryWithThread.inquiry.message,
      offerAmount: inquiryWithThread.inquiry.offerAmount,
    },
    domain: {
      domainName: domain.domainName,
      quickSalePrice: domain.quickSalePrice,
      targetPrice: domain.targetPrice,
      aspirationalPrice: domain.aspirationalPrice,
      language: domain.language,
      tld: domain.tld,
    },
    threadHistory: inquiryWithThread.messages.map((message) => {
      if (message.classification === 'negotiation_draft') {
        const payload = parseNegotiationDraftMessage(message.body)
        if (payload) {
          return {
            direction: message.direction,
            subject: payload.draftSubject,
            body: `Suggested counter-offer: EUR ${payload.suggestedPrice}\nReasoning: ${payload.reasoning}\nDraft email:\n${payload.draftBody}`,
            sentAt: message.sentAt,
            createdAt: message.createdAt,
          }
        }
      }

      return {
        direction: message.direction,
        subject: message.subject,
        body: message.body,
        sentAt: message.sentAt,
        createdAt: message.createdAt,
      }
    }),
    client,
  })

  const draft = await saveNegotiationDraft(c.env.DB, {
    threadId: inquiryWithThread.inquiry.threadId,
    payload: result,
  })

  return c.json({
    ok: true,
    deal,
    draft,
    negotiation: result,
  })
})

app.post('/api/deals/:dealId/progress', zValidator('json', progressDealSchema), async (c) => {
  try {
    const dealId = c.req.param('dealId')
    const decision = await progressDeal(c.env.DB, {
      dealId,
      ...c.req.valid('json'),
    })
    writeAudit(c.env.DB, { entityType: 'deal', entityId: dealId, action: 'deal_progressed', actor: 'admin', metadata: { nextStatus: decision.decision.nextStatus } }).catch(() => {})
    return c.json({ ok: true, decision })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not progress deal.' }, 400)
  }
})

const createProviderTransactionSchema = z.object({
  provider: z.enum(['escrow_com', 'sedo', 'afternic', 'other']),
  providerReference: z.string().min(1),
  status: z.string().min(1),
  amount: z.coerce.number().int().positive().optional(),
})

app.get('/api/deals/:dealId/provider-transactions', async (c) => {
  const items = await listProviderTransactions(c.env.DB, c.req.param('dealId'))
  return c.json({ items })
})

app.post(
  '/api/deals/:dealId/provider-transactions',
  zValidator('json', createProviderTransactionSchema),
  async (c) => {
    try {
      const item = await createProviderTransaction(c.env.DB, {
        dealId: c.req.param('dealId'),
        ...c.req.valid('json'),
      })
      return c.json({ ok: true, item }, 201)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not record transaction.' }, 400)
    }
  },
)

app.post(
  '/api/deals/next-step',
  zValidator(
    'json',
    z.object({
      closingMethod: z.enum(['escrow_com', 'sedo_transfer', 'afternic_network']),
      paymentSecured: z.boolean(),
      buyerUsesXel: z.boolean(),
      buyerApprovalState: z.enum(['pending', 'approved', 'disputed']),
    }),
  ),
  async (c) => {
    const decision = determineClosingNextStep(c.req.valid('json'))
    return c.json(decision)
  },
)

// --- Dashboard metrics legacy (used by countInboundInquiries) ---

app.get('/api/dashboard/inquiry-count', async (c) => {
  const count = await countInboundInquiries(c.env.DB)
  return c.json({ count })
})

// --- Email test ---

app.post('/api/test/email', async (c) => {
  const apiKey = c.env.RESEND_API_KEY
  const to = c.env.ADMIN_NOTIFY_EMAIL
  const from = c.env.EMAIL_FROM_ADDRESS

  if (!apiKey || !to || !from) {
    return c.json(
      {
        ok: false,
        error: 'Email not configured. Set RESEND_API_KEY, ADMIN_NOTIFY_EMAIL, and EMAIL_FROM_ADDRESS.',
        configured: { apiKey: !!apiKey, to: !!to, from: !!from },
      },
      400,
    )
  }

  try {
    await sendTestEmail({ apiKey, from, to })
    return c.json({ ok: true, message: `Test email sent to ${to}.` })
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Failed to send test email.' }, 500)
  }
})

// --- Stripe invoice payload ---

const generateInvoicePayloadSchema = z.object({
  buyerName: z.string().min(1),
  buyerEmail: z.string().email(),
  currency: z.enum(['EUR', 'USD']).optional(),
})

app.post('/api/deals/:dealId/invoice', zValidator('json', generateInvoicePayloadSchema), async (c) => {
  try {
    const deal = await getDeal(c.env.DB, c.req.param('dealId'))

    if (!deal) {
      return c.json({ error: 'Deal not found.' }, 404)
    }

    if (deal.closingMethod !== 'stripe_invoice_manual_transfer') {
      return c.json(
        { error: `Invoice payload can only be generated for stripe_invoice_manual_transfer deals. This deal uses: ${deal.closingMethod}.` },
        400,
      )
    }

    const { buyerName, buyerEmail, currency } = c.req.valid('json')

    const payload = buildStripeInvoicePayload({
      dealId: deal.id,
      domainName: deal.domainName ?? deal.domainId,
      agreedPriceInCents: deal.agreedPrice ?? 0,
      buyerName,
      buyerEmail,
      currency,
    })

    return c.json({ ok: true, payload })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not generate invoice payload.' }, 400)
  }
})

// --- Real dashboard metrics ---

app.get('/api/metrics/dashboard', async (c) => {
  const metrics = await getRealDashboardMetrics(c.env.DB)
  return c.json({ metrics })
})

// --- Experiments ---

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

// Serve frontend SPA — must be last route
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw)
  }
  return c.json({ error: 'Not found.' }, 404)
})

const worker = {
  fetch: app.fetch.bind(app),
  scheduled: async (_controller: ScheduledController, env: Bindings, _ctx: ExecutionContext) => {
    await runScheduledOutreachAutoSend(env.DB, env)
  },
}

export default worker
