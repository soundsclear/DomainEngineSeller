import { z } from 'zod'
import type { DomainApiRecord } from '../db/domain-repository'
import { getDomain } from '../db/domain-repository'
import {
  insertBuyerDiscoveryLeads,
  listLeadWebsiteKeysForDomain,
  type BuyerDiscoveryLeadInput,
  type LeadRecord,
} from '../db/lead-repository'
import { createAnthropicClientFromEnv, type StructuredAiClient } from './anthropic'
import { createBraveSearchClientFromEnv, type BraveSearchResultItem, type SearchClient } from './brave-search'
import type { AnthropicEnvLike, BraveSearchEnvLike } from './config'
import { buildSemanticGuidance } from './semantic-guidance'
import { canonicalizeWebsiteUrl, normalizeWebsiteKey } from './website'

const buyerDiscoveryQuerySchema = z.object({
  queries: z
    .array(
      z.object({
        angle: z.string().min(2).max(60),
        query: z.string().min(4).max(180),
      }),
    )
    .min(1)
    .max(8),
})

const buyerDiscoveryLeadSchema = z.object({
  leads: z
    .array(
      z.object({
        companyName: z.string().min(2).max(120),
        website: z.string().min(4).max(200),
        buyerFitReason: z.string().min(20).max(400),
        angle: z.string().min(2).max(60),
        priorityScore: z.number().int().min(1).max(10),
        country: z.string().min(2).max(60).optional(),
      }),
    )
    .max(10),
})

const rawBuyerDiscoveryLeadSchema = z.object({
  leads: z
    .array(
      z.object({
        companyName: z.string().min(1).max(200).optional(),
        company_name: z.string().min(1).max(200).optional(),
        company: z.string().min(1).max(200).optional(),
        website: z.string().min(1).max(240).optional(),
        url: z.string().min(1).max(240).optional(),
        domain: z.string().min(1).max(240).optional(),
        buyerFitReason: z.string().min(1).max(500).optional(),
        buyer_fit_reason: z.string().min(1).max(500).optional(),
        reason: z.string().min(1).max(500).optional(),
        angle: z.string().min(1).max(80).optional(),
        buyerAngle: z.string().min(1).max(80).optional(),
        queryAngle: z.string().min(1).max(80).optional(),
        priorityScore: z.number().int().min(1).max(10).optional(),
        priority_score: z.number().int().min(1).max(10).optional(),
        score: z.number().int().min(1).max(10).optional(),
        country: z.string().min(2).max(60).optional(),
      }),
    )
    .max(12),
})

export interface BuyerDiscoveryQueryPlanItem {
  angle: string
  query: string
}

export interface BuyerDiscoveryCandidate {
  companyName: string
  website: string
  buyerFitReason: string
  angle: string
  priorityScore: number
  country: string | null
}

export interface BuyerDiscoveryRunResult {
  queryPlan: BuyerDiscoveryQueryPlanItem[]
  searchResults: Array<{
    angle: string
    query: string
    results: BraveSearchResultItem[]
  }>
  searchErrors: Array<{
    angle: string
    query: string
    message: string
  }>
  newCandidates: BuyerDiscoveryCandidate[]
  skippedWebsiteKeys: string[]
  rawLeadCount: number
}

export interface DiscoverAndStoreBuyerLeadsInput extends AnthropicEnvLike, BraveSearchEnvLike {
  binding: D1Database
  domainId: string
  fetchImpl?: typeof fetch
}

function buildQueryGenerationPrompt(domain: DomainApiRecord) {
  const semanticGuidance = buildSemanticGuidance(domain)

  return [
    `Generate search queries to find likely buyers for the domain ${domain.domainName}.`,
    'Think broadly: direct buyers, SEO-motivated buyers, adjacent verticals, defensive buyers, and geographic relevance where justified.',
    'Do not use naive keyword matching. Reason from the literal meaning of the domain and realistic commercial intent.',
    semanticGuidance,
    `Category: ${domain.category}.`,
    `Language: ${domain.language}.`,
    `Notes: ${domain.notes || 'none'}.`,
    'Prefer queries that surface companies likely to sell the literal product, concept, or category implied by the domain.',
    'Do not drift into unrelated service businesses just because part of the word resembles another word.',
    'Return 5 to 8 distinct search queries. Each query should be specific enough to find companies rather than general articles.',
    'Return JSON as { "queries": [{ "angle": "...", "query": "..." }] }.',
  ].join('\n')
}

function buildSynthesisPrompt(
  domain: DomainApiRecord,
  searchResults: BuyerDiscoveryRunResult['searchResults'],
) {
  const semanticGuidance = buildSemanticGuidance(domain)

  return [
    `You are selecting likely end buyers for the domain ${domain.domainName}.`,
    'Use the search results below. Ignore irrelevant companies and noisy directory pages where possible.',
    semanticGuidance,
    'Reject companies that fit only a mistaken reinterpretation of the domain label.',
    'Return at most 10 deduplicated companies with one website per company.',
    'buyerFitReason should be 1-2 grounded sentences, not hype.',
    'priorityScore should be 1-10, where 10 means especially plausible end-buyer fit.',
    'Return JSON as { "leads": [...] }.',
    JSON.stringify(
      searchResults.map((item) => ({
        angle: item.angle,
        query: item.query,
        results: item.results.map((result) => ({
          title: result.title,
          url: result.url,
          description: result.description,
          extraSnippets: result.extraSnippets,
        })),
      })),
    ),
  ].join('\n\n')
}

function clampPriorityScore(score: number) {
  return Math.max(1, Math.min(10, Math.round(score)))
}

function normalizeLeadField(value: string | undefined, fallback = '') {
  return value?.trim() || fallback
}

function normalizeBuyerFitReason(value: string) {
  const trimmed = value.trim()
  if (trimmed.length >= 20) {
    return trimmed
  }

  return 'Potential buyer discovered through semantic search results and domain-fit reasoning.'
}

function normalizeBuyerDiscoveryLeadOutput(payload: z.infer<typeof rawBuyerDiscoveryLeadSchema>) {
  return buyerDiscoveryLeadSchema.parse({
    leads: payload.leads
      .map((lead) => ({
        companyName: normalizeLeadField(lead.companyName ?? lead.company_name ?? lead.company),
        website: normalizeLeadField(lead.website ?? lead.url ?? lead.domain),
        buyerFitReason: normalizeBuyerFitReason(
          normalizeLeadField(lead.buyerFitReason ?? lead.buyer_fit_reason ?? lead.reason),
        ),
        angle: normalizeLeadField(lead.angle ?? lead.buyerAngle ?? lead.queryAngle, 'general'),
        priorityScore: clampPriorityScore(lead.priorityScore ?? lead.priority_score ?? lead.score ?? 5),
        country: lead.country?.trim(),
      }))
      .filter((lead) => lead.companyName && lead.website && lead.companyName.length >= 2),
  })
}

function dedupeQueryPlan(items: BuyerDiscoveryQueryPlanItem[]) {
  const seen = new Set<string>()
  const deduped: BuyerDiscoveryQueryPlanItem[] = []

  for (const item of items) {
    const key = item.query.trim().toLowerCase()
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push({
      angle: item.angle.trim(),
      query: item.query.trim(),
    })
  }

  return deduped.slice(0, 8)
}

export async function runBuyerDiscovery(options: {
  domain: DomainApiRecord
  client: StructuredAiClient
  searchClient: SearchClient
  existingLeadWebsiteKeys?: string[]
}): Promise<BuyerDiscoveryRunResult> {
  const queryResponse = await options.client.generateObject({
    schema: buyerDiscoveryQuerySchema,
    system: 'You generate targeted buyer-discovery search plans and output only JSON.',
    prompt: buildQueryGenerationPrompt(options.domain),
    maxTokens: 1_000,
    temperature: 0.3,
  })

  const queryPlan = dedupeQueryPlan(queryResponse.data.queries)
  const searchResponses = await Promise.all(
    queryPlan.map(async (item) => {
      try {
        const response = await options.searchClient.search({
          query: item.query,
          count: 6,
          country: options.domain.language === 'NL' ? 'NL' : 'US',
          searchLang: options.domain.language === 'NL' ? 'nl' : 'en',
        })

        return {
          ok: true as const,
          angle: item.angle,
          query: item.query,
          results: response.results,
        }
      } catch (error) {
        return {
          ok: false as const,
          angle: item.angle,
          query: item.query,
          message: error instanceof Error ? error.message : 'Unknown Brave search error.',
        }
      }
    }),
  )

  const searchResults = searchResponses.filter((item) => item.ok).map((item) => ({
    angle: item.angle,
    query: item.query,
    results: item.results,
  }))
  const searchErrors = searchResponses.filter((item) => !item.ok).map((item) => ({
    angle: item.angle,
    query: item.query,
    message: item.message,
  }))

  if (searchResults.length === 0) {
    return {
      queryPlan,
      searchResults: [],
      searchErrors,
      newCandidates: [],
      skippedWebsiteKeys: [],
      rawLeadCount: 0,
    }
  }

  const synthesisResponse = await options.client.generateObject({
    schema: rawBuyerDiscoveryLeadSchema,
    system: 'You evaluate potential end buyers for a domain and output only JSON.',
    prompt: buildSynthesisPrompt(options.domain, searchResults),
    maxTokens: 1_800,
    temperature: 0.2,
  })

  const synthesizedLeads = normalizeBuyerDiscoveryLeadOutput(synthesisResponse.data)

  const existing = new Set(options.existingLeadWebsiteKeys ?? [])
  const seen = new Set<string>()
  const newCandidates: BuyerDiscoveryCandidate[] = []
  const skippedWebsiteKeys: string[] = []

  for (const lead of synthesizedLeads.leads) {
    const website = canonicalizeWebsiteUrl(lead.website)
    const websiteKey = website ? normalizeWebsiteKey(website) : null

    if (!website || !websiteKey || seen.has(websiteKey) || existing.has(websiteKey)) {
      if (websiteKey) {
        skippedWebsiteKeys.push(websiteKey)
      }
      continue
    }

    seen.add(websiteKey)
    newCandidates.push({
      companyName: lead.companyName.trim(),
      website,
      buyerFitReason: lead.buyerFitReason.trim(),
      angle: lead.angle.trim(),
      priorityScore: clampPriorityScore(lead.priorityScore),
      country: lead.country?.trim() ?? null,
    })
  }

  return {
    queryPlan,
    searchResults,
    searchErrors,
    newCandidates,
    skippedWebsiteKeys,
    rawLeadCount: synthesizedLeads.leads.length,
  }
}

function toLeadInsert(domainId: string, candidate: BuyerDiscoveryCandidate): BuyerDiscoveryLeadInput {
  return {
    domainId,
    companyName: candidate.companyName,
    website: candidate.website,
    buyerFitReason: candidate.buyerFitReason,
    priorityScore: candidate.priorityScore,
    country: candidate.country,
  }
}

export async function discoverAndStoreBuyerLeads({
  binding,
  domainId,
  fetchImpl,
  ...env
}: DiscoverAndStoreBuyerLeadsInput): Promise<BuyerDiscoveryRunResult & { created: LeadRecord[] }> {
  const domain = await getDomain(binding, domainId)
  if (!domain) {
    throw new Error(`Domain ${domainId} not found.`)
  }

  const existingLeadWebsiteKeys = await listLeadWebsiteKeysForDomain(binding, domainId)
  const client = createAnthropicClientFromEnv(env, fetchImpl)
  const searchClient = createBraveSearchClientFromEnv(env, fetchImpl)
  const run = await runBuyerDiscovery({
    domain,
    client,
    searchClient,
    existingLeadWebsiteKeys,
  })

  const created = await insertBuyerDiscoveryLeads(
    binding,
    run.newCandidates.map((candidate) => toLeadInsert(domainId, candidate)),
  )

  return {
    ...run,
    created,
  }
}
