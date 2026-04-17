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

function buildFallbackSeoTitle(domain: Pick<DomainRecord, 'domainName' | 'language' | 'category'>) {
  const category = domain.category || null

  if (isDutchDomain(domain)) {
    return category
      ? `${domain.domainName} te koop — domeinnaam voor ${category}`
      : `${domain.domainName} te koop — domeinnaam direct beschikbaar`
  }

  return category
    ? `Buy ${domain.domainName} — domain name for ${category}`
    : `Buy ${domain.domainName} — domain name for sale`
}

function buildFallbackMetaDescription(
  domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>,
) {
  const baseTerm = extractBaseTerm(domain.domainName)
  const categoryLabel = domain.category || (isDutchDomain(domain) ? 'online projecten' : 'online projects')

  if (isDutchDomain(domain)) {
    return `Koop de domeinnaam ${domain.domainName}. Sterk merk voor ${categoryLabel}, direct beschikbaar voor overname. Doe een bod of vraag informatie op via het contactformulier.`
  }

  return `Buy the domain name ${domain.domainName}. A strong brand fit for ${categoryLabel} built around ${baseTerm}. Available now — submit an offer or inquiry directly.`
}

function buildFallbackHeroHeadline(domain: Pick<DomainRecord, 'domainName' | 'language'>) {
  if (isDutchDomain(domain)) {
    return `${domain.domainName} beschikbaar`
  }

  return `${domain.domainName} available`
}

function buildFallbackHeroSubheadline(
  domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>,
) {
  const categoryLabel = domain.category || inferCommercialAngle(domain)

  if (isDutchDomain(domain)) {
    return `Een directe, herkenbare domeinnaam voor ${categoryLabel}. Beschikbaar voor overname — deel je plannen en ontvang snel reactie.`
  }

  return `A clear, memorable domain name for ${categoryLabel}. Available to acquire — share your use case and get a fast response.`
}

function buildFallbackBodyContent(domain: Pick<DomainRecord, 'domainName' | 'language' | 'category' | 'notes'>) {
  const baseTerm = extractBaseTerm(domain.domainName)
  const categoryLabel = domain.category || inferCommercialAngle(domain)
  const notesText = domain.notes.trim()

  if (isDutchDomain(domain)) {
    const notesLine = notesText ? `\n\n${notesText}` : ''

    return [
      `${domain.domainName} is een beschikbare domeinnaam die direct ingezet kan worden als merknaam, campagnedomein of online bestemming voor ${categoryLabel}. De naam is kort, concreet en makkelijk te onthouden.`,
      `Voor bedrijven en ondernemers actief in ${baseTerm} biedt deze domeinnaam een sterke basis voor herkenbaarheid, vindbaarheid in zoekmachines en direct vertrouwen bij bezoekers.${notesLine}`,
      `Gebruik het formulier hiernaast om je interesse kenbaar te maken, een bod te doen of meer informatie op te vragen over de overdracht.`,
    ].join('\n\n')
  }

  const notesLine = notesText ? `\n\n${notesText}` : ''

  return [
    `${domain.domainName} is an available domain name ready to use as a brand, campaign destination, or online home for ${categoryLabel}. Short, specific, and easy to remember.`,
    `For businesses and teams working in ${baseTerm}, this domain provides a strong foundation for brand recognition, search engine visibility, and immediate visitor trust.${notesLine}`,
    `Use the form on this page to express your interest, submit an offer, or ask about the transfer process.`,
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
