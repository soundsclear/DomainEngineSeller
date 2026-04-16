import { desc } from 'drizzle-orm'
import { getDb } from './client'
import { auditLog } from './schema'

export interface WriteAuditInput {
  entityType: string
  entityId: string
  action: string
  actor: string
  metadata?: Record<string, unknown>
}

export async function writeAudit(binding: D1Database, input: WriteAuditInput): Promise<void> {
  const db = getDb(binding)
  await db.insert(auditLog).values({
    id: `audit-${crypto.randomUUID()}`,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actor: input.actor,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: Date.now(),
  })
}

export async function listAuditLog(binding: D1Database, limit = 100) {
  const db = getDb(binding)
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit)
}
