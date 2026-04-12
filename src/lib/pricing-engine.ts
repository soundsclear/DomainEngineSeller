export interface PriceEngineInput {
  domainName: string
  extension: string
  language?: string
  category?: string
}

export interface PriceEngineResult {
  quickSalePrice: number
  targetPrice: number
  aspirationalPrice: number
  confidenceScore: number
  rationale: string[]
  domainType: 'geo-service' | 'commercial-phrase' | 'brandable' | 'mixed'
}

const COMMERCIAL_KEYWORDS = ['seo', 'dak', 'battery', 'lease', 'cloud', 'tax', 'ai']
const GEO_HINTS = ['amsterdam', 'rotterdam', 'utrecht', 'eindhoven', 'denhaag']

export function generatePriceRecommendation(input: PriceEngineInput): PriceEngineResult {
  const raw = input.domainName.toLowerCase().replace(input.extension.toLowerCase(), '')
  const tokens = raw.split(/[-.]/).filter(Boolean)
  const hasHyphen = raw.includes('-')
  const hasDigit = /\d/.test(raw)
  const shortName = raw.length <= 12
  const hasCommercialKeyword = COMMERCIAL_KEYWORDS.some((keyword) => raw.includes(keyword))
  const looksGeoService =
    ['nl', 'en'].includes((input.language ?? '').toLowerCase()) &&
    (tokens.length >= 2 || GEO_HINTS.some((city) => raw.startsWith(city))) &&
    hasCommercialKeyword

  let score = 45
  const rationale: string[] = []

  if (shortName) {
    score += 14
    rationale.push('Shorter names usually improve memorability and buyer appeal.')
  }

  if (hasCommercialKeyword) {
    score += 18
    rationale.push('The domain contains commercially meaningful keywords.')
  }

  if (looksGeoService) {
    score += 10
    rationale.push('The structure resembles a geo-plus-service pattern with clear end-user value.')
  }

  if (!hasHyphen) {
    score += 8
  } else {
    score -= 8
    rationale.push('Hyphens reduce resale flexibility for many buyers.')
  }

  if (hasDigit) {
    score -= 10
    rationale.push('Digits tend to reduce clarity and trust for end users.')
  }

  if (input.extension === '.com') {
    score += 12
    rationale.push('.com remains the strongest default resale extension for broad end-user demand.')
  }

  if (input.extension === '.nl') {
    score += 8
    rationale.push('.nl performs well for Dutch local commercial intent.')
  }

  if (input.extension === '.ai') {
    score += 6
    rationale.push('.ai can support strong positioning in software and AI categories.')
  }

  const confidenceScore = Math.max(35, Math.min(92, score))
  const base = Math.max(350, confidenceScore * 32)
  const quickSalePrice = Math.round(base / 50) * 50
  const targetPrice = Math.round((base * 2.2) / 50) * 50
  const aspirationalPrice = Math.round((targetPrice * 1.7) / 50) * 50

  return {
    quickSalePrice,
    targetPrice,
    aspirationalPrice,
    confidenceScore,
    rationale,
    domainType: looksGeoService
      ? 'geo-service'
      : hasCommercialKeyword
        ? 'commercial-phrase'
        : shortName
          ? 'brandable'
          : 'mixed',
  }
}
