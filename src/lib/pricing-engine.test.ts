import { describe, expect, it } from 'vitest'
import { generatePriceRecommendation } from './pricing-engine'

describe('generatePriceRecommendation', () => {
  it('rewards commercial geo-service domains', () => {
    const result = generatePriceRecommendation({
      domainName: 'amsterdamdakdekker.nl',
      extension: '.nl',
      language: 'nl',
    })

    expect(result.domainType).toBe('geo-service')
    expect(result.targetPrice).toBeGreaterThan(result.quickSalePrice)
    expect(result.confidenceScore).toBeGreaterThan(60)
  })
})
