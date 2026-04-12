import type { OutreachDraft, OutreachTone } from '../lib/outreach-draft'
import { buildLeadOutreachDraft } from './outreach'

export interface SaveLeadOutreachDraftInput {
  leadId: string
  sender: {
    name: string
    email: string
  }
  tone?: OutreachTone
  outreachCount?: number
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

function nowIso() {
  return new Date().toISOString()
}

function addDaysIso(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export function createLeadOutreachWorkflow(input: SaveLeadOutreachDraftInput): OutreachWorkflowRecord {
  const built = buildLeadOutreachDraft(input)

  if (!built.result.eligible || !built.result.draft) {
    throw new Error(built.result.reason)
  }

  const createdAt = nowIso()
  const threadId = `thread-${crypto.randomUUID()}`
  const messageId = `msg-${crypto.randomUUID()}`
  const followupId = `followup-${crypto.randomUUID()}`
  const followUpDays = built.result.draft.recommendedFollowUpDays

  return {
    thread: {
      id: threadId,
      leadId: built.lead.id,
      domainId: built.domain.id,
      status: 'draft_prepared',
      autoSendEnabled: input.autoSendEnabled ?? false,
      lastMessageAt: createdAt,
      createdAt,
    },
    message: {
      id: messageId,
      threadId,
      direction: 'outbound',
      channel: 'email',
      subject: built.result.draft.subject,
      body: built.result.draft.body,
      classification: 'draft',
      createdAt,
    },
    followupTask: {
      id: followupId,
      threadId,
      dueAt: followUpDays === null ? null : addDaysIso(followUpDays),
      status: followUpDays === null ? 'not_needed' : 'pending',
      createdAt,
    },
    lead: {
      id: built.lead.id,
      companyName: built.lead.companyName,
      contactName: built.lead.contactName,
    },
    domain: {
      id: built.domain.id,
      domainName: built.domain.domainName,
    },
    draft: built.result.draft,
  }
}
