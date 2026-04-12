import { and, count, desc, eq, sum } from 'drizzle-orm'
import type { DomainImportInput } from '../../lib/csv-import'
import { generatePriceRecommendation } from '../../lib/pricing-engine'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { deals, domains, inboundInquiries } from './schema'

export interface DomainRow {
  id: string
  domainName: string
  tld: string
  language: string | null
  category: string | null
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number | null
  annualRenewalCost: number | null
  notes: string | null
  migrationCandidate: boolean
  targetRegistrar: string | null
  createdAt: number
  updatedAt: number
}

export interface DomainApiRecord {
  id: string
  domainName: string
  tld: string
  language: string
  category: string
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
  targetRegistrar: string | null
  quickSalePrice: number
  targetPrice: number
  aspirationalPrice: number
}

export interface CreateDomainInput {
  domainName: string
  tld: string
  language: string
  category: string
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
  targetRegistrar?: string
}

export interface UpdateDomainInput {
  language?: string
  category?: string
  status?: string
  sellMode?: string
  notes?: string
  acquisitionCost?: number
  annualRenewalCost?: number
  migrationCandidate?: boolean
  targetRegistrar?: string | null
}

export interface DashboardMetrics {
  domains: number
  inboundInquiries: number
  dealsInProgress: number
  migrationCandidates: number
  pipelineValue: number
}

function domainSlug(domainName: string): string {
  return domainName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function withPrices(row: DomainRow): DomainApiRecord {
  const rec = generatePriceRecommendation({
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
    status: row.status,
    sellMode: row.sellMode,
    currentRegistrar: row.currentRegistrar,
    acquisitionCost: row.acquisitionCost ?? 0,
    annualRenewalCost: row.annualRenewalCost ?? 0,
    notes: row.notes ?? '',
    migrationCandidate: row.migrationCandidate,
    targetRegistrar: row.targetRegistrar ?? null,
    quickSalePrice: rec.quickSalePrice,
    targetPrice: rec.targetPrice,
    aspirationalPrice: rec.aspirationalPrice,
  }
}

export async function listDomains(binding: D1Database): Promise<DomainApiRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const rows = (await db.select().from(domains).orderBy(desc(domains.createdAt))) as DomainRow[]
  return rows.map(withPrices)
}

export async function getDomain(binding: D1Database, id: string): Promise<DomainApiRecord | null> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [row] = (await db.select().from(domains).where(eq(domains.id, id)).limit(1)) as DomainRow[]
  return row ? withPrices(row) : null
}

export async function createDomain(binding: D1Database, input: CreateDomainInput): Promise<DomainApiRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const now = Date.now()
  const id = domainSlug(input.domainName)

  await db
    .insert(domains)
    .values({
      id,
      domainName: input.domainName,
      tld: input.tld,
      language: input.language,
      category: input.category,
      status: input.status,
      sellMode: input.sellMode,
      currentRegistrar: input.currentRegistrar,
      currentRegistrarReference: null,
      acquisitionCost: input.acquisitionCost,
      annualRenewalCost: input.annualRenewalCost,
      notes: input.notes,
      trafficNotes: null,
      whoisOwnerState: null,
      nameserverState: null,
      authCodeStatus: null,
      migrationCandidate: input.migrationCandidate,
      targetRegistrar: input.targetRegistrar ?? null,
      transferEligibility: null,
      migrationPriority: null,
      migrationNotes: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()

  const domain = await getDomain(binding, id)
  if (!domain) throw new Error(`Domain ${input.domainName} could not be created.`)
  return domain
}

export async function updateDomain(binding: D1Database, id: string, input: UpdateDomainInput): Promise<DomainApiRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  await db
    .update(domains)
    .set({
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sellMode !== undefined ? { sellMode: input.sellMode } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.acquisitionCost !== undefined ? { acquisitionCost: input.acquisitionCost } : {}),
      ...(input.annualRenewalCost !== undefined ? { annualRenewalCost: input.annualRenewalCost } : {}),
      ...(input.migrationCandidate !== undefined ? { migrationCandidate: input.migrationCandidate } : {}),
      ...(input.targetRegistrar !== undefined ? { targetRegistrar: input.targetRegistrar } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(domains.id, id))

  const domain = await getDomain(binding, id)
  if (!domain) throw new Error(`Domain ${id} not found after update.`)
  return domain
}

export async function deleteDomain(binding: D1Database, id: string): Promise<void> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  await db.delete(domains).where(eq(domains.id, id))
}

export async function importDomains(
  binding: D1Database,
  inputs: DomainImportInput[],
): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0

  for (const input of inputs) {
    try {
      await createDomain(binding, input)
      created++
    } catch {
      skipped++
    }
  }

  return { created, skipped }
}

export async function getDashboardMetrics(binding: D1Database): Promise<DashboardMetrics> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const [domainCount] = await db.select({ value: count() }).from(domains)
  const [inquiryCount] = await db.select({ value: count() }).from(inboundInquiries)
  const [dealCount] = await db
    .select({ value: count() })
    .from(deals)
    .where(and(eq(deals.status, 'offer_accepted')))
  const [migrationCount] = await db
    .select({ value: count() })
    .from(domains)
    .where(eq(domains.migrationCandidate, true))
  const [pipeline] = await db.select({ value: sum(deals.agreedPrice) }).from(deals)

  return {
    domains: domainCount?.value ?? 0,
    inboundInquiries: inquiryCount?.value ?? 0,
    dealsInProgress: dealCount?.value ?? 0,
    migrationCandidates: migrationCount?.value ?? 0,
    pipelineValue: Number(pipeline?.value ?? 0),
  }
}
