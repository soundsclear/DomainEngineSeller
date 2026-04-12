import { demoDomains, demoLeads } from '../lib/demo-data'
import { generateOutreachDraft, type OutreachDraftInput, type OutreachDraftResult, type OutreachTone } from '../lib/outreach-draft'

export interface BuildLeadOutreachDraftInput {
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

export interface LeadOutreachDraftResponse {
  lead: (typeof demoLeads)[number]
  domain: (typeof demoDomains)[number]
  result: OutreachDraftResult
}

export function buildLeadOutreachDraft(input: BuildLeadOutreachDraftInput): LeadOutreachDraftResponse {
  const lead = demoLeads.find((item) => item.id === input.leadId)

  if (!lead) {
    throw new Error('Lead not found.')
  }

  const domain = demoDomains.find((item) => item.id === lead.domainId)

  if (!domain) {
    throw new Error('Linked domain not found for lead.')
  }

  const draftInput: OutreachDraftInput = {
    domain: {
      name: domain.domainName,
      category: domain.category,
      language: domain.language as 'NL' | 'EN',
      targetPrice: domain.targetPrice,
      currency: 'EUR',
      notes: domain.notes,
    },
    lead: {
      companyName: lead.companyName,
      contactName: lead.contactName,
      website: lead.website,
      buyerFitReason: lead.buyerFitReason,
      outreachCount: input.outreachCount ?? 0,
      doNotContact: lead.doNotContact,
      uninterested: false,
    },
    sender: input.sender,
    tone: input.tone ?? 'standard',
    autoSendEnabled: input.autoSendEnabled ?? false,
    dailyLimit: input.dailyLimit ?? 10,
  }

  return {
    lead,
    domain,
    result: generateOutreachDraft(draftInput),
  }
}
