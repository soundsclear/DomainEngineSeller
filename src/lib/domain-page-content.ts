import type { DomainRecord } from '@/types/domain'

export const PUBLIC_DOMAIN_STATUSES = ['listed', 'inbound_only'] as const

export type DomainPageContentStatus = 'draft' | 'generated' | 'manual'

export interface DomainPageContentRecord {
  domainId: string
  seoTitle: string
  metaDescription: string
  heroHeadline: string
  heroSubheadline: string
  bodyContent: string
  contentStatus: DomainPageContentStatus
  generatedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ResolvedDomainPageContent {
  seoTitle: string
  metaDescription: string
  heroHeadline: string
  heroSubheadline: string
  bodyContent: string
}

export function isPublicDomainStatus(status: string): status is (typeof PUBLIC_DOMAIN_STATUSES)[number] {
  return PUBLIC_DOMAIN_STATUSES.includes(status as (typeof PUBLIC_DOMAIN_STATUSES)[number])
}

export function isPublicDomain(domain: Pick<DomainRecord, 'status' | 'sellMode'>) {
  return isPublicDomainStatus(domain.status) && domain.sellMode === 'portfolio_redirect'
}

export function resolveDomainPageContent(
  domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>,
  storedContent?: Pick<
    DomainPageContentRecord,
    'seoTitle' | 'metaDescription' | 'heroHeadline' | 'heroSubheadline' | 'bodyContent'
  > | null,
): ResolvedDomainPageContent {
  return {
    seoTitle: storedContent?.seoTitle || buildFallbackSeoTitle(domain),
    metaDescription: storedContent?.metaDescription || buildFallbackMetaDescription(domain),
    heroHeadline: storedContent?.heroHeadline || buildFallbackHeroHeadline(domain),
    heroSubheadline: storedContent?.heroSubheadline || buildFallbackHeroSubheadline(domain),
    bodyContent: storedContent?.bodyContent || buildFallbackBodyContent(domain),
  }
}

export function buildPortfolioExcerpt(
  domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>,
  storedContent?: Pick<DomainPageContentRecord, 'heroSubheadline'> | null,
) {
  if (storedContent?.heroSubheadline) {
    return storedContent.heroSubheadline
  }

  if (domain.notes.trim()) {
    return domain.notes.trim()
  }

  return buildFallbackHeroSubheadline(domain)
}

function buildFallbackSeoTitle(domain: Pick<DomainRecord, 'domainName' | 'language'>) {
  if (isDutchDomain(domain)) {
    return `${domain.domainName} kopen | Domein te koop`
  }

  return `Buy ${domain.domainName} | Domain for sale`
}

function buildFallbackMetaDescription(
  domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>,
) {
  const categoryLabel = domain.category || (isDutchDomain(domain) ? 'je volgende project' : 'your next project')

  if (isDutchDomain(domain)) {
    return `${domain.domainName} is beschikbaar voor overname. Geschikt voor ${categoryLabel} en direct beschikbaar voor een serieus bod.`
  }

  return `${domain.domainName} is available to acquire. A strong fit for ${categoryLabel} with room for brand, search, and direct response value.`
}

function buildFallbackHeroHeadline(domain: Pick<DomainRecord, 'domainName' | 'language'>) {
  if (isDutchDomain(domain)) {
    return `${domain.domainName} is beschikbaar`
  }

  return `${domain.domainName} is available`
}

function buildFallbackHeroSubheadline(
  domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>,
) {
  const categoryLabel = domain.category || inferCommercialAngle(domain)

  if (isDutchDomain(domain)) {
    return `Een heldere domeinnaam voor ${categoryLabel}. Deel je plannen en ontvang snel reactie op je bod of vraag.`
  }

  return `A commercially clear domain for ${categoryLabel}. Share your plan and get a fast response on your inquiry or offer.`
}

function buildFallbackBodyContent(domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>) {
  const baseTerm = extractBaseTerm(domain.domainName)
  const categoryLabel = domain.category || inferCommercialAngle(domain)
  const notesText = domain.notes.trim()

  if (isDutchDomain(domain)) {
    const notesSentence = notesText
      ? ` Huidige context: ${notesText}`
      : ''

    return [
      `${domain.domainName} past goed bij een merk, campagne of niche-aanbod rond ${baseTerm}. De naam is kort genoeg om te onthouden en concreet genoeg om direct relevant verkeer op te vangen.`,
      `Voor partijen in ${categoryLabel} kan deze domeinnaam helpen om sneller vertrouwen, herkenning en vindbaarheid op te bouwen.${notesSentence}`,
      `Gebruik het formulier op deze pagina om je interesse te delen, een bod te doen of je timing te bespreken.`,
    ].join('\n\n')
  }

  const notesSentence = notesText ? ` Current context: ${notesText}` : ''

  return [
    `${domain.domainName} works well for a brand, campaign, or focused offer built around ${baseTerm}. It is easy to remember and specific enough to support direct search relevance.`,
    `Teams operating in ${categoryLabel} can use this domain to strengthen clarity, trust, and discoverability from the first visit.${notesSentence}`,
    `Use the inquiry form on this page to share your use case, timeline, or offer amount.`,
  ].join('\n\n')
}

function inferCommercialAngle(domain: Pick<DomainRecord, 'domainName' | 'language'>) {
  const baseTerm = extractBaseTerm(domain.domainName)
  return isDutchDomain(domain) ? `${baseTerm} en aanverwante proposities` : `${baseTerm} and adjacent offers`
}

function extractBaseTerm(domainName: string) {
  return domainName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

function isDutchDomain(domain: Pick<DomainRecord, 'language'>) {
  return domain.language.toUpperCase() === 'NL'
}
