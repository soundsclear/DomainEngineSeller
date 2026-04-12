import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseDomainCsvRows, type DomainCsvRow } from '../src/lib/csv-import'
import { determineClosingNextStep } from '../src/lib/closing-rules'
import { demoLeads } from '../src/lib/demo-data'
import { generatePriceRecommendation } from '../src/lib/pricing-engine'
import { buildLeadOutreachDraft } from '../src/server/outreach'
import { buildBuyerDiscoveryOutreachDraft } from '../src/server/buyer-outreach'
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
import { countInboundInquiries, listInboundInquiries, saveInboundInquiry, getInquiryWithThread, updateInquiryStatus, updateInquiryClassification, saveReplyDraft, saveNegotiationDraft, type NegotiationDraftPayload } from '../src/server/db/inquiry-repository'
import { classifyInquiry, draftReply, negotiateCounter, type InquiryClassification } from '../src/server/ai/inquiry-intelligence'
import { createAnthropicClientFromEnv } from '../src/server/ai/anthropic'
import { createDealFromInquiry, getDeal, listDeals, progressDeal } from '../src/server/db/deal-repository'
import { buildStripeInvoicePayload } from '../src/server/stripe-invoice'
import { getDashboardMetrics as getRealDashboardMetrics } from '../src/server/db/metrics-repository'
import { listTransferTasks } from '../src/server/db/transfer-task-repository'
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
import { getLeadById, listLeadsForDomain } from '../src/server/db/lead-repository'
import { discoverAndStoreBuyerLeads } from '../src/server/ai/buyer-discovery'
import { generateAndStoreDomainSeoContent } from '../src/server/ai/seo-generation'
import { sendInquiryNotification, sendOutreachEmail, sendTestEmail } from '../src/server/email'

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

async function sendApprovedOutreachWorkflow(
  binding: D1Database,
  env: Bindings,
  threadId: string,
) {
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

  if (!workflow.lead.contactEmail) {
    throw new Error('Outreach workflow is missing a contact email.')
  }

  const emailConfig = requireOutreachEmailConfig(env)
  await sendOutreachEmail({
    ...emailConfig,
    to: workflow.lead.contactEmail,
    subject: workflow.message.subject || `${workflow.domain.domainName} outreach`,
    body: workflow.message.body,
  })

  const updated = await markOutreachWorkflowSent(binding, threadId)
  return updated
}

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
  closingMethod: z.enum(['escrow_com', 'sedo_transfer', 'afternic_network', 'stripe_invoice_manual_transfer']),
})

const progressDealSchema = z.object({
  paymentSecured: z.boolean(),
  buyerUsesXel: z.boolean(),
  buyerApprovalState: z.enum(['pending', 'approved', 'disputed']),
  explicitInvoiceTransferApproval: z.boolean().optional(),
  buyerXelAccount: z.string().optional(),
  buyerRegistrar: z.string().optional(),
})

const outreachBatchSendSchema = z.object({
  threadIds: z.array(z.string().min(1)).optional().default([]),
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
      const response = buildBuyerDiscoveryOutreachDraft({
        lead,
        domain,
        sender: c.req.valid('json').sender,
        tone: c.req.valid('json').tone,
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
      const built = buildBuyerDiscoveryOutreachDraft({
        lead,
        domain,
        sender: c.req.valid('json').sender,
        tone: c.req.valid('json').tone,
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
      return c.json({ ok: true, item: record }, 201)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not save outreach workflow.' }, 400)
    }
  },
)

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

// --- Leads (demo data retained until Phase 1 lead management is built) ---

app.get('/api/leads', (c) =>
  c.json({
    items: demoLeads,
    meta: {
      total: demoLeads.length,
      doNotContact: demoLeads.filter((lead) => lead.doNotContact).length,
    },
  }),
)

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
    const decision = await progressDeal(c.env.DB, {
      dealId: c.req.param('dealId'),
      ...c.req.valid('json'),
    })
    return c.json({ ok: true, decision })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not progress deal.' }, 400)
  }
})

app.post(
  '/api/deals/next-step',
  zValidator(
    'json',
    z.object({
      closingMethod: z.enum(['escrow_com', 'sedo_transfer', 'afternic_network', 'stripe_invoice_manual_transfer']),
      paymentSecured: z.boolean(),
      buyerUsesXel: z.boolean(),
      buyerApprovalState: z.enum(['pending', 'approved', 'disputed']),
      explicitInvoiceTransferApproval: z.boolean().optional(),
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

export default app
