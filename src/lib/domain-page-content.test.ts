import { describe, expect, it } from 'vitest'
import { isPublicDomain, resolveDomainPageContent } from './domain-page-content'
import type { DomainRecord } from '@/types/domain'

const baseDomain: DomainRecord = {
  id: 'geboorteservies-nl',
  domainName: 'geboorteservies.nl',
  tld: '.nl',
  language: 'NL',
  category: 'baby cadeaus',
  status: 'listed',
  sellMode: 'portfolio_redirect',
  currentRegistrar: 'xel',
  acquisitionCost: 0,
  annualRenewalCost: 0,
  targetPrice: 5400,
  quickSalePrice: 3200,
  aspirationalPrice: 7800,
  migrationCandidate: false,
  notes: 'Sterk voor webshops rond babyshower en geboortecadeaus.',
}

describe('domain-page-content helpers', () => {
  it('treats listed portfolio redirect domains as public', () => {
    expect(isPublicDomain(baseDomain)).toBe(true)
    expect(
      isPublicDomain({
        ...baseDomain,
        sellMode: 'afternic_lander',
      }),
    ).toBe(false)
    expect(
      isPublicDomain({
        ...baseDomain,
        status: 'sold',
      }),
    ).toBe(false)
  })

  it('builds a Dutch fallback when no stored content exists', () => {
    const content = resolveDomainPageContent(baseDomain, null)

    expect(content.seoTitle).toContain('geboorteservies.nl')
    expect(content.heroHeadline).toContain('beschikbaar')
    expect(content.heroSubheadline).toContain('baby cadeaus')
    expect(content.bodyContent).toContain('geboorteservies.nl')
  })

  it('prefers stored content over fallback fields', () => {
    const content = resolveDomainPageContent(baseDomain, {
      seoTitle: 'Custom title',
      metaDescription: 'Custom description with enough detail.',
      heroHeadline: 'Custom headline',
      heroSubheadline: 'Custom subheadline',
      bodyContent: 'Custom body copy',
    })

    expect(content).toEqual({
      seoTitle: 'Custom title',
      metaDescription: 'Custom description with enough detail.',
      heroHeadline: 'Custom headline',
      heroSubheadline: 'Custom subheadline',
      bodyContent: 'Custom body copy',
    })
  })
})
