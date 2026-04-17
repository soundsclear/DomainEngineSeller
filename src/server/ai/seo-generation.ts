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
  const isDutch = language === 'Dutch'

  return [
    `You are writing high-quality, search-engine-optimised sales copy for the domain name ${domain.domainName}.`,
    `Write all copy in ${language}. Do not mix languages.`,
    '',
    '=== DOMAIN CONTEXT ===',
    semanticGuidance,
    `Category: ${domain.category || 'general'}.`,
    `Notes from the owner: ${domain.notes?.trim() || 'none'}.`,
    `Asking price: EUR ${domain.targetPrice}.`,
    '',
    '=== SEO PRINCIPLES TO FOLLOW ===',
    '1. SEARCH INTENT: Start from the question a serious buyer would type into Google when looking to acquire a domain in this category. Answer that intent directly in the copy.',
    `2. KEYWORD PLACEMENT: Include "${domain.domainName}" naturally in the seoTitle, the first sentence of bodyContent, and at least once more in the body. Include 2-3 related long-tail terms (e.g. "domeinnaam kopen", "te koop", the category term) naturally — never forced.`,
    '3. META DESCRIPTION: Write exactly 140-155 characters. Include the domain name, the strongest benefit, and a clear call to action (e.g. "Doe een bod" or "Submit an offer"). Count characters carefully.',
    '4. SEO TITLE: 50-70 characters. Include the domain name and a transactional modifier ("te koop", "kopen", "for sale", "buy"). No filler words.',
    '5. HERO HEADLINE: Clear, specific, benefit-driven. Not just "[domain] te koop" — explain what the domain enables or who it is for.',
    '6. HERO SUBHEADLINE: 1-2 sentences. Explain the commercial opportunity and who should be interested.',
    '7. BODY CONTENT: 3 short paragraphs in plain text (no markdown, no bullets, no headers):',
    '   - Paragraph 1 (relevance): What the domain name means, what it signals, and why it has built-in search and brand value. Include the domain name naturally.',
    '   - Paragraph 2 (use cases): 2-3 concrete, realistic applications for a business, brand, or campaign in this category. Ground this in the literal domain meaning.',
    '   - Paragraph 3 (call to action): Invite the reader to submit an offer or inquiry. Mention that the transfer process is straightforward. Keep it short and direct.',
    '',
    '=== QUALITY RULES ===',
    '- No keyword stuffing. Each keyword appears at most 2-3 times across the entire output.',
    '- No empty hype ("premium", "brandable", "catchy") unless directly supported by the domain semantics.',
    '- No invented business models that contradict the literal meaning of the domain tokens.',
    '- Copy must feel credible and natural to a serious buyer, not like templated filler.',
    isDutch
      ? '- Address the reader informally ("je", "jouw") in Dutch.'
      : '- Use professional but approachable English.',
    '',
    'Return a JSON object with: seoTitle, metaDescription, heroHeadline, heroSubheadline, bodyContent.',
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
