import { demoDomains, demoLeads } from '../../lib/demo-data'
import { contacts, domains, leads } from './schema'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'

export async function ensureDemoLeadAndDomain(binding: D1Database, leadId: string) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const lead = demoLeads.find((item) => item.id === leadId)

  if (!lead) {
    throw new Error('Lead not found.')
  }

  const domain = demoDomains.find((item) => item.id === lead.domainId)

  if (!domain) {
    throw new Error('Linked domain not found for lead.')
  }

  const now = Date.now()

  await db
    .insert(domains)
    .values({
      id: domain.id,
      domainName: domain.domainName,
      tld: domain.tld,
      language: domain.language,
      notes: domain.notes,
      category: domain.category,
      status: domain.status,
      sellMode: domain.sellMode,
      currentRegistrar: domain.currentRegistrar,
      currentRegistrarReference: null,
      acquisitionCost: domain.acquisitionCost,
      annualRenewalCost: domain.annualRenewalCost,
      trafficNotes: null,
      whoisOwnerState: null,
      nameserverState: null,
      authCodeStatus: null,
      migrationCandidate: domain.migrationCandidate,
      targetRegistrar: domain.targetRegistrar ?? null,
      transferEligibility: null,
      migrationPriority: null,
      migrationNotes: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()

  await db
    .insert(leads)
    .values({
      id: lead.id,
      domainId: lead.domainId,
      companyName: lead.companyName,
      website: lead.website,
      buyerFitReason: lead.buyerFitReason,
      priorityScore: lead.priorityScore,
      doNotContact: lead.doNotContact,
      country: lead.country,
      source: lead.source,
      createdAt: now,
    })
    .onConflictDoNothing()

  await db
    .insert(contacts)
    .values({
      id: `contact-${lead.id}`,
      leadId: lead.id,
      contactName: lead.contactName,
      contactRole: null,
      contactEmail: lead.contactEmail,
      contactPageUrl: lead.website,
      createdAt: now,
    })
    .onConflictDoNothing()

  return { lead, domain }
}
