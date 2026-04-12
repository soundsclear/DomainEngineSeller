import { describe, expect, it, vi } from 'vitest'
import type { DomainApiRecord } from '../db/domain-repository'
import { runBuyerDiscovery } from './buyer-discovery'
import { buildSemanticGuidance } from './semantic-guidance'

const domain: DomainApiRecord = {
  id: 'geboorteservies-nl',
  domainName: 'geboorteservies.nl',
  tld: '.nl',
  language: 'NL',
  category: 'ecommerce',
  status: 'listed',
  sellMode: 'portfolio_redirect',
  currentRegistrar: 'xel',
  acquisitionCost: 0,
  annualRenewalCost: 0,
  notes: 'Think semantically about birth-themed tableware and gifting.',
  migrationCandidate: false,
  targetRegistrar: null,
  quickSalePrice: 2500,
  targetPrice: 4800,
  aspirationalPrice: 8000,
}

describe('runBuyerDiscovery', () => {
  it('deduplicates websites and skips already-known leads', async () => {
    const client = {
      generateObject: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            queries: [
              { angle: 'direct', query: 'geboorteservies webshop nederland' },
              { angle: 'direct duplicate', query: 'geboorteservies webshop nederland' },
              { angle: 'gifting', query: 'baby cadeau servies winkel' },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            leads: [
              {
                companyName: 'Baby Gift Co',
                website: 'https://babygiftco.nl',
                buyerFitReason: 'They sell themed baby gifts and could launch a dedicated birth-tableware concept.',
                angle: 'direct',
                priorityScore: 9,
              },
              {
                companyName: 'Baby Gift Co Duplicate',
                website: 'http://www.babygiftco.nl/',
                buyerFitReason: 'Duplicate website in another form.',
                angle: 'gifting',
                priorityScore: 5,
              },
              {
                companyName: 'Existing Lead',
                website: 'bestegeboorteshop.nl',
                buyerFitReason: 'Already known lead.',
                angle: 'seo',
                priorityScore: 10,
              },
            ],
          },
        }),
    }

    const searchClient = {
      search: vi
        .fn()
        .mockResolvedValueOnce({
          query: 'geboorteservies webshop nederland',
          results: [
            {
              title: 'Baby Gift Co',
              url: 'https://babygiftco.nl',
              description: 'Baby gifts and keepsakes.',
              extraSnippets: [],
            },
          ],
        })
        .mockRejectedValueOnce(new Error('rate limited')),
    }

    const result = await runBuyerDiscovery({
      domain,
      client,
      searchClient,
      existingLeadWebsiteKeys: ['bestegeboorteshop.nl'],
    })

    expect(result.queryPlan).toHaveLength(2)
    expect(result.searchErrors).toHaveLength(1)
    expect(result.newCandidates).toHaveLength(1)
    expect(result.newCandidates[0].website).toBe('https://babygiftco.nl')
    expect(result.skippedWebsiteKeys).toContain('babygiftco.nl')
    expect(result.skippedWebsiteKeys).toContain('bestegeboorteshop.nl')
  })

  it('returns an empty candidate list when all searches fail', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          queries: [{ angle: 'direct', query: 'domain buyers query' }],
        },
      }),
    }

    const searchClient = {
      search: vi.fn().mockRejectedValue(new Error('network down')),
    }

    const result = await runBuyerDiscovery({
      domain,
      client,
      searchClient,
    })

    expect(result.searchErrors).toHaveLength(1)
    expect(result.newCandidates).toEqual([])
    expect(result.rawLeadCount).toBe(0)
  })

  it('normalizes alternate field names returned by the model', async () => {
    const client = {
      generateObject: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            queries: [{ angle: 'direct', query: 'geboorteservies webshop nederland' }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            leads: [
              {
                company: 'Servieswinkel NL',
                url: 'https://servieswinkel.nl',
                reason: 'This shop already sells themed tableware and could extend into birth-themed assortments.',
                queryAngle: 'direct',
                score: 8,
              },
            ],
          },
        }),
    }

    const searchClient = {
      search: vi.fn().mockResolvedValue({
        query: 'geboorteservies webshop nederland',
        results: [
          {
            title: 'Servieswinkel NL',
            url: 'https://servieswinkel.nl',
            description: 'Servies en tafelmomenten.',
            extraSnippets: [],
          },
        ],
      }),
    }

    const result = await runBuyerDiscovery({
      domain,
      client,
      searchClient,
    })

    expect(result.newCandidates).toHaveLength(1)
    expect(result.newCandidates[0].companyName).toBe('Servieswinkel NL')
    expect(result.newCandidates[0].angle).toBe('direct')
  })

  it('includes semantic guardrails for misleading cognates', () => {
    const guidance = buildSemanticGuidance(domain)

    expect(guidance).toContain('Literal domain label: geboorteservies')
    expect(guidance).toContain('serviceverlening')
    expect(guidance).toContain('domain notes win')
  })
})
