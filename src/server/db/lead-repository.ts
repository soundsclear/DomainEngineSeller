import { and, asc, eq } from 'drizzle-orm'
import { canonicalizeWebsiteUrl, normalizeWebsiteKey } from '../ai/website'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { contacts, leads } from './schema'

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
  contactName: string | null
  contactEmail: string | null
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
    contactName: null,
    contactEmail: null,
    createdAt: row.createdAt,
  }
}

export async function listLeadsForDomain(binding: D1Database, domainId: string): Promise<LeadRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const rows = await db
    .select({
      id: leads.id,
      domainId: leads.domainId,
      companyName: leads.companyName,
      website: leads.website,
      buyerFitReason: leads.buyerFitReason,
      priorityScore: leads.priorityScore,
      doNotContact: leads.doNotContact,
      country: leads.country,
      source: leads.source,
      createdAt: leads.createdAt,
      contactName: contacts.contactName,
      contactEmail: contacts.contactEmail,
    })
    .from(leads)
    .leftJoin(contacts, eq(contacts.leadId, leads.id))
    .where(eq(leads.domainId, domainId))
    .orderBy(asc(leads.createdAt))

  return rows.map((row) => ({
    id: row.id,
    domainId: row.domainId ?? null,
    companyName: row.companyName,
    website: row.website ?? null,
    buyerFitReason: row.buyerFitReason ?? null,
    priorityScore: row.priorityScore,
    doNotContact: row.doNotContact,
    country: row.country ?? null,
    source: row.source ?? null,
    contactName: row.contactName ?? null,
    contactEmail: row.contactEmail ?? null,
    createdAt: row.createdAt,
  }))
}

export async function getLeadById(binding: D1Database, leadId: string): Promise<LeadRecord | null> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [row] = await db
    .select({
      id: leads.id,
      domainId: leads.domainId,
      companyName: leads.companyName,
      website: leads.website,
      buyerFitReason: leads.buyerFitReason,
      priorityScore: leads.priorityScore,
      doNotContact: leads.doNotContact,
      country: leads.country,
      source: leads.source,
      createdAt: leads.createdAt,
      contactName: contacts.contactName,
      contactEmail: contacts.contactEmail,
    })
    .from(leads)
    .leftJoin(contacts, eq(contacts.leadId, leads.id))
    .where(eq(leads.id, leadId))
    .limit(1)

  if (!row) return null

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
    contactName: row.contactName ?? null,
    contactEmail: row.contactEmail ?? null,
    createdAt: row.createdAt,
  }
}

export async function upsertLeadContact(
  binding: D1Database,
  input: { leadId: string; contactName: string; contactEmail: string },
) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const existingLead = await getLeadById(binding, input.leadId)

  if (!existingLead) {
    throw new Error('Lead not found.')
  }

  const now = Date.now()
  const [existingContact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.leadId, input.leadId))
    .limit(1)

  if (existingContact) {
    await db
      .update(contacts)
      .set({
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPageUrl: existingLead.website,
      })
      .where(eq(contacts.id, existingContact.id))
  } else {
    await db.insert(contacts).values({
      id: `contact-${crypto.randomUUID()}`,
      leadId: input.leadId,
      contactName: input.contactName,
      contactRole: null,
      contactEmail: input.contactEmail,
      contactPageUrl: existingLead.website,
      createdAt: now,
    })
  }

  return getLeadById(binding, input.leadId)
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
