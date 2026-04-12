import { desc, eq } from 'drizzle-orm'
import { determineClosingNextStep } from '../../lib/closing-rules'
import type { ClosingMethod, DealStatus } from '../../types/domain'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { dealEvents, deals, domains, inboundInquiries, leads, outreachThreads } from './schema'
import { generateTransferTaskForDeal } from './transfer-task-repository'

export interface DealRecordView {
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

export interface CreateDealFromInquiryInput {
  inquiryId: string
  closingMethod: ClosingMethod
}

export interface ProgressDealInput {
  dealId: string
  paymentSecured: boolean
  buyerUsesXel: boolean
  buyerApprovalState: 'pending' | 'approved' | 'disputed'
  explicitInvoiceTransferApproval?: boolean
  buyerXelAccount?: string
  buyerRegistrar?: string
}

export async function listDeals(binding: D1Database): Promise<DealRecordView[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  return db
    .select({
      id: deals.id,
      domainId: deals.domainId,
      leadId: deals.leadId,
      domainName: domains.domainName,
      companyName: leads.companyName,
      closingMethod: deals.closingMethod,
      status: deals.status,
      agreedPrice: deals.agreedPrice,
      paymentSecured: deals.paymentSecured,
      buyerApprovalState: deals.buyerApprovalState,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .leftJoin(domains, eq(deals.domainId, domains.id))
    .leftJoin(leads, eq(deals.leadId, leads.id))
    .orderBy(desc(deals.updatedAt)) as Promise<DealRecordView[]>
}

export async function createDealFromInquiry(binding: D1Database, input: CreateDealFromInquiryInput) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const [inquiry] = await db
    .select()
    .from(inboundInquiries)
    .where(eq(inboundInquiries.id, input.inquiryId))
    .limit(1)

  if (!inquiry || !inquiry.domainId || !inquiry.threadId) {
    throw new Error('Inquiry not found or missing workflow context.')
  }

  const [thread] = await db
    .select({ leadId: outreachThreads.leadId })
    .from(outreachThreads)
    .where(eq(outreachThreads.id, inquiry.threadId))
    .limit(1)

  const now = Date.now()
  const leadId = thread?.leadId ?? null

  const existingDeals = await db
    .select({
      id: deals.id,
      status: deals.status,
    })
    .from(deals)
    .where(eq(deals.domainId, inquiry.domainId))
    .orderBy(desc(deals.updatedAt))

  const reusableDeal = existingDeals.find((deal) =>
    deal.status !== 'completed' && deal.status !== 'failed' && deal.status !== 'cancelled',
  )

  if (reusableDeal) {
    return { dealId: reusableDeal.id, created: false as const }
  }

  const dealId = `deal-${crypto.randomUUID()}`

  await db.insert(deals).values({
    id: dealId,
    domainId: inquiry.domainId,
    leadId,
    closingMethod: input.closingMethod,
    status: 'offer_accepted',
    agreedPrice: inquiry.offerAmount ?? null,
    paymentSecured: false,
    buyerApprovalState: 'pending',
    createdAt: now,
    updatedAt: now,
  })

  await db
    .update(domains)
    .set({
      status: 'negotiation',
      updatedAt: now,
    })
    .where(eq(domains.id, inquiry.domainId))

  await db.insert(dealEvents).values({
    id: `deal-event-${crypto.randomUUID()}`,
    dealId,
    eventType: 'deal_created_from_inquiry',
    notes: `Created from inquiry ${input.inquiryId}.`,
    createdAt: now,
  })

  return { dealId, created: true as const }
}

export async function progressDeal(binding: D1Database, input: ProgressDealInput) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const [deal] = await db
    .select()
    .from(deals)
    .where(eq(deals.id, input.dealId))
    .limit(1)

  if (!deal) {
    throw new Error('Deal not found.')
  }

  const decision = determineClosingNextStep({
    closingMethod: deal.closingMethod as ClosingMethod,
    paymentSecured: input.paymentSecured,
    buyerUsesXel: input.buyerUsesXel,
    buyerApprovalState: input.buyerApprovalState,
    explicitInvoiceTransferApproval: input.explicitInvoiceTransferApproval,
  })

  const now = Date.now()

  await db
    .update(deals)
    .set({
      status: decision.nextStatus,
      paymentSecured: input.paymentSecured,
      buyerApprovalState: input.buyerApprovalState,
      updatedAt: now,
    })
    .where(eq(deals.id, input.dealId))

  await db.insert(dealEvents).values({
    id: `deal-event-${crypto.randomUUID()}`,
    dealId: input.dealId,
    eventType: 'deal_progressed',
    notes: decision.reason,
    createdAt: now,
  })

  let transferTask = null

  if (decision.nextStatus === 'seller_transfer_required' && decision.registrarAction) {
    transferTask = await generateTransferTaskForDeal(binding, {
      dealId: input.dealId,
      actionType: decision.registrarAction,
      buyerXelAccount: input.buyerXelAccount,
      buyerRegistrar: input.buyerRegistrar,
    })
  }

  return {
    decision,
    transferTask,
  }
}
