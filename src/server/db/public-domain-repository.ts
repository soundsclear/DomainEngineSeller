import type { InferSelectModel } from 'drizzle-orm'
import { desc, eq } from 'drizzle-orm'
import {
  buildPortfolioExcerpt,
  isPublicDomain,
  type DomainPageContentRecord,
  type DomainPageContentStatus,
} from '../../lib/domain-page-content'
import type { DomainRecord, PublicDomainRecord, PublicPortfolioDomainRecord } from '../../types/domain'
import { generatePriceRecommendation } from '../../lib/pricing-engine'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { domainPageContent, domains } from './schema'

type DomainRow = InferSelectModel<typeof domains>
type DomainPageContentRow = InferSelectModel<typeof domainPageContent>

export interface DomainPageContentInput {
  seoTitle: string
  metaDescription: string
  heroHeadline: string
  heroSubheadline: string
  bodyContent: string
  contentStatus: DomainPageContentStatus
  generatedAt?: number | null
}

function toDomainRecord(row: DomainRow): DomainRecord {
  const recommendation = generatePriceRecommendation({
    domainName: row.domainName,
    extension: row.tld,
    language: row.language ?? undefined,
    category: row.category ?? undefined,
  })

  return {
    id: row.id,
    domainName: row.domainName,
    tld: row.tld,
    language: row.language ?? 'EN',
    category: row.category ?? 'general',
    status: row.status as DomainRecord['status'],
    sellMode: row.sellMode as DomainRecord['sellMode'],
    currentRegistrar: row.currentRegistrar as DomainRecord['currentRegistrar'],
    acquisitionCost: row.acquisitionCost ?? 0,
    annualRenewalCost: row.annualRenewalCost ?? 0,
    notes: row.notes ?? '',
    migrationCandidate: row.migrationCandidate,
    targetRegistrar: (row.targetRegistrar as DomainRecord['targetRegistrar']) ?? undefined,
    quickSalePrice: recommendation.quickSalePrice,
    targetPrice: recommendation.targetPrice,
    aspirationalPrice: recommendation.aspirationalPrice,
  }
}

function toDomainPageContentRecord(row: DomainPageContentRow): DomainPageContentRecord {
  return {
    domainId: row.domainId,
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    heroHeadline: row.heroHeadline,
    heroSubheadline: row.heroSubheadline,
    bodyContent: row.bodyContent,
    contentStatus: row.contentStatus as DomainPageContentStatus,
    generatedAt: row.generatedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listPublicDomains(binding: D1Database): Promise<PublicPortfolioDomainRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const domainRows = await db.select().from(domains).orderBy(desc(domains.createdAt))
  const contentRows = await db.select().from(domainPageContent)
  const contentByDomainId = new Map(contentRows.map((row) => [row.domainId, toDomainPageContentRecord(row)]))

  return domainRows
    .map(toDomainRecord)
    .filter(isPublicDomain)
    .map((domain) => ({
      ...domain,
      slug: domain.id,
      heroSubheadline: contentByDomainId.get(domain.id)?.heroSubheadline ?? null,
    }))
}

export async function getPublicDomain(binding: D1Database, domainId: string): Promise<PublicDomainRecord | null> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [domainRow] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1)

  if (!domainRow) {
    return null
  }

  const domain = toDomainRecord(domainRow)

  if (!isPublicDomain(domain)) {
    return null
  }

  const [contentRow] = await db.select().from(domainPageContent).where(eq(domainPageContent.domainId, domain.id)).limit(1)

  return {
    slug: domain.id,
    domain,
    content: contentRow ? toDomainPageContentRecord(contentRow) : null,
  }
}

export async function getDomainPageContent(binding: D1Database, domainId: string): Promise<DomainPageContentRecord | null> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [row] = await db.select().from(domainPageContent).where(eq(domainPageContent.domainId, domainId)).limit(1)
  return row ? toDomainPageContentRecord(row) : null
}

export async function upsertDomainPageContent(
  binding: D1Database,
  domainId: string,
  input: DomainPageContentInput,
): Promise<DomainPageContentRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const now = Date.now()
  const [domainRow] = await db.select({ id: domains.id }).from(domains).where(eq(domains.id, domainId)).limit(1)

  if (!domainRow) {
    throw new Error(`Domain ${domainId} not found.`)
  }

  await db
    .insert(domainPageContent)
    .values({
      domainId,
      seoTitle: input.seoTitle,
      metaDescription: input.metaDescription,
      heroHeadline: input.heroHeadline,
      heroSubheadline: input.heroSubheadline,
      bodyContent: input.bodyContent,
      contentStatus: input.contentStatus,
      generatedAt: input.generatedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: domainPageContent.domainId,
      set: {
        seoTitle: input.seoTitle,
        metaDescription: input.metaDescription,
        heroHeadline: input.heroHeadline,
        heroSubheadline: input.heroSubheadline,
        bodyContent: input.bodyContent,
        contentStatus: input.contentStatus,
        generatedAt: input.generatedAt ?? null,
        updatedAt: now,
      },
    })

  const content = await getDomainPageContent(binding, domainId)

  if (!content) {
    throw new Error(`Domain page content for ${domainId} could not be saved.`)
  }

  return content
}

export function getPublicExcerpt(domain: DomainRecord, content: DomainPageContentRecord | null) {
  return buildPortfolioExcerpt(domain, content)
}
