import { beforeEach, describe, expect, it, vi } from 'vitest'

const getInquiryWithThread = vi.fn()
const getDomain = vi.fn()
const createDealFromInquiry = vi.fn()
const saveNegotiationDraft = vi.fn()
const getLeadById = vi.fn()
const countOutreachWorkflowsForLead = vi.fn()
const approveOutreachWorkflow = vi.fn()
const getOutreachWorkflowByThreadId = vi.fn()
const listSendableApprovedOutreachWorkflows = vi.fn()
const markOutreachWorkflowSent = vi.fn()
const saveOutreachWorkflow = vi.fn()
const listLeadsForDomain = vi.fn()
const listDeals = vi.fn()
const listTransferTasks = vi.fn()
const listInboundInquiries = vi.fn()
const countInboundInquiries = vi.fn()
const updateInquiryStatus = vi.fn()
const updateInquiryClassification = vi.fn()
const saveReplyDraft = vi.fn()
const saveInboundInquiry = vi.fn()
const listDomains = vi.fn()
const listPublicDomains = vi.fn()
const getPublicDomain = vi.fn()
const getDomainPageContent = vi.fn()
const upsertDomainPageContent = vi.fn()
const listOutreachWorkflows = vi.fn()
const classifyInquiry = vi.fn()
const draftReply = vi.fn()
const negotiateCounter = vi.fn()
const progressDeal = vi.fn()
const buildBuyerDiscoveryOutreachDraft = vi.fn()
const sendOutreachEmail = vi.fn()

vi.mock('../src/server/db/inquiry-repository', () => ({
  getInquiryWithThread,
  listInboundInquiries,
  countInboundInquiries,
  saveInboundInquiry,
  updateInquiryStatus,
  updateInquiryClassification,
  saveReplyDraft,
  saveNegotiationDraft,
}))

vi.mock('../src/server/db/domain-repository', () => ({
  listDomains,
  getDomain,
  createDomain: vi.fn(),
  updateDomain: vi.fn(),
  deleteDomain: vi.fn(),
  importDomains: vi.fn(),
  getDashboardMetrics: vi.fn().mockResolvedValue({
    domains: 0,
    inboundInquiries: 0,
    dealsInProgress: 0,
    migrationCandidates: 0,
    pipelineValue: 0,
  }),
}))

vi.mock('../src/server/db/deal-repository', () => ({
  createDealFromInquiry,
  listDeals,
  progressDeal,
}))

vi.mock('../src/server/db/transfer-task-repository', () => ({
  listTransferTasks,
}))

vi.mock('../src/server/db/lead-repository', () => ({
  listLeadsForDomain,
  getLeadById,
}))

vi.mock('../src/server/db/public-domain-repository', () => ({
  listPublicDomains,
  getPublicDomain,
  getDomainPageContent,
  upsertDomainPageContent,
}))

vi.mock('../src/server/db/outreach-repository', () => ({
  listOutreachWorkflows,
  saveOutreachWorkflow,
  countOutreachWorkflowsForLead,
  approveOutreachWorkflow,
  getOutreachWorkflowByThreadId,
  listSendableApprovedOutreachWorkflows,
  markOutreachWorkflowSent,
}))

vi.mock('../src/server/ai/inquiry-intelligence', () => ({
  classifyInquiry,
  draftReply,
  negotiateCounter,
}))

vi.mock('../src/server/ai/anthropic', () => ({
  createAnthropicClientFromEnv: vi.fn(() => ({ mocked: true })),
}))

vi.mock('../src/server/buyer-outreach', () => ({
  buildBuyerDiscoveryOutreachDraft,
}))

vi.mock('../src/server/outreach', () => ({
  buildLeadOutreachDraft: vi.fn(),
}))

vi.mock('../src/server/outreach-workflow', () => ({
  createLeadOutreachWorkflow: vi.fn(),
}))

vi.mock('../src/server/ai/buyer-discovery', () => ({
  discoverAndStoreBuyerLeads: vi.fn(),
}))

vi.mock('../src/server/ai/seo-generation', () => ({
  generateAndStoreDomainSeoContent: vi.fn(),
}))

vi.mock('../src/server/email', () => ({
  sendInquiryNotification: vi.fn(),
  sendTestEmail: vi.fn(),
  sendOutreachEmail,
}))

const { default: app } = await import('./index')

describe('worker routes', () => {
  const env = {
    DB: {} as D1Database,
    OUTREACH_AUTO_SEND_ENABLED: 'false',
    RESEND_API_KEY: 'resend-test-key',
    ADMIN_NOTIFY_EMAIL: 'admin@example.com',
    EMAIL_FROM_ADDRESS: 'seller@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/inquiries/:id/negotiate', () => {
    it('creates a deal and stores a negotiation draft for a serious offer', async () => {
      getInquiryWithThread.mockResolvedValue({
        inquiry: {
          id: 'inq-1',
          domainId: 'domain-1',
          threadId: 'thread-1',
          inquiryType: 'offer',
          senderName: 'Alice',
          senderEmail: 'alice@example.com',
          message: 'I can offer 4000.',
          offerAmount: 4000,
          status: 'read',
          classification: 'serious_offer',
          classificationReason: 'Strong offer.',
          createdAt: Date.now(),
          domainName: 'greenbatteryhub.com',
        },
        messages: [],
      })
      getDomain.mockResolvedValue({
        id: 'domain-1',
        domainName: 'greenbatteryhub.com',
        tld: '.com',
        language: 'EN',
        category: 'Energy',
        status: 'listed',
        sellMode: 'portfolio_redirect',
        currentRegistrar: 'xel',
        acquisitionCost: 0,
        annualRenewalCost: 0,
        notes: 'Strong brand',
        migrationCandidate: false,
        targetRegistrar: null,
        quickSalePrice: 2000,
        targetPrice: 5000,
        aspirationalPrice: 7000,
      })
      createDealFromInquiry.mockResolvedValue({ dealId: 'deal-1', created: true })
      negotiateCounter.mockResolvedValue({
        suggestedPrice: 5200,
        reasoning: 'Buyer is close enough to justify a measured counter.',
        draftSubject: 'Re: Offer',
        draftBody: 'Thanks, we can do 5200.',
      })
      saveNegotiationDraft.mockResolvedValue({
        id: 'msg-neg-1',
        payload: {
          suggestedPrice: 5200,
          reasoning: 'Buyer is close enough to justify a measured counter.',
          draftSubject: 'Re: Offer',
          draftBody: 'Thanks, we can do 5200.',
        },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/inquiries/inq-1/negotiate', { method: 'POST' }),
        env,
      )
      const body = (await response.json()) as { deal: { dealId: string; created: boolean } }

      expect(response.status).toBe(200)
      expect(createDealFromInquiry).toHaveBeenCalledWith(env.DB, {
        inquiryId: 'inq-1',
        closingMethod: 'escrow_com',
      })
      expect(saveNegotiationDraft).toHaveBeenCalledWith(
        env.DB,
        expect.objectContaining({
          threadId: 'thread-1',
          payload: expect.objectContaining({
            suggestedPrice: 5200,
            reasoning: expect.any(String),
            draftSubject: expect.any(String),
            draftBody: expect.any(String),
          }),
        }),
      )
      expect(body.deal).toEqual({ dealId: 'deal-1', created: true })
    })

    it('rejects negotiation for non-serious offers', async () => {
      getInquiryWithThread.mockResolvedValue({
        inquiry: {
          id: 'inq-2',
          domainId: 'domain-1',
          threadId: 'thread-2',
          inquiryType: 'contact',
          senderName: 'Bob',
          senderEmail: 'bob@example.com',
          message: 'What is the price?',
          offerAmount: null,
          status: 'read',
          classification: 'info_request',
          classificationReason: 'No offer.',
          createdAt: Date.now(),
          domainName: 'greenbatteryhub.com',
        },
        messages: [],
      })

      const response = await app.fetch(
        new Request('http://localhost/api/inquiries/inq-2/negotiate', { method: 'POST' }),
        env,
      )
      const body = (await response.json()) as { error: string }

      expect(response.status).toBe(400)
      expect(body.error).toContain('serious offers')
      expect(createDealFromInquiry).not.toHaveBeenCalled()
    })

    it('reuses an existing deal instead of creating a new one again', async () => {
      getInquiryWithThread.mockResolvedValue({
        inquiry: {
          id: 'inq-3',
          domainId: 'domain-1',
          threadId: 'thread-3',
          inquiryType: 'offer',
          senderName: 'Cara',
          senderEmail: 'cara@example.com',
          message: 'Following up on my offer.',
          offerAmount: 4500,
          status: 'read',
          classification: 'serious_offer',
          classificationReason: 'Valid counter-round.',
          createdAt: Date.now(),
          domainName: 'greenbatteryhub.com',
        },
        messages: [],
      })
      getDomain.mockResolvedValue({
        id: 'domain-1',
        domainName: 'greenbatteryhub.com',
        tld: '.com',
        language: 'EN',
        category: 'Energy',
        status: 'negotiation',
        sellMode: 'portfolio_redirect',
        currentRegistrar: 'xel',
        acquisitionCost: 0,
        annualRenewalCost: 0,
        notes: 'Strong brand',
        migrationCandidate: false,
        targetRegistrar: null,
        quickSalePrice: 2000,
        targetPrice: 5000,
        aspirationalPrice: 7000,
      })
      createDealFromInquiry.mockResolvedValue({ dealId: 'deal-existing', created: false })
      negotiateCounter.mockResolvedValue({
        suggestedPrice: 5100,
        reasoning: 'Continue from the prior thread.',
        draftSubject: 'Re: Offer',
        draftBody: 'We can move to 5100.',
      })
      saveNegotiationDraft.mockResolvedValue({
        id: 'msg-neg-2',
        payload: {
          suggestedPrice: 5100,
          reasoning: 'Continue from the prior thread.',
          draftSubject: 'Re: Offer',
          draftBody: 'We can move to 5100.',
        },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/inquiries/inq-3/negotiate', { method: 'POST' }),
        env,
      )
      const body = (await response.json()) as { deal: { dealId: string; created: boolean } }

      expect(response.status).toBe(200)
      expect(body.deal).toEqual({ dealId: 'deal-existing', created: false })
    })
  })

  describe('domain lead outreach routes', () => {
    it('creates a saved outreach workflow for a discovered lead', async () => {
      getLeadById.mockResolvedValue({
        id: 'lead-1',
        domainId: 'domain-1',
        companyName: 'Volt Storage',
        website: 'https://voltstorage.example',
        buyerFitReason: 'Commercial fit',
        priorityScore: 88,
        doNotContact: false,
        country: 'NL',
        source: 'buyer_discovery',
        createdAt: Date.now(),
      })
      getDomain.mockResolvedValue({
        id: 'domain-1',
        domainName: 'greenbatteryhub.com',
        tld: '.com',
        language: 'EN',
        category: 'Energy',
        status: 'listed',
        sellMode: 'portfolio_redirect',
        currentRegistrar: 'xel',
        acquisitionCost: 0,
        annualRenewalCost: 0,
        notes: '',
        migrationCandidate: false,
        targetRegistrar: null,
        quickSalePrice: 2000,
        targetPrice: 5000,
        aspirationalPrice: 7000,
      })
      countOutreachWorkflowsForLead.mockResolvedValue(0)
      buildBuyerDiscoveryOutreachDraft.mockReturnValue({
        lead: {
          id: 'lead-1',
          companyName: 'Volt Storage',
          website: 'https://voltstorage.example',
          buyerFitReason: 'Commercial fit',
          priorityScore: 88,
          doNotContact: false,
          country: 'NL',
          source: 'buyer_discovery',
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        result: {
          eligible: true,
          reason: 'Looks like a strong fit.',
          draft: {
            sequenceStep: 'initial',
            subject: 'greenbatteryhub.com - available',
            body: 'Body',
            tone: 'standard',
            language: 'EN',
            recommendedFollowUpDays: 5,
            wordCount: 42,
            personalizationTokensUsed: ['lead.companyName'],
          },
        },
        meta: { outreachCount: 0 },
      })
      saveOutreachWorkflow.mockImplementation(async (_db, workflow) => workflow)

      const response = await app.fetch(
        new Request('http://localhost/api/domains/domain-1/leads/lead-1/outreach-workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Jan Seller', email: 'jan@example.com' },
            tone: 'standard',
            outreachCount: 0,
            autoSendEnabled: false,
            dailyLimit: 10,
          }),
        }),
        env,
      )
      const body = (await response.json()) as { item: { message: { classification: string } } }

      expect(response.status).toBe(201)
      expect(saveOutreachWorkflow).toHaveBeenCalledOnce()
      expect(body.item.message.classification).toBe('draft')
    })

    it('returns an error when a discovered lead is not eligible for outreach', async () => {
      getLeadById.mockResolvedValue({
        id: 'lead-2',
        domainId: 'domain-1',
        companyName: 'Do Not Contact',
        website: null,
        buyerFitReason: null,
        priorityScore: 30,
        doNotContact: true,
        country: null,
        source: 'buyer_discovery',
        createdAt: Date.now(),
      })
      getDomain.mockResolvedValue({
        id: 'domain-1',
        domainName: 'greenbatteryhub.com',
        tld: '.com',
        language: 'EN',
        category: 'Energy',
        status: 'listed',
        sellMode: 'portfolio_redirect',
        currentRegistrar: 'xel',
        acquisitionCost: 0,
        annualRenewalCost: 0,
        notes: '',
        migrationCandidate: false,
        targetRegistrar: null,
        quickSalePrice: 2000,
        targetPrice: 5000,
        aspirationalPrice: 7000,
      })
      countOutreachWorkflowsForLead.mockResolvedValue(0)
      buildBuyerDiscoveryOutreachDraft.mockReturnValue({
        lead: {
          id: 'lead-2',
          companyName: 'Do Not Contact',
          website: null,
          buyerFitReason: null,
          priorityScore: 30,
          doNotContact: true,
          country: null,
          source: 'buyer_discovery',
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        result: {
          eligible: false,
          reason: 'Lead is marked do-not-contact.',
          draft: null,
        },
        meta: { outreachCount: 0 },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/domains/domain-1/leads/lead-2/outreach-workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Jan Seller', email: 'jan@example.com' },
            tone: 'standard',
            outreachCount: 0,
            autoSendEnabled: false,
            dailyLimit: 10,
          }),
        }),
        env,
      )
      const body = (await response.json()) as { error: string }

      expect(response.status).toBe(400)
      expect(body.error).toContain('do-not-contact')
    })
  })

  describe('guarded outreach sending routes', () => {
    it('approves an outreach workflow', async () => {
      approveOutreachWorkflow.mockResolvedValue({
        thread: {
          id: 'thread-approve-1',
          leadId: 'lead-1',
          domainId: 'domain-1',
          status: 'approved_to_send',
          autoSendEnabled: false,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: {
          id: 'msg-approve-1',
          threadId: 'thread-approve-1',
          direction: 'outbound',
          channel: 'email',
          subject: 'Subject',
          body: 'Body',
          classification: 'draft',
          createdAt: new Date().toISOString(),
          sentAt: null,
        },
        lead: {
          id: 'lead-1',
          companyName: 'Volt Storage',
          contactName: 'Volt Storage',
          contactEmail: 'buyer@example.com',
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        draft: {
          sequenceStep: 'initial',
          subject: 'Subject',
          body: 'Body',
          tone: 'standard',
          language: 'EN',
          recommendedFollowUpDays: 5,
          wordCount: 2,
          personalizationTokensUsed: [],
        },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/outreach/workflows/thread-approve-1/approve', {
          method: 'POST',
        }),
        env,
      )
      const body = (await response.json()) as { item: { thread: { status: string } } }

      expect(response.status).toBe(200)
      expect(approveOutreachWorkflow).toHaveBeenCalledWith(env.DB, 'thread-approve-1')
      expect(body.item.thread.status).toBe('approved_to_send')
    })

    it('sends a single approved outreach workflow when a contact email is present', async () => {
      const workflow = {
        thread: {
          id: 'thread-send-1',
          leadId: 'lead-1',
          domainId: 'domain-1',
          status: 'approved_to_send',
          autoSendEnabled: false,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: {
          id: 'msg-send-1',
          threadId: 'thread-send-1',
          direction: 'outbound',
          channel: 'email',
          subject: 'Subject',
          body: 'Draft body',
          classification: 'draft',
          createdAt: new Date().toISOString(),
          sentAt: null,
        },
        lead: {
          id: 'lead-1',
          companyName: 'Volt Storage',
          contactName: 'Buyer',
          contactEmail: 'buyer@example.com',
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        draft: {
          sequenceStep: 'initial',
          subject: 'Subject',
          body: 'Draft body',
          tone: 'standard',
          language: 'EN',
          recommendedFollowUpDays: 5,
          wordCount: 2,
          personalizationTokensUsed: [],
        },
      }

      getOutreachWorkflowByThreadId.mockResolvedValue(workflow)
      sendOutreachEmail.mockResolvedValue(undefined)
      markOutreachWorkflowSent.mockResolvedValue({
        ...workflow,
        thread: { ...workflow.thread, status: 'sent' },
        message: { ...workflow.message, sentAt: new Date().toISOString() },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/outreach/workflows/thread-send-1/send-now', {
          method: 'POST',
        }),
        env,
      )
      const body = (await response.json()) as { item: { thread: { status: string } } }

      expect(response.status).toBe(200)
      expect(sendOutreachEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM_ADDRESS,
          to: 'buyer@example.com',
          subject: 'Subject',
          body: 'Draft body',
        }),
      )
      expect(markOutreachWorkflowSent).toHaveBeenCalledWith(env.DB, 'thread-send-1')
      expect(body.item.thread.status).toBe('sent')
    })

    it('blocks send-now when a workflow has no contact email', async () => {
      getOutreachWorkflowByThreadId.mockResolvedValue({
        thread: {
          id: 'thread-send-2',
          leadId: 'lead-2',
          domainId: 'domain-1',
          status: 'approved_to_send',
          autoSendEnabled: false,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: {
          id: 'msg-send-2',
          threadId: 'thread-send-2',
          direction: 'outbound',
          channel: 'email',
          subject: 'Subject',
          body: 'Draft body',
          classification: 'draft',
          createdAt: new Date().toISOString(),
          sentAt: null,
        },
        lead: {
          id: 'lead-2',
          companyName: 'Missing Email Co',
          contactName: 'No Email',
          contactEmail: null,
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        draft: {
          sequenceStep: 'initial',
          subject: 'Subject',
          body: 'Draft body',
          tone: 'standard',
          language: 'EN',
          recommendedFollowUpDays: 5,
          wordCount: 2,
          personalizationTokensUsed: [],
        },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/outreach/workflows/thread-send-2/send-now', {
          method: 'POST',
        }),
        env,
      )
      const body = (await response.json()) as { error: string }

      expect(response.status).toBe(400)
      expect(body.error).toContain('contact email')
      expect(sendOutreachEmail).not.toHaveBeenCalled()
    })

    it('blocks send-now when a workflow is already sent', async () => {
      getOutreachWorkflowByThreadId.mockResolvedValue({
        thread: {
          id: 'thread-send-3',
          leadId: 'lead-3',
          domainId: 'domain-1',
          status: 'sent',
          autoSendEnabled: false,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: {
          id: 'msg-send-3',
          threadId: 'thread-send-3',
          direction: 'outbound',
          channel: 'email',
          subject: 'Subject',
          body: 'Draft body',
          classification: 'draft',
          createdAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
        },
        lead: {
          id: 'lead-3',
          companyName: 'Already Sent Co',
          contactName: 'Buyer',
          contactEmail: 'buyer@example.com',
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        draft: {
          sequenceStep: 'initial',
          subject: 'Subject',
          body: 'Draft body',
          tone: 'standard',
          language: 'EN',
          recommendedFollowUpDays: 5,
          wordCount: 2,
          personalizationTokensUsed: [],
        },
      })

      const response = await app.fetch(
        new Request('http://localhost/api/outreach/workflows/thread-send-3/send-now', {
          method: 'POST',
        }),
        env,
      )
      const body = (await response.json()) as { error: string }

      expect(response.status).toBe(409)
      expect(body.error).toContain('already been sent')
      expect(sendOutreachEmail).not.toHaveBeenCalled()
    })

    it('batch sends all approved workflows with contact email', async () => {
      const workflowOne = {
        thread: {
          id: 'thread-batch-1',
          leadId: 'lead-batch-1',
          domainId: 'domain-1',
          status: 'approved_to_send',
          autoSendEnabled: false,
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: {
          id: 'msg-batch-1',
          threadId: 'thread-batch-1',
          direction: 'outbound',
          channel: 'email',
          subject: 'Subject 1',
          body: 'Body 1',
          classification: 'draft',
          createdAt: new Date().toISOString(),
          sentAt: null,
        },
        lead: {
          id: 'lead-batch-1',
          companyName: 'Buyer One',
          contactName: 'Buyer',
          contactEmail: 'buyer1@example.com',
        },
        domain: {
          id: 'domain-1',
          domainName: 'greenbatteryhub.com',
        },
        draft: {
          sequenceStep: 'initial',
          subject: 'Subject 1',
          body: 'Body 1',
          tone: 'standard',
          language: 'EN',
          recommendedFollowUpDays: 5,
          wordCount: 2,
          personalizationTokensUsed: [],
        },
      }
      const workflowTwo = {
        ...workflowOne,
        thread: {
          ...workflowOne.thread,
          id: 'thread-batch-2',
          leadId: 'lead-batch-2',
        },
        message: {
          ...workflowOne.message,
          id: 'msg-batch-2',
          threadId: 'thread-batch-2',
          subject: 'Subject 2',
          body: 'Body 2',
        },
        lead: {
          id: 'lead-batch-2',
          companyName: 'Buyer Two',
          contactName: 'Buyer',
          contactEmail: 'buyer2@example.com',
        },
      }

      listSendableApprovedOutreachWorkflows.mockResolvedValue([workflowOne, workflowTwo])
      getOutreachWorkflowByThreadId.mockImplementation(async (_db: D1Database, threadId: string) =>
        threadId === 'thread-batch-1' ? workflowOne : workflowTwo,
      )
      sendOutreachEmail.mockResolvedValue(undefined)
      markOutreachWorkflowSent.mockImplementation(async (_db: D1Database, threadId: string) =>
        threadId === 'thread-batch-1'
          ? {
              ...workflowOne,
              thread: { ...workflowOne.thread, status: 'sent' },
              message: { ...workflowOne.message, sentAt: new Date().toISOString() },
            }
          : {
              ...workflowTwo,
              thread: { ...workflowTwo.thread, status: 'sent' },
              message: { ...workflowTwo.message, sentAt: new Date().toISOString() },
            },
      )

      const response = await app.fetch(
        new Request('http://localhost/api/outreach/workflows/send-approved', {
          method: 'POST',
        }),
        env,
      )
      const body = (await response.json()) as { summary: { sent: number; failed: number }; items: unknown[] }

      expect(response.status).toBe(200)
      expect(body.summary.sent).toBe(2)
      expect(body.summary.failed).toBe(0)
      expect(sendOutreachEmail).toHaveBeenCalledTimes(2)
      expect(markOutreachWorkflowSent).toHaveBeenCalledTimes(2)
      expect(listSendableApprovedOutreachWorkflows).toHaveBeenCalledWith(env.DB)
    })
  })
})
