import { describe, expect, it } from 'vitest'
import { normalizeApifyContactEnrichmentResult } from './apify-contact-enrichment'

describe('normalizeApifyContactEnrichmentResult', () => {
  it('normalizes mixed contact arrays into contact points', () => {
    const result = normalizeApifyContactEnrichmentResult({
      actorName: 'website-contact-scraper',
      actorRunId: 'run-123',
      companyName: 'Example Co',
      website: 'https://example.com',
      emails: [{ value: 'hello@example.com', confidence: 91, sourceUrl: 'https://example.com/contact' }],
      phones: ['+31 20 123 4567'],
    })

    expect(result).not.toBeNull()
    expect(result?.provider).toBe('apify')
    expect(result?.actorName).toBe('website-contact-scraper')
    expect(result?.contactPoints).toHaveLength(2)
    expect(result?.contactPoints[0].contactType).toBe('email')
    expect(result?.contactPoints[0].confidenceScore).toBe(91)
    expect(result?.contactPoints[1].contactType).toBe('phone')
  })

  it('returns null for non-object input', () => {
    expect(normalizeApifyContactEnrichmentResult(null)).toBeNull()
    expect(normalizeApifyContactEnrichmentResult('')).toBeNull()
  })
})
