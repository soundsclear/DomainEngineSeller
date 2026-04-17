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
  cfTurnstileToken?: string
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
  contactName: string | null
  contactEmail: string | null
  createdAt: number
}

export interface DomainLeadOutreachDraftRecord {
  sequenceStep: 'initial' | 'follow_up_1' | 'follow_up_2'
  subject: string
  body: string
  tone: 'concise' | 'standard' | 'detailed'
  language: 'NL' | 'EN'
  recommendedFollowUpDays: number | null
  wordCount: number
  personalizationTokensUsed: string[]
}

export interface DomainLeadOutreachDraftResponse {
  lead: DomainLeadRecord
  domain: {
    id: string
    domainName: string
  }
  result: {
    eligible: boolean
    reason: string
    draft: DomainLeadOutreachDraftRecord | null
  }
  meta: {
    outreachCount: number
  }
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
    status: 'draft_prepared' | 'approved_to_send' | 'sent'
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
    sentAt?: string | null
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
    contactEmail?: string | null
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
  status: string
  classification: string | null
  classificationReason: string | null
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

export interface ProviderTransactionRecord {
  id: string
  dealId: string
  provider: string
  providerReference: string
  status: string
  amount: number | null
  createdAt: number
}

export interface CreateProviderTransactionPayload {
  provider: 'escrow_com' | 'sedo' | 'afternic' | 'other'
  providerReference: string
  status: string
  amount?: number
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const rawText = await response.text()
  const data = (
    rawText && contentType.includes('application/json')
      ? (JSON.parse(rawText) as T & { error?: string })
      : ({ error: rawText || undefined } as T & { error?: string })
  )

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

export interface CreateLeadPayload {
  companyName: string
  website?: string
  domainId?: string
  country?: string
}

export function createLeadApi(payload: CreateLeadPayload) {
  return fetchJson<{ ok: boolean; item: DomainLeadRecord }>('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function updateLeadDoNotContactApi(leadId: string, doNotContact: boolean) {
  return fetchJson<{ ok: boolean }>(`/api/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doNotContact }),
  })
}

export function deleteLeadApi(leadId: string) {
  return fetchJson<{ ok: boolean }>(`/api/leads/${leadId}`, {
    method: 'DELETE',
  })
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

export interface OutreachWorkflowMutationResponse {
  ok: true
  message?: string
  item?: OutreachWorkflowRecord
}

export interface OutreachWorkflowBatchMutationResponse {
  ok: true
  message?: string
  items?: OutreachWorkflowRecord[]
  sentCount?: number
  skippedCount?: number
  blockedCount?: number
}

export function approveOutreachWorkflow(threadId: string) {
  return fetchJson<OutreachWorkflowMutationResponse>(`/api/outreach/workflows/${threadId}/approve`, {
    method: 'POST',
  })
}

export function sendOutreachWorkflowNow(threadId: string) {
  return fetchJson<OutreachWorkflowMutationResponse>(`/api/outreach/workflows/${threadId}/send-now`, {
    method: 'POST',
  })
}

export function batchSendOutreachWorkflows(threadIds: string[]) {
  return fetchJson<OutreachWorkflowBatchMutationResponse>('/api/outreach/workflows/send-approved', {
    method: 'POST',
    body: JSON.stringify({ threadIds }),
  })
}

export function fetchInboundInquiries() {
  return fetchJson<{ items: InboundInquiryRecord[] }>('/api/inquiries')
}

export function createDealFromInquiry(inquiryId: string, closingMethod: ClosingMethod) {
  return fetchJson<{ ok: true; dealId: string; created: boolean }>(`/api/inquiries/${inquiryId}/create-deal`, {
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

export function updateDomainLeadContact(
  domainId: string,
  leadId: string,
  payload: { contactName: string; contactEmail: string },
) {
  return fetchJson<{ ok: true; item: DomainLeadRecord }>(
    `/api/domains/${domainId}/leads/${leadId}/contact`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

export function generateDomainLeadOutreachDraft(
  domainId: string,
  leadId: string,
  payload: OutreachDraftRequestPayload,
) {
  return fetchJson<DomainLeadOutreachDraftResponse>(
    `/api/domains/${domainId}/leads/${leadId}/outreach-draft`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function saveDomainLeadOutreachWorkflow(
  domainId: string,
  leadId: string,
  payload: OutreachDraftRequestPayload,
) {
  return fetchJson<{ ok: true; item: OutreachWorkflowRecord }>(
    `/api/domains/${domainId}/leads/${leadId}/outreach-workflow`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
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
      enriched: number
      enrichmentErrors: number
      contactsFound: number
    }
  }>(`/api/domains/${domainId}/buyer-discovery`, {
    method: 'POST',
  })
}

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

export interface NegotiationDraftRecord {
  suggestedPrice: number
  reasoning: string
  draftSubject: string
  draftBody: string
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

export async function sendInquiryReplyApi(
  inquiryId: string,
  messageId?: string,
): Promise<{ ok: boolean; messageId: string }> {
  return fetchJson<{ ok: boolean; messageId: string }>(
    `/api/inquiries/${inquiryId}/send-reply`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId }) },
  )
}

export async function negotiateInquiryCounterApi(
  inquiryId: string,
): Promise<{
  ok: boolean
  deal: { dealId: string; created: boolean }
  draft: { id: string; payload: NegotiationDraftRecord }
  negotiation: NegotiationDraftRecord
}> {
  return fetchJson<{
    ok: boolean
    deal: { dealId: string; created: boolean }
    draft: { id: string; payload: NegotiationDraftRecord }
    negotiation: NegotiationDraftRecord
  }>(`/api/inquiries/${inquiryId}/negotiate`, {
    method: 'POST',
  })
}

export interface GenerateStripeInvoicePayloadBody {
  buyerName: string
  buyerEmail: string
  currency?: 'EUR' | 'USD'
}

export interface StripeInvoicePayloadResponse {
  ok: true
  payload: {
    customer_email: string
    collection_method: 'send_invoice'
    days_until_due: 14
    line_items: Array<{
      price_data: {
        currency: string
        product_data: { name: string }
        unit_amount: number
      }
      quantity: 1
    }>
    metadata: {
      dealId: string
      domainName: string
      buyerName: string
    }
  }
}

export function generateStripeInvoicePayload(dealId: string, body: GenerateStripeInvoicePayloadBody) {
  return fetchJson<StripeInvoicePayloadResponse>(`/api/deals/${dealId}/invoice`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface RealDashboardMetrics {
  totalDomains: number
  listedDomains: number
  totalInquiries: number
  unreadInquiries: number
  activeDeals: number
  totalLeads: number
  sentOutreach: number
  pendingOutreach: number
}

function mapLegacyDashboardMetrics(metrics: DashboardMetrics): RealDashboardMetrics {
  return {
    totalDomains: metrics.domains,
    listedDomains: metrics.domains,
    totalInquiries: metrics.inboundInquiries,
    unreadInquiries: metrics.inboundInquiries,
    activeDeals: metrics.dealsInProgress,
    totalLeads: 0,
    sentOutreach: 0,
    pendingOutreach: metrics.draftOutreachQueue,
  }
}

export async function fetchDashboardMetrics() {
  try {
    return await fetchJson<{ metrics: RealDashboardMetrics }>('/api/metrics/dashboard')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('404')) {
      throw error
    }

    const legacy = await fetchDashboard()
    return {
      metrics: mapLegacyDashboardMetrics(legacy.metrics),
    }
  }
}

export interface SettingRecord {
  id: string
  key: string
  value: string
  updatedAt: number
}

export function fetchSettings() {
  return fetchJson<{ items: SettingRecord[] }>('/api/settings')
}

export function updateSetting(key: string, value: string) {
  return fetchJson<{ ok: true; item: SettingRecord }>(`/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export function fetchProviderTransactions(dealId: string) {
  return fetchJson<{ items: ProviderTransactionRecord[] }>(
    `/api/deals/${dealId}/provider-transactions`,
  )
}

export function createProviderTransactionApi(dealId: string, payload: CreateProviderTransactionPayload) {
  return fetchJson<{ ok: boolean; item: ProviderTransactionRecord }>(
    `/api/deals/${dealId}/provider-transactions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

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
  const data = await res.json() as { items: ExperimentRecord[] }
  return data.items
}

export async function createExperiment(name: string): Promise<ExperimentRecord> {
  const res = await fetch('/api/experiments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return res.json() as Promise<ExperimentRecord>
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
  return res.json() as Promise<{ variants: VariantResult[]; pricing: PricingRow[] }>
}
