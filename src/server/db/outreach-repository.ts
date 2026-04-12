import { desc, eq } from 'drizzle-orm'
import type { OutreachWorkflowRecord } from '../outreach-workflow'
import { ensureDemoLeadAndDomain } from './demo-bootstrap'
import { getDb } from './client'
import { contacts, followupTasks, messages, outreachThreads, domains, leads } from './schema'
import { ensureOutreachSchema } from './ensure-outreach-schema'

function isoFromMillis(value: number | null | undefined) {
  if (value == null) {
    return null
  }

  return new Date(value).toISOString()
}

export async function saveOutreachWorkflow(binding: D1Database, workflow: OutreachWorkflowRecord) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  await ensureDemoLeadAndDomain(binding, workflow.lead.id)

  await db.insert(outreachThreads).values({
    id: workflow.thread.id,
    leadId: workflow.thread.leadId,
    domainId: workflow.thread.domainId,
    status: workflow.thread.status,
    autoSendEnabled: workflow.thread.autoSendEnabled,
    lastMessageAt: Date.parse(workflow.thread.lastMessageAt),
    createdAt: Date.parse(workflow.thread.createdAt),
  })

  await db.insert(messages).values({
    id: workflow.message.id,
    threadId: workflow.message.threadId,
    direction: workflow.message.direction,
    channel: workflow.message.channel,
    subject: workflow.message.subject,
    body: workflow.message.body,
    classification: workflow.message.classification,
    sentAt: null,
    createdAt: Date.parse(workflow.message.createdAt),
  })

  await db.insert(followupTasks).values({
    id: workflow.followupTask.id,
    threadId: workflow.followupTask.threadId,
    dueAt: workflow.followupTask.dueAt ? Date.parse(workflow.followupTask.dueAt) : Date.parse(workflow.followupTask.createdAt),
    status: workflow.followupTask.status,
    createdAt: Date.parse(workflow.followupTask.createdAt),
  })

  return workflow
}

export async function listOutreachWorkflows(binding: D1Database): Promise<OutreachWorkflowRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const threadRows = await db
    .select({
      threadId: outreachThreads.id,
      leadId: outreachThreads.leadId,
      domainId: outreachThreads.domainId,
      status: outreachThreads.status,
      autoSendEnabled: outreachThreads.autoSendEnabled,
      lastMessageAt: outreachThreads.lastMessageAt,
      threadCreatedAt: outreachThreads.createdAt,
      leadCompanyName: leads.companyName,
      leadContactName: contacts.contactName,
      domainName: domains.domainName,
    })
    .from(outreachThreads)
    .leftJoin(leads, eq(outreachThreads.leadId, leads.id))
    .leftJoin(domains, eq(outreachThreads.domainId, domains.id))
    .leftJoin(contacts, eq(contacts.leadId, leads.id))
    .orderBy(desc(outreachThreads.createdAt))

  const results: OutreachWorkflowRecord[] = []

  for (const row of threadRows) {
    const [messageRow] = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, row.threadId))
      .orderBy(desc(messages.createdAt))
      .limit(1)

    const [followupRow] = await db
      .select()
      .from(followupTasks)
      .where(eq(followupTasks.threadId, row.threadId))
      .orderBy(desc(followupTasks.createdAt))
      .limit(1)

    if (!messageRow || !followupRow || !row.domainId || !row.leadCompanyName || !row.domainName) {
      continue
    }

    results.push({
      thread: {
        id: row.threadId,
        leadId: row.leadId,
        domainId: row.domainId,
        status: row.status as 'draft_prepared',
        autoSendEnabled: row.autoSendEnabled,
        lastMessageAt: isoFromMillis(row.lastMessageAt) ?? new Date().toISOString(),
        createdAt: isoFromMillis(row.threadCreatedAt) ?? new Date().toISOString(),
      },
      message: {
        id: messageRow.id,
        threadId: messageRow.threadId,
        direction: messageRow.direction as 'outbound',
        channel: messageRow.channel as 'email',
        subject: messageRow.subject ?? '',
        body: messageRow.body,
        classification: (messageRow.classification ?? 'draft') as 'draft',
        createdAt: isoFromMillis(messageRow.createdAt) ?? new Date().toISOString(),
      },
      followupTask: {
        id: followupRow.id,
        threadId: followupRow.threadId,
        dueAt: followupRow.status === 'not_needed' ? null : isoFromMillis(followupRow.dueAt),
        status: followupRow.status as 'pending' | 'not_needed',
        createdAt: isoFromMillis(followupRow.createdAt) ?? new Date().toISOString(),
      },
      lead: {
        id: row.leadId,
        companyName: row.leadCompanyName,
        contactName: row.leadContactName ?? row.leadCompanyName,
      },
      domain: {
        id: row.domainId,
        domainName: row.domainName,
      },
      draft: {
        sequenceStep: inferSequenceStepFromFollowup(followupRow.status, followupRow.dueAt, followupRow.createdAt),
        subject: messageRow.subject ?? '',
        body: messageRow.body,
        tone: inferToneFromBody(messageRow.body),
        language: inferLanguageFromBody(messageRow.body),
        recommendedFollowUpDays: followupRow.status === 'not_needed' ? null : inferFollowUpDays(followupRow.dueAt, followupRow.createdAt),
        wordCount: messageRow.body.trim().split(/\s+/).filter(Boolean).length,
        personalizationTokensUsed: [],
      },
    })
  }

  return results
}

function inferFollowUpDays(dueAt: number, createdAt: number) {
  const diffMs = dueAt - createdAt
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
}

function inferSequenceStep(status: 'pending' | 'not_needed', followUpDays: number | null): 'initial' | 'follow_up_1' | 'follow_up_2' {
  if (status === 'not_needed') {
    return 'follow_up_2'
  }

  if (followUpDays === 7) {
    return 'follow_up_1'
  }

  return 'initial'
}

function inferSequenceStepFromFollowup(status: string, dueAt: number, createdAt: number) {
  return inferSequenceStep(status as 'pending' | 'not_needed', status === 'not_needed' ? null : inferFollowUpDays(dueAt, createdAt))
}

function inferToneFromBody(body: string): 'concise' | 'standard' | 'detailed' {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  if (words > 90) return 'detailed'
  if (words < 45) return 'concise'
  return 'standard'
}

function inferLanguageFromBody(body: string): 'NL' | 'EN' {
  return body.includes('Hallo') || body.includes('Met vriendelijke groet') ? 'NL' : 'EN'
}
