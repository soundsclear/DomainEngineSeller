import type { ExperimentVariantRecord } from './db/experiment-repository'
import {
  getActiveExperiment,
  getExperimentWithVariants,
  countAssignmentsPerVariant,
  saveExperimentAssignment,
  getAssignmentByLeadId,
} from './db/experiment-repository'

export function pickVariant(
  variants: ExperimentVariantRecord[],
  counts: Record<string, number>,
): ExperimentVariantRecord {
  return variants.reduce((best, variant) => {
    const bestCount = counts[best.id] ?? 0
    const thisCount = counts[variant.id] ?? 0
    return thisCount < bestCount ? variant : best
  })
}

export interface RotationResult {
  assignmentId: string
  variant: ExperimentVariantRecord
}

export async function assignVariantForLead(
  db: D1Database,
  leadId: string,
): Promise<RotationResult | null> {
  const experiment = await getActiveExperiment(db)
  if (!experiment) return null

  // Return existing assignment if lead is already enrolled in this experiment
  const existing = await getAssignmentByLeadId(db, leadId)
  if (existing && existing.experimentId === experiment.id) {
    const withVariants = await getExperimentWithVariants(db, experiment.id)
    const variant = withVariants?.variants.find((v) => v.id === existing.variantId)
    if (variant) return { assignmentId: existing.id, variant }
  }

  const withVariants = await getExperimentWithVariants(db, experiment.id)
  if (!withVariants || withVariants.variants.length === 0) return null

  const counts = await countAssignmentsPerVariant(db, experiment.id)
  const variant = pickVariant(withVariants.variants, counts)

  const assignment = await saveExperimentAssignment(db, {
    experimentId: experiment.id,
    variantId: variant.id,
    leadId,
    threadId: null,
  })

  return { assignmentId: assignment.id, variant }
}
