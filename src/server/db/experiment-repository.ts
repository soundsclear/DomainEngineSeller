import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

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

export interface ExperimentWithVariants extends ExperimentRecord {
  variants: ExperimentVariantRecord[]
}

// ── In-memory store (for tests / local use without D1) ───────────────────────

const _experiments: ExperimentRecord[] = []
const _variants: ExperimentVariantRecord[] = []
const _assignments: ExperimentAssignmentRecord[] = []

// ── Pure helper (no DB) used in unit tests ───────────────────────────────────

export function insertExperiment(input: { name: string; status: string }): ExperimentRecord {
  const record: ExperimentRecord = {
    id: randomUUID(),
    name: input.name,
    status: input.status,
    createdAt: Date.now(),
  }
  _experiments.push(record)
  return record
}

// ── D1-backed functions ───────────────────────────────────────────────────────

export async function getActiveExperiment(db: D1Database): Promise<ExperimentRecord | null> {
  const result = await db
    .prepare("SELECT * FROM experiments WHERE status = 'active' LIMIT 1")
    .first<ExperimentRecord>()
  return result ?? null
}

export async function getExperimentWithVariants(
  db: D1Database,
  experimentId: string,
): Promise<ExperimentWithVariants | null> {
  const experiment = await db
    .prepare('SELECT * FROM experiments WHERE id = ?')
    .bind(experimentId)
    .first<ExperimentRecord>()
  if (!experiment) return null

  const { results } = await db
    .prepare('SELECT * FROM experiment_variants WHERE experiment_id = ?')
    .bind(experimentId)
    .all<ExperimentVariantRecord>()

  return { ...experiment, variants: results ?? [] }
}

export async function countAssignmentsPerVariant(
  db: D1Database,
  experimentId: string,
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(
      'SELECT variant_id, COUNT(*) as count FROM experiment_assignments WHERE experiment_id = ? GROUP BY variant_id',
    )
    .bind(experimentId)
    .all<{ variant_id: string; count: number }>()

  const counts: Record<string, number> = {}
  for (const row of results ?? []) {
    counts[row.variant_id] = row.count
  }
  return counts
}

export async function getAssignmentByThreadId(
  db: D1Database,
  threadId: string,
): Promise<ExperimentAssignmentRecord | null> {
  const result = await db
    .prepare('SELECT * FROM experiment_assignments WHERE thread_id = ? LIMIT 1')
    .bind(threadId)
    .first<ExperimentAssignmentRecord>()
  return result ?? null
}

export async function getAssignmentByLeadId(
  db: D1Database,
  leadId: string,
): Promise<ExperimentAssignmentRecord | null> {
  const result = await db
    .prepare('SELECT * FROM experiment_assignments WHERE lead_id = ? LIMIT 1')
    .bind(leadId)
    .first<ExperimentAssignmentRecord>()
  return result ?? null
}

export async function saveExperimentOutcome(
  db: D1Database,
  input: {
    assignmentId: string
    outcomeType: string
    value: number | null
  },
): Promise<void> {
  const id = randomUUID()
  const recordedAt = Date.now()
  await db
    .prepare(
      'INSERT INTO experiment_outcomes (id, assignment_id, outcome_type, value, recorded_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(id, input.assignmentId, input.outcomeType, input.value, recordedAt)
    .run()
}

export async function saveExperimentAssignment(
  db: D1Database,
  input: {
    experimentId: string
    variantId: string
    leadId: string
    threadId: string | null
  },
): Promise<ExperimentAssignmentRecord> {
  const id = randomUUID()
  const assignedAt = Date.now()

  await db
    .prepare(
      'INSERT INTO experiment_assignments (id, experiment_id, variant_id, lead_id, thread_id, assigned_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(id, input.experimentId, input.variantId, input.leadId, input.threadId, assignedAt)
    .run()

  return {
    id,
    experimentId: input.experimentId,
    variantId: input.variantId,
    leadId: input.leadId,
    threadId: input.threadId,
    assignedAt,
  }
}
