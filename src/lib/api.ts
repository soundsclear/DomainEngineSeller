import type { DomainPageContentRecord } from '@/lib/domain-page-content'
import type {
  LeadRecord,
  DomainRecord,
  DomainStatus,
  PublicDomainRecord,
  PublicPortfolioDomainRecord,
  SellMode,
} from '@/types/domain'
import type { OutreachDraft, OutreachTone } from '@/lib/outreach-draft'
import type { ClosingMethod, DealStatus } from '@/types/domain'

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

export interface DashboardMetrics {
  domains: number
  inboundInquiries: number
  dealsInProgress: number
  migrationCandidates: number
  pipelineValue: number
  xelTransferCheckpoints: number
  repliesAwaitingAction: number
  followUpsDueThisWeek: number
  draftOutreachQueue: number
}

export interface PriceRecommendationSummary {
  quickSalePrice: number
  targetPrice: number
  aspirationalPrice: number
  confidenceScore: number
  rationale: string[]
}

export interface InquiryPayload {
  domainId: string
  senderName: string
  senderEmail: string
  offerAmount?: number
  message: string
}

export interface DomainPageContentPayload {
  seoTitle: string
  metaDescription: string
  heroHeadline: string
  heroSubheadline: string
  bodyContent: string
  contentStatus: 'draft' | 'generated' | 'manual'
  generatedAt?: number | null
}

export interface DomainSeoGenerationPayload {
  force?: boolean
}

export interface DomainLeadRecord {
  id: string
  domainId: string | null
  companyName: string
  website: string | null
  buyerFitReason: string | null
  priorityScore: number
  doNotContact: boolean
  country: string | null
  source: string | null
  createdAt: number
}

export interface OutreachDraftRequestPayload {
  sender: {
    name: string
    email: string
  }
  tone: OutreachTone
  outreachCount: number
  autoSendEnabled?: boolean
  dailyLimit?: number
}

export interface OutreachWorkflowRecord {
  thread: {
    id: string
    leadId: string
    domainId: string
    status: 'draft_prepared'
    autoSendEnabled: boolean
    lastMessageAt: string
    createdAt: string
  }
  message: {
    id: string
    threadId: string
    direction: 'outbound'
    channel: 'email'
    subject: string
    body: string
    classification: 'draft'
    createdAt: string
  }
  followupTask: {
    id: string
    threadId: string
    dueAt: string | null
    status: 'pending' | 'not_needed'
    createdAt: string
  }
  lead: {
    id: string
    companyName: string
    contactName: string
  }
  domain: {
    id: string
    domainName: string
  }
  draft: OutreachDraft
}

export interface InboundInquiryRecord {
  id: string
  inquiryType: string
  senderName: string | null
  senderEmail: string
  message: string
  offerAmount: number | null
  createdAt: number
  domainName: string | null
}

export interface DealViewRecord {
  id: string
  domainId: string
  leadId: string | null
  domainName: string | null
  companyName: string | null
  closingMethod: ClosingMethod
  status: DealStatus
  agreedPrice: number | null
  paymentSecured: boolean
  buyerApprovalState: 'pending' | 'approved' | 'disputed' | null
  createdAt: number
  updatedAt: number
}

export interface TransferTaskRecord {
  id: string
  dealId: string
  domainName: string | null
  companyName: string | null
  registrar: string
  actionType: string
  status: string
  deadlineAt: number | null
  manualCheckpointRequired: boolean
  createdAt: number
  checklistJson: string
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const data = (await response.json()) as T & { error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}`)
  }

  return data
}

export function fetchDashboard() {
  return fetchJson<{ metrics: DashboardMetrics }>('/api/dashboard')
}

export function fetchDomains() {
  return fetchJson<{ items: DomainRecord[]; meta: { currentRegistrar: string; migrationCandidates: number } }>('/api/domains')
}

export function fetchDomain(domainId: string) {
  return fetchJson<{ item: DomainRecord; recommendation: PriceRecommendationSummary }>(`/api/domains/${domainId}`)
}

export function fetchPublicPortfolio() {
  return fetchJson<{ items: PublicPortfolioDomainRecord[] }>('/api/public/portfolio')
}

export function fetchPublicDomain(domainId: string) {
  return fetchJson<PublicDomainRecord>(`/api/public/domains/${domainId}`)
}

export function fetchLeads() {
  return fetchJson<{ items: LeadRecord[]; meta: { total: number; doNotContact: number } }>('/api/leads')
}

export function submitInquiry(payload: InquiryPayload) {
  return fetchJson<{
    ok: true
    item: { id: string; createdAt: string; leadId: string; threadId: string }
    lead: { id: string; companyName: string; contactName: string }
    thread: { id: string; status: 'inbound_received' }
    followupTask: { id: string; dueAt: string; status: 'pending' }
    message: string
  }>('/api/inquiries', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function generateLeadOutreachDraft(leadId: string, payload: OutreachDraftRequestPayload) {
  return fetchJson<{
    lead: LeadRecord
    domain: DomainRecord
    result: {
      eligible: boolean
      reason: string
      draft: OutreachDraft | null
    }
  }>(`/api/leads/${leadId}/outreach-draft`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function saveLeadOutreachWorkflow(leadId: string, payload: OutreachDraftRequestPayload) {
  return fetchJson<{ ok: true; item: OutreachWorkflowRecord }>(`/api/leads/${leadId}/outreach-workflows`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchOutreachWorkflows() {
  return fetchJson<{ items: OutreachWorkflowRecord[] }>('/api/outreach/workflows')
}

export function fetchInboundInquiries() {
  return fetchJson<{ items: InboundInquiryRecord[] }>('/api/inquiries')
}

export function createDealFromInquiry(inquiryId: string, closingMethod: ClosingMethod) {
  return fetchJson<{ ok: true; dealId: string }>(`/api/inquiries/${inquiryId}/create-deal`, {
    method: 'POST',
    body: JSON.stringify({ closingMethod }),
  })
}

export function fetchDeals() {
  return fetchJson<{ items: DealViewRecord[] }>('/api/deals')
}

export function fetchTransferTasks() {
  return fetchJson<{ items: TransferTaskRecord[] }>('/api/transfer-tasks')
}

export function progressDeal(
  dealId: string,
  payload: {
    paymentSecured: boolean
    buyerUsesXel: boolean
    buyerApprovalState: 'pending' | 'approved' | 'disputed'
    explicitInvoiceTransferApproval?: boolean
    buyerXelAccount?: string
    buyerRegistrar?: string
  },
) {
  return fetchJson<{
    ok: true
    decision: {
      decision: {
        nextStatus: DealStatus
        registrarAction?: string
        manualCheckpointRequired: boolean
        reason: string
      }
      transferTask: TransferTaskRecord | null
    }
  }>(`/api/deals/${dealId}/progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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
  return fetchJson<{ ok: true }>(`/api/domains/${domainId}`, { method: 'DELETE' })
}

export function importDomainsApi(rows: Array<Record<string, string>>) {
  return fetchJson<{ ok: true; created: number; skipped: number; parseErrors: Array<{ row: number; error: string }> }>(
    '/api/domains/import',
    { method: 'POST', body: JSON.stringify({ rows }) },
  )
}

export function fetchDomainPageContent(domainId: string) {
  return fetchJson<{ item: DomainPageContentRecord | null }>(`/api/domains/${domainId}/page-content`)
}

export function updateDomainPageContentApi(domainId: string, payload: DomainPageContentPayload) {
  return fetchJson<{ ok: true; item: DomainPageContentRecord }>(`/api/domains/${domainId}/page-content`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function generateDomainPageContentApi(domainId: string, payload: DomainSeoGenerationPayload = {}) {
  return fetchJson<{
    ok: true
    item: DomainPageContentRecord
    meta: { provider: string; model: string }
  }>(`/api/domains/${domainId}/page-content/generate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchDomainLeads(domainId: string) {
  return fetchJson<{ items: DomainLeadRecord[] }>(`/api/domains/${domainId}/leads`)
}

export function triggerBuyerDiscoveryApi(domainId: string) {
  return fetchJson<{
    ok: true
    items: DomainLeadRecord[]
    meta: {
      queryCount: number
      resultGroups: number
      created: number
      skipped: number
      searchErrors: number
    }
  }>(`/api/domains/${domainId}/buyer-discovery`, {
    method: 'POST',
  })
}
