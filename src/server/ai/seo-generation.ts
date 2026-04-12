import { z } from 'zod'
import type { DomainApiRecord } from '../db/domain-repository'
import { getDomain } from '../db/domain-repository'
import { getDomainPageContent, upsertDomainPageContent } from '../db/public-domain-repository'
import { createAnthropicClientFromEnv, type StructuredAiClient } from './anthropic'
import type { AnthropicEnvLike } from './config'
import { buildSemanticGuidance } from './semantic-guidance'

const domainSeoContentSchema = z.object({
  seoTitle: z.string().min(20).max(70),
  metaDescription: z.string().min(80).max(170),
  heroHeadline: z.string().min(8).max(120),
  heroSubheadline: z.string().min(20).max(220),
  bodyContent: z.string().min(120).max(2_500),
})

const rawDomainSeoContentSchema = z.object({
  seoTitle: z.string().min(1).max(240),
  metaDescription: z.string().min(1).max(400),
  heroHeadline: z.string().min(1).max(240),
  heroSubheadline: z.string().min(1).max(400),
  bodyContent: z.string().min(1).max(4_000),
})

export type DomainSeoContentDraft = z.infer<typeof domainSeoContentSchema>
type RawDomainSeoContentDraft = z.infer<typeof rawDomainSeoContentSchema>

export interface SeoGenerationResult {
  content: DomainSeoContentDraft
  provider: 'anthropic'
  model: string
  rawText: string
}

interface GenerateDomainSeoContentInput {
  domain: DomainApiRecord
  existingContentStatus?: 'draft' | 'generated' | 'manual' | null
  client: StructuredAiClient
  force?: boolean
}

export interface GenerateAndStoreDomainSeoContentInput extends AnthropicEnvLike {
  binding: D1Database
  domainId: string
  force?: boolean
  fetchImpl?: typeof fetch
}

function inferCopyLanguage(domain: DomainApiRecord) {
  if (domain.language === 'NL' || domain.tld.toLowerCase() === '.nl') {
    return 'Dutch'
  }

  return 'English'
}

function buildSeoPrompt(domain: DomainApiRecord) {
  const language = inferCopyLanguage(domain)
  const semanticGuidance = buildSemanticGuidance(domain)

  return [
    `You are writing sales-page SEO copy for the domain ${domain.domainName}.`,
    `Write in ${language}.`,
    'Reason from the literal meaning of the domain, likely buyer intent, SEO relevance, and realistic commercial use cases.',
    'Avoid empty hype such as "premium domain" unless it is directly justified by the semantics.',
    semanticGuidance,
    `Category: ${domain.category}.`,
    `Language: ${domain.language}.`,
    `Current notes: ${domain.notes || 'none'}.`,
    `Target price guidance: EUR ${domain.targetPrice}.`,
    'The copy should feel natural on a public sales page and still read credibly to a serious buyer.',
    'bodyContent should be plain text with short paragraphs, not markdown bullets.',
    'Keep seoTitle under 70 characters.',
    'Keep metaDescription under 170 characters.',
    'Do not invent a business model that contradicts the literal meaning of the domain.',
    'Do not shift from products to services unless the literal tokens or notes clearly support services.',
    'Return an object with seoTitle, metaDescription, heroHeadline, heroSubheadline, and bodyContent.',
  ].join('\n')
}

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function trimToMax(value: string, max: number) {
  const cleaned = cleanWhitespace(value)
  if (cleaned.length <= max) {
    return cleaned
  }

  return `${cleaned.slice(0, Math.max(0, max - 1)).trim()}…`
}

function normalizeBodyContent(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => cleanWhitespace(paragraph))
    .filter(Boolean)
    .join('\n\n')
}

function normalizeSeoContentDraft(draft: RawDomainSeoContentDraft): DomainSeoContentDraft {
  return domainSeoContentSchema.parse({
    seoTitle: trimToMax(draft.seoTitle, 70),
    metaDescription: trimToMax(draft.metaDescription, 170),
    heroHeadline: trimToMax(draft.heroHeadline, 120),
    heroSubheadline: trimToMax(draft.heroSubheadline, 220),
    bodyContent: normalizeBodyContent(draft.bodyContent).slice(0, 2_500).trim(),
  })
}

export async function generateDomainSeoContent({
  domain,
  existingContentStatus,
  client,
  force = false,
}: GenerateDomainSeoContentInput): Promise<SeoGenerationResult> {
  if (existingContentStatus === 'manual' && !force) {
    throw new Error('Manual domain page content exists. Regeneration requires force=true.')
  }

  const response = await client.generateObject({
    schema: rawDomainSeoContentSchema,
    system: 'You write grounded domain sales copy. Output only structured JSON.',
    prompt: buildSeoPrompt(domain),
    maxTokens: 1_500,
    temperature: 0.2,
  })

  return {
    content: normalizeSeoContentDraft(response.data),
    provider: 'anthropic',
    model: response.model,
    rawText: response.rawText,
  }
}

export async function generateAndStoreDomainSeoContent({
  binding,
  domainId,
  force = false,
  fetchImpl,
  ...env
}: GenerateAndStoreDomainSeoContentInput) {
  const domain = await getDomain(binding, domainId)
  if (!domain) {
    throw new Error(`Domain ${domainId} not found.`)
  }

  const existingContent = await getDomainPageContent(binding, domainId)
  const client = createAnthropicClientFromEnv(env, fetchImpl)
  const generated = await generateDomainSeoContent({
    domain,
    existingContentStatus: existingContent?.contentStatus ?? null,
    client,
    force,
  })

  const content = await upsertDomainPageContent(binding, domainId, {
    ...generated.content,
    contentStatus: 'generated',
    generatedAt: Date.now(),
  })

  return {
    domain,
    content,
    provider: generated.provider,
    model: generated.model,
  }
}
