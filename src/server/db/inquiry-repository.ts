import { and, asc, count, desc, eq } from 'drizzle-orm'
import { demoDomains } from '../../lib/demo-data'
import { getDb } from './client'
import { ensureInquiryIntelligenceColumns, ensureOutreachSchema } from './ensure-outreach-schema'
import { contacts, domains, followupTasks, inboundInquiries, leads, messages, outreachThreads } from './schema'

const SUPPRESSION_PATTERNS = [
  'do not contact',
  'do-not-contact',
  'unsubscribe',
  'stop emailing',
  'remove me',
  'geen contact',
  'niet meer mailen',
  'uitschrijven',
]

function shouldSuppressContact(message: string) {
  const normalized = message.toLowerCase()
  return SUPPRESSION_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export interface SaveInboundInquiryInput {
  domainId: string
  senderName: string
  senderEmail: string
  message: string
  offerAmount?: number
}

export interface SavedInboundInquiry {
  inquiry: {
    id: string
    domainId: string
    threadId: string
    leadId: string
    inquiryType: 'offer' | 'contact'
    senderName: string
    senderEmail: string
    message: string
    offerAmount: number | null
    createdAt: string
  }
  lead: {
    id: string
    companyName: string
    contactName: string
  }
  thread: {
    id: string
    status: 'inbound_received'
  }
  followupTask: {
    id: string
    dueAt: string
    status: 'pending'
  }
  domainName: string
}

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

export interface NegotiationDraftPayload {
  suggestedPrice: number
  reasoning: string
  draftSubject: string
  draftBody: string
}

function addDaysIso(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

async function ensureDemoDomain(binding: D1Database, domainId: string) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const domain = demoDomains.find((item) => item.id === domainId)

  if (!domain) {
    throw new Error('Domain not found.')
  }

  const now = Date.now()

  await db
    .insert(domains)
    .values({
      id: domain.id,
      domainName: domain.domainName,
      tld: domain.tld,
      language: domain.language,
      notes: domain.notes,
      category: domain.category,
      status: domain.status,
      sellMode: domain.sellMode,
      currentRegistrar: domain.currentRegistrar,
      currentRegistrarReference: null,
      acquisitionCost: domain.acquisitionCost,
      annualRenewalCost: domain.annualRenewalCost,
      trafficNotes: null,
      whoisOwnerState: null,
      nameserverState: null,
      authCodeStatus: null,
      migrationCandidate: domain.migrationCandidate,
      targetRegistrar: domain.targetRegistrar ?? null,
      transferEligibility: null,
      migrationPriority: null,
      migrationNotes: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()

  return domain
}

export async function saveInboundInquiry(binding: D1Database, input: SaveInboundInquiryInput): Promise<SavedInboundInquiry> {
  const domain = await ensureDemoDomain(binding, input.domainId)
  const db = getDb(binding)
  const now = Date.now()
  const createdAt = new Date(now).toISOString()

  const [existingContact] = await db
    .select({
      leadId: contacts.leadId,
      contactName: contacts.contactName,
      companyName: leads.companyName,
    })
    .from(contacts)
    .innerJoin(leads, eq(contacts.leadId, leads.id))
    .where(and(eq(contacts.contactEmail, input.senderEmail), eq(leads.domainId, input.domainId)))
    .limit(1)

  const leadId = existingContact?.leadId ?? `lead-inbound-${crypto.randomUUID()}`
  const contactName = input.senderName.trim()
  const companyName = existingContact?.companyName ?? input.senderName.trim()
  const doNotContact = shouldSuppressContact(input.message)

  if (!existingContact) {
    await db.insert(leads).values({
      id: leadId,
      domainId: input.domainId,
      companyName,
      website: null,
      buyerFitReason: 'Inbound inquiry from public domain page.',
      priorityScore: input.offerAmount ? 75 : 55,
      doNotContact,
      country: null,
      source: 'inbound-inquiry',
      createdAt: now,
    })

    await db.insert(contacts).values({
      id: `contact-${crypto.randomUUID()}`,
      leadId,
      contactName,
      contactRole: null,
      contactEmail: input.senderEmail,
      contactPageUrl: null,
      createdAt: now,
    })
  } else if (doNotContact) {
    await db.update(leads).set({ doNotContact: true }).where(eq(leads.id, leadId))
  }

  const threadId = `thread-inbound-${crypto.randomUUID()}`
  const messageId = `msg-inbound-${crypto.randomUUID()}`
  const inquiryId = `inq-${crypto.randomUUID()}`
  const followupTaskId = `followup-inbound-${crypto.randomUUID()}`
  const dueAtIso = addDaysIso(2)

  await db.insert(outreachThreads).values({
    id: threadId,
    leadId,
    domainId: input.domainId,
    status: 'inbound_received',
    autoSendEnabled: false,
    lastMessageAt: now,
    createdAt: now,
  })

  await db.insert(messages).values({
    id: messageId,
    threadId,
    direction: 'inbound',
    channel: 'email',
    subject: input.offerAmount ? `Inbound offer for ${domain.domainName}` : `Inbound inquiry for ${domain.domainName}`,
    body: input.message,
    classification: 'inbound_inquiry',
    sentAt: now,
    createdAt: now,
  })

  await db.insert(inboundInquiries).values({
    id: inquiryId,
    domainId: input.domainId,
    threadId,
    inquiryType: input.offerAmount ? 'offer' : 'contact',
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    message: input.message,
    offerAmount: input.offerAmount ?? null,
    createdAt: now,
  })

  await db.insert(followupTasks).values({
    id: followupTaskId,
    threadId,
    dueAt: Date.parse(dueAtIso),
    status: 'pending',
    createdAt: now,
  })

  return {
    inquiry: {
      id: inquiryId,
      domainId: input.domainId,
      threadId,
      leadId,
      inquiryType: input.offerAmount ? 'offer' : 'contact',
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      message: input.message,
      offerAmount: input.offerAmount ?? null,
      createdAt,
    },
    lead: {
      id: leadId,
      companyName,
      contactName,
    },
    thread: {
      id: threadId,
      status: 'inbound_received',
    },
    followupTask: {
      id: followupTaskId,
      dueAt: dueAtIso,
      status: 'pending',
    },
    domainName: domain.domainName,
  }
}

export async function countInboundInquiries(binding: D1Database) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [result] = await db.select({ value: count() }).from(inboundInquiries)
  return result?.value ?? 0
}

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

export async function markMessageSent(binding: D1Database, messageId: string): Promise<void> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  await db.update(messages).set({ sentAt: Date.now() }).where(eq(messages.id, messageId))
}

export async function saveNegotiationDraft(
  binding: D1Database,
  input: { threadId: string; payload: NegotiationDraftPayload },
): Promise<{ id: string; payload: NegotiationDraftPayload }> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const id = `msg-negotiation-${crypto.randomUUID()}`
  const now = Date.now()

  await db.insert(messages).values({
    id,
    threadId: input.threadId,
    direction: 'outbound',
    channel: 'email',
    subject: input.payload.draftSubject,
    body: JSON.stringify(input.payload),
    classification: 'negotiation_draft',
    sentAt: null,
    createdAt: now,
  })

  return { id, payload: input.payload }
}
