import { and, asc, eq } from 'drizzle-orm'
import { canonicalizeWebsiteUrl, normalizeWebsiteKey } from '../ai/website'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { leads } from './schema'

export interface LeadRecord {
  id: string
  domainId: string | null
  companyName: string
  website: string | null
  buyerFitReason: string | null
  priorityScore: number
  doNotContact: boolean
  country: string | null
  source: string | null
  createdAt: number
}

export interface BuyerDiscoveryLeadInput {
  domainId: string
  companyName: string
  website: string
  buyerFitReason: string
  priorityScore: number
  country?: string | null
}

function mapRow(row: typeof leads.$inferSelect): LeadRecord {
  return {
    id: row.id,
    domainId: row.domainId ?? null,
    companyName: row.companyName,
    website: row.website ?? null,
    buyerFitReason: row.buyerFitReason ?? null,
    priorityScore: row.priorityScore,
    doNotContact: row.doNotContact,
    country: row.country ?? null,
    source: row.source ?? null,
    createdAt: row.createdAt,
  }
}

export async function listLeadsForDomain(binding: D1Database, domainId: string): Promise<LeadRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const rows = await db.select().from(leads).where(eq(leads.domainId, domainId)).orderBy(asc(leads.createdAt))
  return rows.map(mapRow)
}

export async function listLeadWebsiteKeysForDomain(binding: D1Database, domainId: string) {
  const items = await listLeadsForDomain(binding, domainId)
  return items
    .map((item) => (item.website ? normalizeWebsiteKey(item.website) : null))
    .filter((key): key is string => Boolean(key))
}

export async function insertBuyerDiscoveryLeads(
  binding: D1Database,
  items: BuyerDiscoveryLeadInput[],
): Promise<LeadRecord[]> {
  await ensureOutreachSchema(binding)

  if (items.length === 0) {
    return []
  }

  const db = getDb(binding)
  const created: LeadRecord[] = []
  const existingKeys = new Set(await listLeadWebsiteKeysForDomain(binding, items[0].domainId))

  for (const item of items) {
    const website = canonicalizeWebsiteUrl(item.website)
    const websiteKey = website ? normalizeWebsiteKey(website) : null

    if (!website || !websiteKey || existingKeys.has(websiteKey)) {
      continue
    }

    const createdAt = Date.now()
    const id = `lead-${crypto.randomUUID()}`

    await db.insert(leads).values({
      id,
      domainId: item.domainId,
      companyName: item.companyName,
      website,
      buyerFitReason: item.buyerFitReason,
      priorityScore: item.priorityScore,
      doNotContact: false,
      country: item.country ?? null,
      source: 'buyer_discovery',
      createdAt,
    })

    existingKeys.add(websiteKey)

    const [saved] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.domainId, item.domainId)))
      .limit(1)

    if (saved) {
      created.push(mapRow(saved))
    }
  }

  return created
}
