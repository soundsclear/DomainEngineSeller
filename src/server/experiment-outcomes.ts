import { getAssignmentByThreadId, getAssignmentByLeadId, saveExperimentOutcome } from './db/experiment-repository'

export type OutcomeType = 'reply_received' | 'reply_positive' | 'offer_made' | 'deal_closed'

export async function logOutcomeForThread(
  db: D1Database,
  threadId: string,
  outcomeType: OutcomeType,
  value?: number,
): Promise<void> {
  const assignment = await getAssignmentByThreadId(db, threadId)
  if (!assignment) return
  await saveExperimentOutcome(db, { assignmentId: assignment.id, outcomeType, value: value ?? null })
}

export async function logOutcomeForLead(
  db: D1Database,
  leadId: string,
  outcomeType: OutcomeType,
  value?: number,
): Promise<void> {
  const assignment = await getAssignmentByLeadId(db, leadId)
  if (!assignment) return
  await saveExperimentOutcome(db, { assignmentId: assignment.id, outcomeType, value: value ?? null })
}
