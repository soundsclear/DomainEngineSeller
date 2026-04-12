import { describe, expect, it } from 'vitest'
import { buildBuyerDiscoveryOutreachDraft } from './buyer-outreach'

const domain = {
  id: 'greenbatteryhub-com',
  domainName: 'greenbatteryhub.com',
  tld: '.com',
  language: 'EN',
  category: 'Energy',
  status: 'listed',
  sellMode: 'portfolio_redirect',
  currentRegistrar: 'xel',
  acquisitionCost: 100,
  annualRenewalCost: 12,
  notes: 'Commercial energy-storage brand.',
  migrationCandidate: false,
  targetRegistrar: null,
  quickSalePrice: 1500,
  targetPrice: 3900,
  aspirationalPrice: 6500,
} as const

describe('buildBuyerDiscoveryOutreachDraft', () => {
  it('builds an eligible draft for a buyer-discovery lead', () => {
    const response = buildBuyerDiscoveryOutreachDraft({
      lead: {
        id: 'lead-db-1',
        domainId: domain.id,
        companyName: 'Volt Storage',
        website: 'https://voltstorage.example',
        buyerFitReason: 'Already selling industrial battery systems under a broad category brand.',
        priorityScore: 92,
        doNotContact: false,
        country: 'NL',
        source: 'buyer_discovery',
        contactName: null,
        contactEmail: 'volt@example.com',
        createdAt: Date.now(),
      },
      domain,
      sender: {
        name: 'Jan Seller',
        email: 'jan@example.com',
      },
      outreachCount: 0,
      tone: 'standard',
    })

    expect(response.result.eligible).toBe(true)
    expect(response.result.draft?.subject).toContain('greenbatteryhub.com')
    expect(response.meta.outreachCount).toBe(0)
  })

  it('returns an ineligible result for do-not-contact leads', () => {
    const response = buildBuyerDiscoveryOutreachDraft({
      lead: {
        id: 'lead-db-2',
        domainId: domain.id,
        companyName: 'Quiet Buyer',
        website: null,
        buyerFitReason: null,
        priorityScore: 40,
        doNotContact: true,
        country: null,
        source: 'buyer_discovery',
        contactName: null,
        contactEmail: null,
        createdAt: Date.now(),
      },
      domain,
      sender: {
        name: 'Jan Seller',
        email: 'jan@example.com',
      },
      outreachCount: 0,
    })

    expect(response.result.eligible).toBe(false)
    expect(response.result.draft).toBeNull()
  })
})
