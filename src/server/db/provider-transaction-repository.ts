import { desc, eq } from 'drizzle-orm'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { providerTransactions } from './schema'

export interface ProviderTransactionRecord {
  id: string
  dealId: string
  provider: string
  providerReference: string
  status: string
  amount: number | null
  createdAt: number
}

export interface CreateProviderTransactionInput {
  dealId: string
  provider: 'escrow_com' | 'sedo' | 'afternic' | 'other'
  providerReference: string
  status: string
  amount?: number
}

function mapRow(row: typeof providerTransactions.$inferSelect): ProviderTransactionRecord {
  return {
    id: row.id,
    dealId: row.dealId,
    provider: row.provider,
    providerReference: row.providerReference,
    status: row.status,
    amount: row.amount ?? null,
    createdAt: row.createdAt,
  }
}

export async function listProviderTransactions(
  binding: D1Database,
  dealId: string,
): Promise<ProviderTransactionRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const rows = await db
    .select()
    .from(providerTransactions)
    .where(eq(providerTransactions.dealId, dealId))
    .orderBy(desc(providerTransactions.createdAt))
  return rows.map(mapRow)
}

export async function createProviderTransaction(
  binding: D1Database,
  input: CreateProviderTransactionInput,
): Promise<ProviderTransactionRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const id = `ptx-${crypto.randomUUID()}`
  const createdAt = Date.now()

  await db.insert(providerTransactions).values({
    id,
    dealId: input.dealId,
    provider: input.provider,
    providerReference: input.providerReference,
    status: input.status,
    amount: input.amount ?? null,
    createdAt,
  })

  const [saved] = await db
    .select()
    .from(providerTransactions)
    .where(eq(providerTransactions.id, id))
    .limit(1)

  if (!saved) throw new Error('Provider transaction insert failed.')
  return mapRow(saved)
}
