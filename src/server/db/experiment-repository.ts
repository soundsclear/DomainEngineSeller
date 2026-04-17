import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import {
  experimentAssignments,
  experimentOutcomes,
  experiments,
  experimentVariants,
  deals,
  domains,
} from './schema'

export interface ExperimentRecord {
  id: string
  name: string
  status: string
  createdAt: number
}

export interface ExperimentVariantRecord {
  id: string
  experimentId: string
  label: string
  tone: string
  hasPrice: boolean
  subjectSlot: string
  followupDays1: number
  followupDays2: number
}

export interface ExperimentAssignmentRecord {
  id: string
  experimentId: string
  variantId: string
  leadId: string
  threadId: string | null
  assignedAt: number
}

export interface ExperimentOutcomeRecord {
  id: string
  assignmentId: string
  outcomeType: string
  value: number | null
  occurredAt: number
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

// Pure helper — used in tests
export function insertExperiment(input: { name: string; status: string }): ExperimentRecord {
  return { id: `exp-${crypto.randomUUID()}`, ...input, createdAt: Date.now() }
}

export async function saveExperiment(db: D1Database, input: { name: string }): Promise<ExperimentRecord> {
  const drizzle = getDb(db)
  const record: ExperimentRecord = {
    id: `exp-${crypto.randomUUID()}`,
    name: input.name,
    status: 'active',
    createdAt: Date.now(),
  }
  await drizzle.insert(experiments).values(record)
  return record
}

export async function listExperiments(db: D1Database): Promise<ExperimentRecord[]> {
  const drizzle = getDb(db)
  return drizzle.select().from(experiments).orderBy(desc(experiments.createdAt))
}

export async function getActiveExperiment(db: D1Database): Promise<ExperimentRecord | null> {
  const drizzle = getDb(db)
  const rows = await drizzle.select().from(experiments).where(eq(experiments.status, 'active')).limit(1)
  return rows[0] ?? null
}

export async function updateExperimentStatus(
  db: D1Database,
  id: string,
  status: 'active' | 'paused' | 'completed',
): Promise<void> {
  const drizzle = getDb(db)
  await drizzle.update(experiments).set({ status }).where(eq(experiments.id, id))
}

export async function saveExperimentVariant(
  db: D1Database,
  input: Omit<ExperimentVariantRecord, 'id'>,
): Promise<ExperimentVariantRecord> {
  const drizzle = getDb(db)
  const record: ExperimentVariantRecord = { id: `var-${crypto.randomUUID()}`, ...input }
  await drizzle.insert(experimentVariants).values({
    ...record,
    hasPrice: record.hasPrice ? 1 : 0,
  } as never)
  return record
}

export async function getExperimentWithVariants(
  db: D1Database,
  experimentId: string,
): Promise<{ experiment: ExperimentRecord; variants: ExperimentVariantRecord[] } | null> {
  const drizzle = getDb(db)
  const expRows = await drizzle.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1)
  if (!expRows[0]) return null
  const variantRows = await drizzle
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, experimentId))
  return { experiment: expRows[0], variants: variantRows }
}

export async function countAssignmentsPerVariant(
  db: D1Database,
  experimentId: string,
): Promise<Record<string, number>> {
  const drizzle = getDb(db)
  const rows = await drizzle
    .select({ variantId: experimentAssignments.variantId, count: sql<number>`count(*)` })
    .from(experimentAssignments)
    .where(eq(experimentAssignments.experimentId, experimentId))
    .groupBy(experimentAssignments.variantId)
  const result: Record<string, number> = {}
  for (const row of rows) {
    result[row.variantId] = row.count
  }
  return result
}

export async function saveExperimentAssignment(
  db: D1Database,
  input: Omit<ExperimentAssignmentRecord, 'id' | 'assignedAt'>,
): Promise<ExperimentAssignmentRecord> {
  const drizzle = getDb(db)
  const record: ExperimentAssignmentRecord = {
    id: `asgn-${crypto.randomUUID()}`,
    assignedAt: Date.now(),
    ...input,
  }
  await drizzle.insert(experimentAssignments).values(record)
  return record
}

export async function updateAssignmentThread(
  db: D1Database,
  assignmentId: string,
  threadId: string,
): Promise<void> {
  const drizzle = getDb(db)
  await drizzle
    .update(experimentAssignments)
    .set({ threadId })
    .where(eq(experimentAssignments.id, assignmentId))
}

export async function getAssignmentByThreadId(
  db: D1Database,
  threadId: string,
): Promise<ExperimentAssignmentRecord | null> {
  const drizzle = getDb(db)
  const rows = await drizzle
    .select()
    .from(experimentAssignments)
    .where(eq(experimentAssignments.threadId, threadId))
    .limit(1)
  return rows[0] ?? null
}

export async function getAssignmentByLeadId(
  db: D1Database,
  leadId: string,
): Promise<ExperimentAssignmentRecord | null> {
  const drizzle = getDb(db)
  const rows = await drizzle
    .select()
    .from(experimentAssignments)
    .where(eq(experimentAssignments.leadId, leadId))
    .orderBy(desc(experimentAssignments.assignedAt))
    .limit(1)
  return rows[0] ?? null
}

export async function saveExperimentOutcome(
  db: D1Database,
  input: Omit<ExperimentOutcomeRecord, 'id' | 'occurredAt'>,
): Promise<void> {
  const drizzle = getDb(db)
  await drizzle.insert(experimentOutcomes).values({
    id: `out-${crypto.randomUUID()}`,
    occurredAt: Date.now(),
    ...input,
  })
}

export async function getExperimentResults(
  db: D1Database,
  experimentId: string,
): Promise<VariantResult[]> {
  const drizzle = getDb(db)
  const variantRows = await drizzle
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, experimentId))

  const results: VariantResult[] = []

  for (const variant of variantRows) {
    const assignments = await drizzle
      .select({ id: experimentAssignments.id })
      .from(experimentAssignments)
      .where(
        and(
          eq(experimentAssignments.experimentId, experimentId),
          eq(experimentAssignments.variantId, variant.id),
        ),
      )
    const assignmentIds = assignments.map((a) => a.id)
    const sent = assignmentIds.length

    if (sent === 0) {
      results.push({
        variantId: variant.id,
        label: variant.label,
        tone: variant.tone,
        hasPrice: Boolean(variant.hasPrice),
        subjectSlot: variant.subjectSlot,
        sent: 0,
        replies: 0,
        replyPositive: 0,
        offerCount: 0,
        avgOffer: null,
        dealCount: 0,
      })
      continue
    }

    const outcomes = await drizzle
      .select()
      .from(experimentOutcomes)
      .where(sql`${experimentOutcomes.assignmentId} IN (${sql.join(assignmentIds.map((id) => sql`${id}`), sql`, `)})`)

    const replies = outcomes.filter((o) => o.outcomeType === 'reply_received').length
    const replyPositive = outcomes.filter((o) => o.outcomeType === 'reply_positive').length
    const offers = outcomes.filter((o) => o.outcomeType === 'offer_made' && o.value != null)
    const offerCount = offers.length
    const avgOffer = offerCount > 0
      ? Math.round(offers.reduce((sum, o) => sum + (o.value ?? 0), 0) / offerCount)
      : null
    const dealCount = outcomes.filter((o) => o.outcomeType === 'deal_closed').length

    results.push({
      variantId: variant.id,
      label: variant.label,
      tone: variant.tone,
      hasPrice: Boolean(variant.hasPrice),
      subjectSlot: variant.subjectSlot,
      sent,
      replies,
      replyPositive,
      offerCount,
      avgOffer,
      dealCount,
    })
  }

  return results
}

export async function getPricingIntelligence(db: D1Database): Promise<PricingRow[]> {
  const drizzle = getDb(db)

  // Use raw SQL to avoid Drizzle table alias limitations
  const offerRows = await drizzle.all<{ category: string | null; offerValue: number | null; targetPrice: number | null }>(
    sql`
      SELECT d.category, eo.value as offerValue, d.target_price as targetPrice
      FROM experiment_outcomes eo
      JOIN experiment_assignments ea ON eo.assignment_id = ea.id
      JOIN leads l ON ea.lead_id = l.id
      JOIN domains d ON l.domain_id = d.id
      WHERE eo.outcome_type = 'offer_made'
    `
  )

  const dealRows = await drizzle.all<{ category: string | null; agreedPrice: number | null; targetPrice: number | null }>(
    sql`
      SELECT d.category, de.agreed_price as agreedPrice, d.target_price as targetPrice
      FROM deals de
      JOIN domains d ON de.domain_id = d.id
      WHERE de.agreed_price IS NOT NULL
    `
  )

  const categoryMap: Record<string, { offers: number[]; closings: number[]; targetPrices: number[] }> = {}

  for (const row of offerRows) {
    const cat = row.category ?? 'Unknown'
    if (!categoryMap[cat]) categoryMap[cat] = { offers: [], closings: [], targetPrices: [] }
    if (row.offerValue != null) categoryMap[cat].offers.push(row.offerValue)
    if (row.targetPrice != null) categoryMap[cat].targetPrices.push(row.targetPrice)
  }

  for (const row of dealRows) {
    const cat = row.category ?? 'Unknown'
    if (!categoryMap[cat]) categoryMap[cat] = { offers: [], closings: [], targetPrices: [] }
    if (row.agreedPrice != null) categoryMap[cat].closings.push(row.agreedPrice)
  }

  return Object.entries(categoryMap).map(([category, data]) => {
    const avgFirstOffer = data.offers.length > 0
      ? Math.round(data.offers.reduce((a, b) => a + b, 0) / data.offers.length)
      : null
    const avgTargetPrice = data.targetPrices.length > 0
      ? data.targetPrices.reduce((a, b) => a + b, 0) / data.targetPrices.length
      : null
    const avgOfferPct = avgFirstOffer != null && avgTargetPrice != null && avgTargetPrice > 0
      ? Math.round((avgFirstOffer / avgTargetPrice) * 100)
      : null
    const avgClosingPrice = data.closings.length > 0
      ? Math.round(data.closings.reduce((a, b) => a + b, 0) / data.closings.length)
      : null
    const dataPoints = data.offers.length + data.closings.length
    return { category, avgFirstOffer, avgOfferPct, avgClosingPrice, dataPoints }
  })
}
