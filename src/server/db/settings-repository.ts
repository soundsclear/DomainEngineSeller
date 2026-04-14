import { asc, eq } from 'drizzle-orm'
import { getDb } from './client'
import { ensureOutreachSchema } from './ensure-outreach-schema'
import { settings } from './schema'

export interface SettingRecord {
  id: string
  key: string
  value: unknown
  updatedAt: number
}

function parseSettingValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function serializeSettingValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function mapSetting(row: typeof settings.$inferSelect): SettingRecord {
  return {
    id: row.id,
    key: row.key,
    value: parseSettingValue(row.value),
    updatedAt: row.updatedAt,
  }
}

export async function listSettings(binding: D1Database): Promise<SettingRecord[]> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const rows = await db.select().from(settings).orderBy(asc(settings.key))
  return rows.map(mapSetting)
}

export async function getSetting(binding: D1Database, key: string): Promise<SettingRecord | null> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return row ? mapSetting(row) : null
}

export async function upsertSetting(
  binding: D1Database,
  key: string,
  value: unknown,
): Promise<SettingRecord> {
  await ensureOutreachSchema(binding)
  const db = getDb(binding)
  const existing = await getSetting(binding, key)
  const updatedAt = Date.now()
  const rawValue = serializeSettingValue(value)

  if (existing) {
    await db
      .update(settings)
      .set({ value: rawValue, updatedAt })
      .where(eq(settings.key, key))

    return {
      ...existing,
      value,
      updatedAt,
    }
  }

  const record: SettingRecord = {
    id: `setting-${crypto.randomUUID()}`,
    key,
    value,
    updatedAt,
  }

  await db.insert(settings).values({
    ...record,
    value: rawValue,
  })

  return record
}

export async function getSettingValue(
  binding: D1Database,
  key: string,
  fallback?: unknown,
): Promise<unknown> {
  const record = await getSetting(binding, key)
  return record?.value ?? fallback
}
