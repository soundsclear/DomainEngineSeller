import { describe, expect, it } from 'vitest'
import { generateOutreachDraft } from './outreach-draft'
import type { OutreachDraftInput } from './outreach-draft'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const nlBase: OutreachDraftInput = {
  domain: {
    name: 'amsterdamdakdekker.nl',
    category: 'Home services',
    language: 'NL',
    targetPrice: 1900,
    currency: 'EUR',
    notes: 'Sterk geo + dienst combinatie voor dakdekkers.',
  },
  lead: {
    companyName: 'DakPro Amsterdam',
    contactName: 'Milan de Vries',
    website: 'https://dakpro-amsterdam.example',
    buyerFitReason: 'Exacte service-geografie match met bestaand lokaal merk.',
    outreachCount: 0,
    doNotContact: false,
    uninterested: false,
  },
  sender: { name: 'Jan Verkoper', email: 'jan@dse.example' },
  tone: 'standard',
  autoSendEnabled: false,
  dailyLimit: 10,
}

const enBase: OutreachDraftInput = {
  domain: {
    name: 'greenbatteryhub.com',
    category: 'Energy',
    language: 'EN',
    targetPrice: 3900,
    currency: 'EUR',
  },
  lead: {
    companyName: 'Volta Storage BV',
    contactName: 'Sarah Green',
    website: 'https://voltastorage.example',
    buyerFitReason: 'Owns several green energy product lines.',
    outreachCount: 0,
    doNotContact: false,
    uninterested: false,
  },
  sender: { name: 'Jan Seller', email: 'jan@dse.example' },
  tone: 'standard',
  autoSendEnabled: false,
  dailyLimit: 10,
}

// ---------------------------------------------------------------------------
// Eligibility gating
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – eligibility gating', () => {
  it('returns eligible: false for do-not-contact leads', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, doNotContact: true } })
    expect(result.eligible).toBe(false)
    expect(result.draft).toBeNull()
  })

  it('returns eligible: false when lead is uninterested', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, uninterested: true } })
    expect(result.eligible).toBe(false)
    expect(result.draft).toBeNull()
  })

  it('returns eligible: false at outreachCount >= 3', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 3 } })
    expect(result.eligible).toBe(false)
    expect(result.draft).toBeNull()
  })

  it('returns eligible: false when auto-send is on and daily limit is 0', () => {
    const result = generateOutreachDraft({ ...nlBase, autoSendEnabled: true, dailyLimit: 0 })
    expect(result.eligible).toBe(false)
  })

  it('returns eligible: true for a normal lead', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.eligible).toBe(true)
    expect(result.draft).not.toBeNull()
  })

  it('includes the guardrail reason in the result', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.reason).toContain('draft-first')
  })
})

// ---------------------------------------------------------------------------
// Sequence step selection
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – sequence step', () => {
  it('selects initial when outreachCount is 0', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 0 } })
    expect(result.draft?.sequenceStep).toBe('initial')
  })

  it('selects follow_up_1 when outreachCount is 1', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 1 } })
    expect(result.draft?.sequenceStep).toBe('follow_up_1')
  })

  it('selects follow_up_2 when outreachCount is 2', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 2 } })
    expect(result.draft?.sequenceStep).toBe('follow_up_2')
  })

  it('sets recommendedFollowUpDays to 5 for initial', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 0 } })
    expect(result.draft?.recommendedFollowUpDays).toBe(5)
  })

  it('sets recommendedFollowUpDays to 7 for follow_up_1', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 1 } })
    expect(result.draft?.recommendedFollowUpDays).toBe(7)
  })

  it('sets recommendedFollowUpDays to null for follow_up_2', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 2 } })
    expect(result.draft?.recommendedFollowUpDays).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// NL drafts
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – NL language', () => {
  it('sets language to NL', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.draft?.language).toBe('NL')
  })

  it('includes domain name in subject', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.draft?.subject).toContain('amsterdamdakdekker.nl')
  })

  it('includes company name in subject', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.draft?.subject).toContain('DakPro Amsterdam')
  })

  it('addresses the contact by first name', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.draft?.body).toContain('Milan')
  })

  it('includes the asking price in the body', () => {
    const result = generateOutreachDraft(nlBase)
    // Price is formatted as € 1.900 in nl-NL locale
    expect(result.draft?.body).toMatch(/1[.,. ]?900/)
  })

  it('includes the buyerFitReason in initial draft', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.draft?.body).toContain('Exacte service-geografie match')
  })

  it('concise tone produces a shorter body than detailed', () => {
    const concise = generateOutreachDraft({ ...nlBase, tone: 'concise' })
    const detailed = generateOutreachDraft({ ...nlBase, tone: 'detailed' })
    expect(concise.draft!.wordCount).toBeLessThan(detailed.draft!.wordCount)
  })

  it('detailed tone includes domain notes', () => {
    const result = generateOutreachDraft({ ...nlBase, tone: 'detailed' })
    expect(result.draft?.body).toContain('dakdekkers')
    expect(result.draft?.personalizationTokensUsed).toContain('domain.notes')
  })

  it('detailed tone without notes does not include domain.notes in tokens', () => {
    const input = { ...nlBase, tone: 'detailed' as const, domain: { ...nlBase.domain, notes: undefined } }
    const result = generateOutreachDraft(input)
    expect(result.draft?.personalizationTokensUsed).not.toContain('domain.notes')
  })

  it('follow_up_2 does not include asking price', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 2 } })
    expect(result.draft?.body).not.toMatch(/1[.,. ]?900/)
  })

  it('follow_up_2 body signals it is the last message', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 2 } })
    expect(result.draft?.body.toLowerCase()).toContain('laatste')
  })

  it('follow_up_1 subject contains Re:', () => {
    const result = generateOutreachDraft({ ...nlBase, lead: { ...nlBase.lead, outreachCount: 1 } })
    expect(result.draft?.subject).toContain('Re:')
  })
})

// ---------------------------------------------------------------------------
// EN drafts
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – EN language', () => {
  it('sets language to EN', () => {
    const result = generateOutreachDraft(enBase)
    expect(result.draft?.language).toBe('EN')
  })

  it('addresses the contact by first name', () => {
    const result = generateOutreachDraft(enBase)
    expect(result.draft?.body).toContain('Sarah')
  })

  it('includes the asking price in the body', () => {
    const result = generateOutreachDraft(enBase)
    expect(result.draft?.body).toMatch(/3[,.]?900/)
  })

  it('includes the buyerFitReason in initial draft', () => {
    const result = generateOutreachDraft(enBase)
    expect(result.draft?.body).toContain('green energy product lines')
  })

  it('concise subject includes domain name', () => {
    const result = generateOutreachDraft({ ...enBase, tone: 'concise' })
    expect(result.draft?.subject).toContain('greenbatteryhub.com')
  })

  it('follow_up_2 signals it is the final note', () => {
    const result = generateOutreachDraft({ ...enBase, lead: { ...enBase.lead, outreachCount: 2 } })
    expect(result.draft?.subject.toLowerCase()).toContain('final')
    expect(result.draft?.body.toLowerCase()).toContain('last message')
  })

  it('follow_up_1 subject contains Re:', () => {
    const result = generateOutreachDraft({ ...enBase, lead: { ...enBase.lead, outreachCount: 1 } })
    expect(result.draft?.subject).toContain('Re:')
  })

  it('energy category angle mentions authority or energy', () => {
    const result = generateOutreachDraft(enBase)
    const body = result.draft!.body.toLowerCase()
    expect(body.includes('authority') || body.includes('energy')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tone variants
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – tone variants', () => {
  it('all three tones produce an eligible draft for EN', () => {
    for (const tone of ['concise', 'standard', 'detailed'] as const) {
      const result = generateOutreachDraft({ ...enBase, tone })
      expect(result.eligible).toBe(true)
      expect(result.draft).not.toBeNull()
    }
  })

  it('all three tones produce an eligible draft for NL', () => {
    for (const tone of ['concise', 'standard', 'detailed'] as const) {
      const result = generateOutreachDraft({ ...nlBase, tone })
      expect(result.eligible).toBe(true)
      expect(result.draft).not.toBeNull()
    }
  })

  it('tone is reflected in the draft output', () => {
    const result = generateOutreachDraft({ ...enBase, tone: 'concise' })
    expect(result.draft?.tone).toBe('concise')
  })
})

// ---------------------------------------------------------------------------
// Personalization tokens
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – personalization tokens', () => {
  it('always includes domain.name and lead.companyName', () => {
    const result = generateOutreachDraft(enBase)
    expect(result.draft?.personalizationTokensUsed).toContain('domain.name')
    expect(result.draft?.personalizationTokensUsed).toContain('lead.companyName')
  })

  it('always includes domain.targetPrice', () => {
    const result = generateOutreachDraft(nlBase)
    expect(result.draft?.personalizationTokensUsed).toContain('domain.targetPrice')
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('generateOutreachDraft – input validation', () => {
  it('rejects invalid sender email', () => {
    expect(() =>
      generateOutreachDraft({ ...enBase, sender: { ...enBase.sender, email: 'not-an-email' } }),
    ).toThrow()
  })

  it('rejects negative targetPrice', () => {
    expect(() =>
      generateOutreachDraft({ ...enBase, domain: { ...enBase.domain, targetPrice: -500 } }),
    ).toThrow()
  })

  it('wordCount is a positive integer', () => {
    const result = generateOutreachDraft(enBase)
    expect(result.draft!.wordCount).toBeGreaterThan(0)
    expect(Number.isInteger(result.draft!.wordCount)).toBe(true)
  })
})
