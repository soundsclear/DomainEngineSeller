import { count, eq, inArray, notInArray } from 'drizzle-orm'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { deals, domains, inboundInquiries, leads, outreachThreads } from './schema'

export interface DashboardMetrics {
  totalDomains: number
  listedDomains: number
  totalInquiries: number
  unreadInquiries: number
  activeDeals: number
  totalLeads: number
  sentOutreach: number
  pendingOutreach: number
}

export async function getDashboardMetrics(binding: D1Database): Promise<DashboardMetrics> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const [totalDomainsResult] = await db.select({ value: count() }).from(domains)

  const [listedDomainsResult] = await db
    .select({ value: count() })
    .from(domains)
    .where(eq(domains.status, 'listed'))

  const [totalInquiriesResult] = await db.select({ value: count() }).from(inboundInquiries)

  const [unreadInquiriesResult] = await db
    .select({ value: count() })
    .from(inboundInquiries)
    .where(eq(inboundInquiries.status, 'new'))

  const [activeDealsResult] = await db
    .select({ value: count() })
    .from(deals)
    .where(notInArray(deals.status, ['completed', 'failed', 'cancelled']))

  const [totalLeadsResult] = await db.select({ value: count() }).from(leads)

  const [sentOutreachResult] = await db
    .select({ value: count() })
    .from(outreachThreads)
    .where(eq(outreachThreads.status, 'sent'))

  const [pendingOutreachResult] = await db
    .select({ value: count() })
    .from(outreachThreads)
    .where(inArray(outreachThreads.status, ['draft_prepared', 'approved_to_send']))

  return {
    totalDomains: totalDomainsResult?.value ?? 0,
    listedDomains: listedDomainsResult?.value ?? 0,
    totalInquiries: totalInquiriesResult?.value ?? 0,
    unreadInquiries: unreadInquiriesResult?.value ?? 0,
    activeDeals: activeDealsResult?.value ?? 0,
    totalLeads: totalLeadsResult?.value ?? 0,
    sentOutreach: sentOutreachResult?.value ?? 0,
    pendingOutreach: pendingOutreachResult?.value ?? 0,
  }
}
