import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseDomainCsvRows, type DomainCsvRow } from '../src/lib/csv-import'
import { determineClosingNextStep } from '../src/lib/closing-rules'
import { generatePriceRecommendation } from '../src/lib/pricing-engine'
import { buildLeadOutreachDraft } from '../src/server/outreach'
import { createLeadOutreachWorkflow } from '../src/server/outreach-workflow'
import { listOutreachWorkflows, saveOutreachWorkflow } from '../src/server/db/outreach-repository'
import { countInboundInquiries, listInboundInquiries, saveInboundInquiry } from '../src/server/db/inquiry-repository'
import { createDealFromInquiry, listDeals, progressDeal } from '../src/server/db/deal-repository'
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
  listLeadsForDomain,
  listAllLeads,
  createManualLead,
  updateLeadDoNotContact,
  deleteLead,
} from '../src/server/db/lead-repository'
import { discoverAndStoreBuyerLeads } from '../src/server/ai/buyer-discovery'
import { generateAndStoreDomainSeoContent } from '../src/server/ai/seo-generation'
import { sendInquiryNotification, sendTestEmail } from '../src/server/email'

type Bindings = {
  DB: D1Database
  OUTREACH_AUTO_SEND_ENABLED: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
  BRAVE_SEARCH_API_KEY?: string
  RESEND_API_KEY: string
  ADMIN_NOTIFY_EMAIL: string
  EMAIL_FROM_ADDRESS: string
}

const app = new Hono<{ Bindings: Bindings }>()

// --- Zod schemas ---

const inquiryInputSchema = z.object({
  domainId: z.string().min(1),
  senderName: z.string().min(1),
  senderEmail: z.string().email(),
  offerAmount: z.coerce.number().int().positive().optional(),
  message: z.string().min(10),
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

app.post('/api/domains/:domainId/buyer-discovery', async (c) => {
  try {
    const result = await discoverAndStoreBuyerLeads({
      binding: c.env.DB,
      domainId: c.req.param('domainId'),
      ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: c.env.ANTHROPIC_MODEL,
      BRAVE_SEARCH_API_KEY: c.env.BRAVE_SEARCH_API_KEY,
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

// --- Inquiries ---

app.get('/api/inquiries', async (c) => {
  const items = await listInboundInquiries(c.env.DB)
  return c.json({ items })
})

app.post('/api/inquiries', zValidator('json', inquiryInputSchema), async (c) => {
  try {
    const saved = await saveInboundInquiry(c.env.DB, c.req.valid('json'))

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
    const result = await createDealFromInquiry(c.env.DB, {
      inquiryId: c.req.param('inquiryId'),
      ...c.req.valid('json'),
    })
    return c.json({ ok: true, ...result }, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not create deal.' }, 400)
  }
})

app.post('/api/deals/:dealId/progress', zValidator('json', progressDealSchema), async (c) => {
  try {
    const decision = await progressDeal(c.env.DB, {
      dealId: c.req.param('dealId'),
      ...c.req.valid('json'),
    })
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

export default app
