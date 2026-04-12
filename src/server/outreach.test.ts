import { describe, expect, it } from 'vitest'
import { buildLeadOutreachDraft } from './outreach'

describe('buildLeadOutreachDraft', () => {
  it('builds an eligible initial draft for a valid lead', () => {
    const response = buildLeadOutreachDraft({
      leadId: 'lead-1',
      sender: {
        name: 'Jan Seller',
        email: 'jan@dse.example',
      },
      tone: 'standard',
      outreachCount: 0,
    })

    expect(response.lead.companyName).toBe('DakPro Amsterdam')
    expect(response.domain.domainName).toBe('amsterdamdakdekker.nl')
    expect(response.result.eligible).toBe(true)
    expect(response.result.draft?.sequenceStep).toBe('initial')
  })

  it('returns an ineligible result when follow-up ceiling is reached', () => {
    const response = buildLeadOutreachDraft({
      leadId: 'lead-1',
      sender: {
        name: 'Jan Seller',
        email: 'jan@dse.example',
      },
      outreachCount: 3,
    })

    expect(response.result.eligible).toBe(false)
    expect(response.result.draft).toBeNull()
  })

  it('throws when the lead does not exist', () => {
    expect(() =>
      buildLeadOutreachDraft({
        leadId: 'missing-lead',
        sender: {
          name: 'Jan Seller',
          email: 'jan@dse.example',
        },
      }),
    ).toThrow('Lead not found.')
  })
})
