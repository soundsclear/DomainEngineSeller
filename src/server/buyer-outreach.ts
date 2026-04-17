import type { OutreachDraft, OutreachTone } from '../lib/outreach-draft'
import { generateOutreachDraft } from '../lib/outreach-draft'
import type { DomainApiRecord } from './db/domain-repository'
import type { LeadRecord } from './db/lead-repository'

export interface BuyerOutreachInput {
  lead: LeadRecord
  domain: DomainApiRecord
  sender: {
    name: string
    email: string
  }
  tone?: OutreachTone
  outreachCount: number
  autoSendEnabled?: boolean
  dailyLimit?: number
  hasPrice?: boolean
  followupDays1?: number
  followupDays2?: number
}

export interface BuyerOutreachDraftResponse {
  lead: {
    id: string
    companyName: string
    website: string | null
    buyerFitReason: string | null
    priorityScore: number
    doNotContact: boolean
    country: string | null
    source: string | null
  }
  domain: {
    id: string
    domainName: string
  }
  result: {
    eligible: boolean
    reason: string
    draft: OutreachDraft | null
  }
  meta: {
    outreachCount: number
  }
}

function fallbackBuyerFitReason(domainName: string, companyName: string) {
  return `${companyName} appears commercially relevant for ${domainName}.`
}

export function buildBuyerDiscoveryOutreachDraft(
  input: BuyerOutreachInput,
): BuyerOutreachDraftResponse {
  const result = generateOutreachDraft({
    domain: {
      name: input.domain.domainName,
      category: input.domain.category,
      language: input.domain.language === 'NL' ? 'NL' : 'EN',
      targetPrice: input.domain.targetPrice,
      currency: 'EUR',
      notes: input.domain.notes,
    },
    lead: {
      companyName: input.lead.companyName,
      contactName: input.lead.companyName,
      website: input.lead.website ?? undefined,
      buyerFitReason:
        input.lead.buyerFitReason ??
        fallbackBuyerFitReason(input.domain.domainName, input.lead.companyName),
      outreachCount: input.outreachCount,
      doNotContact: input.lead.doNotContact,
      uninterested: false,
    },
    sender: input.sender,
    tone: input.tone ?? 'standard',
    autoSendEnabled: input.autoSendEnabled ?? false,
    dailyLimit: input.dailyLimit ?? 10,
    hasPrice: input.hasPrice ?? false,
    followupDays1: input.followupDays1 ?? 5,
    followupDays2: input.followupDays2 ?? 7,
  })

  return {
    lead: {
      id: input.lead.id,
      companyName: input.lead.companyName,
      website: input.lead.website,
      buyerFitReason: input.lead.buyerFitReason,
      priorityScore: input.lead.priorityScore,
      doNotContact: input.lead.doNotContact,
      country: input.lead.country,
      source: input.lead.source,
    },
    domain: {
      id: input.domain.id,
      domainName: input.domain.domainName,
    },
    result,
    meta: {
      outreachCount: input.outreachCount,
    },
  }
}
