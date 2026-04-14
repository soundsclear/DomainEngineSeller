import { desc, eq, inArray } from 'drizzle-orm'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { leadContactPoints, leadEnrichmentRuns, leads } from './schema'

export interface LeadContactPointRecord {
  id: string
  leadId: string
  runId: string | null
  type: string
  value: string
  label: string | null
  sourceUrl: string | null
  confidence: number
  createdAt: number
}

export interface LeadEnrichmentRunRecord {
  id: string
  leadId: string
  provider: string
  actorId: string
  status: 'pending' | 'completed' | 'failed'
  sourceWebsite: string | null
  rawPayloadJson: string | null
  errorMessage: string | null
  startedAt: number
  finishedAt: number | null
  createdAt: number
}

export interface LeadEnrichmentSummaryRecord {
  leadId: string
  latestRun: LeadEnrichmentRunRecord | null
  contacts: LeadContactPointRecord[]
}

function mapRun(row: typeof leadEnrichmentRuns.$inferSelect): LeadEnrichmentRunRecord {
  return {
    id: row.id,
    leadId: row.leadId,
    provider: row.provider,
    actorId: row.actorId,
    status: row.status as LeadEnrichmentRunRecord['status'],
    sourceWebsite: row.sourceWebsite ?? null,
    rawPayloadJson: row.rawPayloadJson ?? null,
    errorMessage: row.errorMessage ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
  }
}

function mapContact(row: typeof leadContactPoints.$inferSelect): LeadContactPointRecord {
  return {
    id: row.id,
    leadId: row.leadId,
    runId: row.runId ?? null,
    type: row.type,
    value: row.value,
    label: row.label ?? null,
    sourceUrl: row.sourceUrl ?? null,
    confidence: row.confidence,
    createdAt: row.createdAt,
  }
}

export async function createLeadEnrichmentRun(
  binding: D1Database,
  input: {
    leadId: string
    provider: string
    actorId: string
    sourceWebsite?: string | null
  },
) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const now = Date.now()
  const record: LeadEnrichmentRunRecord = {
    id: `lead-enrichment-${crypto.randomUUID()}`,
    leadId: input.leadId,
    provider: input.provider,
    actorId: input.actorId,
    status: 'pending',
    sourceWebsite: input.sourceWebsite ?? null,
    rawPayloadJson: null,
    errorMessage: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
  }

  await db.insert(leadEnrichmentRuns).values(record)
  return record
}

export async function completeLeadEnrichmentRun(
  binding: D1Database,
  input: {
    runId: string
    contacts: Array<{
      type: string
      value: string
      label?: string | null
      sourceUrl?: string | null
      confidence: number
    }>
    rawPayloadJson?: string | null
  },
) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const now = Date.now()

  const [run] = await db
    .select()
    .from(leadEnrichmentRuns)
    .where(eq(leadEnrichmentRuns.id, input.runId))
    .limit(1)

  if (!run) {
    throw new Error('Lead enrichment run not found.')
  }

  await db
    .update(leadEnrichmentRuns)
    .set({
      status: 'completed',
      rawPayloadJson: input.rawPayloadJson ?? null,
      finishedAt: now,
    })
    .where(eq(leadEnrichmentRuns.id, input.runId))

  for (const contact of input.contacts) {
    await db.insert(leadContactPoints).values({
      id: `lead-contact-${crypto.randomUUID()}`,
      leadId: run.leadId,
      runId: run.id,
      type: contact.type,
      value: contact.value,
      label: contact.label ?? null,
      sourceUrl: contact.sourceUrl ?? null,
      confidence: contact.confidence,
      createdAt: now,
    })
  }

  return getLeadEnrichmentSummary(binding, run.leadId)
}

export async function failLeadEnrichmentRun(
  binding: D1Database,
  input: { runId: string; errorMessage: string },
) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const now = Date.now()

  await db
    .update(leadEnrichmentRuns)
    .set({
      status: 'failed',
      errorMessage: input.errorMessage,
      finishedAt: now,
    })
    .where(eq(leadEnrichmentRuns.id, input.runId))
}

export async function getLeadEnrichmentSummary(binding: D1Database, leadId: string) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [latestRun] = await db
    .select()
    .from(leadEnrichmentRuns)
    .where(eq(leadEnrichmentRuns.leadId, leadId))
    .orderBy(desc(leadEnrichmentRuns.createdAt))
    .limit(1)

  const contacts = await db
    .select()
    .from(leadContactPoints)
    .where(eq(leadContactPoints.leadId, leadId))
    .orderBy(desc(leadContactPoints.confidence), desc(leadContactPoints.createdAt))

  return {
    leadId,
    latestRun: latestRun ? mapRun(latestRun) : null,
    contacts: contacts.map(mapContact),
  } satisfies LeadEnrichmentSummaryRecord
}

export async function listLeadEnrichmentSummariesForDomain(
  binding: D1Database,
  domainId: string,
) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const domainLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.domainId, domainId))

  if (domainLeads.length === 0) {
    return []
  }

  return Promise.all(domainLeads.map((lead) => getLeadEnrichmentSummary(binding, lead.id)))
}

export async function listLeadContactPointsForLeads(
  binding: D1Database,
  leadIds: string[],
) {
  await ensureOutreachSchema(binding)
  if (leadIds.length === 0) {
    return []
  }

  const db = getDb(binding)
  const rows = await db
    .select()
    .from(leadContactPoints)
    .where(inArray(leadContactPoints.leadId, leadIds))
    .orderBy(desc(leadContactPoints.confidence), desc(leadContactPoints.createdAt))

  return rows.map(mapContact)
}
