import { describe, expect, it, vi } from 'vitest'
import type { DomainApiRecord } from '../db/domain-repository'
import { generateDomainSeoContent } from './seo-generation'
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
  notes: 'Relevant for baby gift tableware and birth keepsakes.',
  migrationCandidate: false,
  targetRegistrar: null,
  quickSalePrice: 2500,
  targetPrice: 4800,
  aspirationalPrice: 8000,
}

describe('generateDomainSeoContent', () => {
  it('blocks regeneration over manually edited content unless forced', async () => {
    const client = {
      generateObject: vi.fn(),
    }

    await expect(
      generateDomainSeoContent({
        domain,
        existingContentStatus: 'manual',
        client,
      }),
    ).rejects.toThrow('Manual domain page content exists')
  })

  it('returns structured generated content from the ai client', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          seoTitle: 'Geboorteservies.nl kopen voor een babycadeau shop',
          metaDescription:
            'Geboorteservies.nl is een sterke naam voor winkels, labels en cadeauconcepten rond geboorteservies en babyshower-tafeldecoratie.',
          heroHeadline: 'Geboorteservies.nl voor een sterk babycadeau- of decorconcept',
          heroSubheadline:
            'Een duidelijke naam voor webshops en merken die geboorteservies, babyshowerdecoratie of blijvende kraamcadeaus willen verkopen.',
          bodyContent:
            'Geboorteservies.nl past bij ondernemingen die geboorte-servies en feestelijke tafelmomenten rondom een nieuwe baby centraal zetten.\n\nDe naam sluit aan op zoekintentie, is duidelijk uitlegbaar en voelt direct commercieel bruikbaar.',
        },
        rawText: '{"ok":true}',
        model: 'claude-test',
        responseId: 'msg_1',
      }),
    }

    const result = await generateDomainSeoContent({
      domain,
      existingContentStatus: null,
      client,
    })

    expect(result.content.seoTitle).toContain('Geboorteservies.nl')
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-test')
  })

  it('normalizes oversized generated fields into the expected limits', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          seoTitle:
            'Geboorteservies.nl kopen voor een uitgebreide babycadeau shop met extra lange toelichting die te lang is',
          metaDescription:
            'Geboorteservies.nl is een sterke naam voor winkels, labels en cadeauconcepten rond geboorteservies, babyshower-tafeldecoratie, geboortemomenten en aanverwante producten met een veel te lange beschrijving.',
          heroHeadline: 'Geboorteservies.nl voor een sterk babycadeau- of decorconcept',
          heroSubheadline:
            'Een duidelijke naam voor webshops en merken die geboorteservies, babyshowerdecoratie of blijvende kraamcadeaus willen verkopen.',
          bodyContent:
            'Geboorteservies.nl past bij ondernemingen die geboorte-servies en feestelijke tafelmomenten rondom een nieuwe baby centraal zetten.\n\nDe naam sluit aan op zoekintentie, is duidelijk uitlegbaar en voelt direct commercieel bruikbaar.',
        },
        rawText: '{"ok":true}',
        model: 'claude-test',
        responseId: 'msg_2',
      }),
    }

    const result = await generateDomainSeoContent({
      domain,
      existingContentStatus: null,
      client,
    })

    expect(result.content.seoTitle.length).toBeLessThanOrEqual(70)
    expect(result.content.metaDescription.length).toBeLessThanOrEqual(170)
  })

  it('builds semantic guidance that blocks servies/services confusion', () => {
    const guidance = buildSemanticGuidance(domain)

    expect(guidance).toContain('servies')
    expect(guidance).toContain('tableware')
    expect(guidance).toContain('Never reinterpret it as service, services')
    expect(guidance).toContain('Authoritative domain notes')
  })
})
