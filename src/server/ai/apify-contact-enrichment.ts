export type ContactEnrichmentProvider = 'apify'

export type ContactPointKind =
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'website'
  | 'contact_page'
  | 'social'
  | 'other'

export type EnrichmentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'skipped'

export interface NormalizedContactPoint {
  contactType: ContactPointKind
  value: string
  label: string | null
  sourceUrl: string | null
  sourceLabel: string | null
  sourceType: string | null
  confidenceScore: number
  rawMetadata: unknown
  isPrimary: boolean
  verified: boolean
}

export interface NormalizedContactEnrichmentResult {
  provider: ContactEnrichmentProvider
  actorName: string | null
  actorRunId: string | null
  leadId: string | null
  companyName: string | null
  website: string | null
  status: EnrichmentRunStatus
  contactPoints: NormalizedContactPoint[]
  rawMetadata: unknown
}

function clampConfidenceScore(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase())
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  return false
}

function toNullableString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeContactType(value: unknown): ContactPointKind {
  const normalized = toNullableString(value)?.toLowerCase()

  if (normalized) {
    if (normalized.includes('@')) {
      return 'email'
    }

    if (/^\+?[0-9()\s.-]{6,}$/.test(normalized)) {
      return 'phone'
    }

    if (/^https?:\/\//.test(normalized) || normalized.startsWith('www.')) {
      return 'website'
    }
  }

  switch (normalized) {
    case 'email':
    case 'e-mail':
      return 'email'
    case 'phone':
    case 'telephone':
    case 'mobile':
      return 'phone'
    case 'linkedin':
    case 'linkedin_url':
      return 'linkedin'
    case 'website':
    case 'homepage':
      return 'website'
    case 'contact_page':
    case 'contactpage':
      return 'contact_page'
    case 'social':
    case 'social_link':
      return 'social'
    default:
      return 'other'
  }
}

function normalizeRawContactPoint(item: unknown): NormalizedContactPoint | null {
  if (typeof item === 'string') {
    const trimmed = item.trim()
    if (!trimmed) {
      return null
    }

    return {
      contactType: normalizeContactType(trimmed),
      value: trimmed,
      label: null,
      sourceUrl: null,
      sourceLabel: null,
      sourceType: null,
      confidenceScore: 0,
      rawMetadata: item,
      isPrimary: false,
      verified: false,
    }
  }

  if (!item || typeof item !== 'object') {
    return null
  }

  const record = item as Record<string, unknown>
  const value =
    toNullableString(record.value) ??
    toNullableString(record.email) ??
    toNullableString(record.phone) ??
    toNullableString(record.url) ??
    toNullableString(record.href) ??
    toNullableString(record.contactEmail) ??
    toNullableString(record.contactPhone)

  if (!value) {
    return null
  }

  return {
    contactType: normalizeContactType(
      record.contactType ?? record.type ?? record.kind ?? record.channel ?? record.sourceType ?? value,
    ),
    value,
    label: toNullableString(record.label ?? record.name ?? record.contactName),
    sourceUrl: toNullableString(record.sourceUrl ?? record.pageUrl ?? record.page ?? record.url),
    sourceLabel: toNullableString(record.sourceLabel ?? record.sourceName ?? record.pageName),
    sourceType: toNullableString(record.sourceType ?? record.source),
    confidenceScore: clampConfidenceScore(record.confidenceScore ?? record.confidence ?? record.score),
    rawMetadata: record.metadata ?? record.raw ?? item,
    isPrimary: toBoolean(record.isPrimary ?? record.primary),
    verified: toBoolean(record.verified ?? record.isVerified),
  }
}

function collectCandidateArrays(record: Record<string, unknown>) {
  const candidates: unknown[] = []
  const possibleKeys = [
    'contactPoints',
    'contacts',
    'emails',
    'emailAddresses',
    'phones',
    'phoneNumbers',
    'socialLinks',
    'links',
  ]

  for (const key of possibleKeys) {
    const value = record[key]
    if (Array.isArray(value)) {
      candidates.push(...value)
    }
  }

  return candidates
}

export function normalizeApifyContactEnrichmentResult(
  input: unknown,
): NormalizedContactEnrichmentResult | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const record = input as Record<string, unknown>
  const rawMetadata = record.rawMetadata ?? record.metadata ?? input
  const contactPoints = collectCandidateArrays(record)
    .map((item) => normalizeRawContactPoint(item))
    .filter((item): item is NormalizedContactPoint => Boolean(item))

  if (contactPoints.length === 0) {
    const singlePoint = normalizeRawContactPoint(record)
    if (singlePoint) {
      contactPoints.push(singlePoint)
    }
  }

  return {
    provider: 'apify',
    actorName: toNullableString(record.actorName ?? record.actor ?? record.actorTitle),
    actorRunId: toNullableString(record.actorRunId ?? record.runId ?? record.apifyRunId),
    leadId: toNullableString(record.leadId ?? record.lead_id),
    companyName: toNullableString(record.companyName ?? record.company ?? record.name),
    website: toNullableString(record.website ?? record.url ?? record.domain),
    status: (toNullableString(record.status) as EnrichmentRunStatus | null) ?? 'succeeded',
    contactPoints,
    rawMetadata,
  }
}
