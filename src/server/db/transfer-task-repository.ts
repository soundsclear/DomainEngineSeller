import { desc, eq } from 'drizzle-orm'
import { generateXelTransferPackage } from '../../lib/xel-transfer'
import type { RegistrarActionType } from '../../types/domain'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { contacts, deals, domains, leads, transferTasks } from './schema'

export interface GenerateTransferTaskInput {
  dealId: string
  actionType: RegistrarActionType
  sellerXelAccount?: string
  buyerXelAccount?: string
  buyerRegistrar?: string
}

export interface TransferTaskView {
  id: string
  dealId: string
  domainName: string | null
  companyName: string | null
  registrar: string
  actionType: string
  status: string
  deadlineAt: number | null
  manualCheckpointRequired: boolean
  createdAt: number
  checklistJson: string
}

export async function generateTransferTaskForDeal(binding: D1Database, input: GenerateTransferTaskInput) {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  const [deal] = await db
    .select({
      id: deals.id,
      domainId: deals.domainId,
      leadId: deals.leadId,
      agreedPrice: deals.agreedPrice,
      domainName: domains.domainName,
      companyName: leads.companyName,
      contactName: contacts.contactName,
      contactEmail: contacts.contactEmail,
    })
    .from(deals)
    .leftJoin(domains, eq(deals.domainId, domains.id))
    .leftJoin(leads, eq(deals.leadId, leads.id))
    .leftJoin(contacts, eq(contacts.leadId, leads.id))
    .where(eq(deals.id, input.dealId))
    .limit(1)

  if (!deal || !deal.domainName || !deal.agreedPrice) {
    throw new Error('Deal is missing domain or price context needed for transfer generation.')
  }

  const pkg = generateXelTransferPackage({
    domainName: deal.domainName,
    transferMode: input.actionType,
    sellerXelAccount: input.sellerXelAccount ?? 'seller-xel',
    buyer: {
      name: deal.contactName ?? deal.companyName ?? 'Buyer',
      email: deal.contactEmail ?? 'buyer@example.com',
      xelAccount: input.buyerXelAccount,
      registrar: input.buyerRegistrar,
    },
    dealReference: deal.id,
    agreedPrice: deal.agreedPrice,
    currency: 'EUR',
  })

  const deadlineAt = pkg.deadlines.length > 0 ? Date.parse(pkg.deadlines[0].absoluteDate) : null
  const id = `transfer-${crypto.randomUUID()}`
  const createdAt = Date.now()

  await db.insert(transferTasks).values({
    id,
    dealId: deal.id,
    registrar: 'xel',
    actionType: input.actionType,
    status: 'prepared',
    checklistJson: JSON.stringify(pkg),
    deadlineAt,
    manualCheckpointRequired: pkg.manualCheckpoints.some((item) => item.blocksNextStep),
    createdAt,
  })

  return {
    id,
    dealId: deal.id,
    domainName: deal.domainName,
    companyName: deal.companyName,
    registrar: 'xel',
    actionType: input.actionType,
    status: 'prepared',
    deadlineAt,
    manualCheckpointRequired: pkg.manualCheckpoints.some((item) => item.blocksNextStep),
    createdAt,
    checklistJson: JSON.stringify(pkg),
  }
}

export async function listTransferTasks(binding: D1Database): Promise<TransferTaskView[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)

  return db
    .select({
      id: transferTasks.id,
      dealId: transferTasks.dealId,
      domainName: domains.domainName,
      companyName: leads.companyName,
      registrar: transferTasks.registrar,
      actionType: transferTasks.actionType,
      status: transferTasks.status,
      deadlineAt: transferTasks.deadlineAt,
      manualCheckpointRequired: transferTasks.manualCheckpointRequired,
      createdAt: transferTasks.createdAt,
      checklistJson: transferTasks.checklistJson,
    })
    .from(transferTasks)
    .leftJoin(deals, eq(transferTasks.dealId, deals.id))
    .leftJoin(domains, eq(deals.domainId, domains.id))
    .leftJoin(leads, eq(deals.leadId, leads.id))
    .orderBy(desc(transferTasks.createdAt)) as Promise<TransferTaskView[]>
}
