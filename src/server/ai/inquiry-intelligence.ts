import { z } from 'zod'
import type { StructuredAiClient } from './anthropic'

export type InquiryClassification = 'serious_offer' | 'info_request' | 'lowball' | 'spam'

const classificationOutputSchema = z.object({
  classification: z.enum(['serious_offer', 'info_request', 'lowball', 'spam']),
  reason: z.string().min(10).max(500),
})

const draftReplyOutputSchema = z.object({
  subject: z.string().min(5).max(200),
  body: z.string().min(20).max(2_000),
})

const negotiateCounterOutputSchema = z.object({
  suggestedPrice: z.number().int().positive(),
  reasoning: z.string().min(20).max(800),
  draftSubject: z.string().min(5).max(200),
  draftBody: z.string().min(20).max(2_000),
})

export interface ClassifyInquiryInput {
  inquiry: {
    senderName: string | null
    senderEmail: string
    message: string
    offerAmount: number | null
    inquiryType: string
  }
  domain: {
    domainName: string
    targetPrice: number | null
    quickSalePrice: number | null
  }
  client?: StructuredAiClient
}

export interface ClassifyInquiryResult {
  classification: InquiryClassification
  reason: string
}

export interface DraftReplyInput {
  inquiry: {
    senderName: string | null
    message: string
    offerAmount: number | null
  }
  domain: {
    domainName: string
    targetPrice: number | null
    quickSalePrice: number | null
    language: string | null
    tld: string
  }
  classification: InquiryClassification
  client?: StructuredAiClient
}

export interface DraftReplyResult {
  subject: string
  body: string
}

export interface NegotiateCounterInput {
  inquiry: {
    senderName: string | null
    senderEmail: string
    message: string
    offerAmount: number | null
  }
  domain: {
    domainName: string
    quickSalePrice: number | null
    targetPrice: number | null
    aspirationalPrice: number | null
    language: string | null
    tld: string
  }
  threadHistory: Array<{
    direction: string
    subject: string | null
    body: string
    sentAt: number | null
    createdAt: number
  }>
  client?: StructuredAiClient
}

export interface NegotiateCounterResult {
  suggestedPrice: number
  reasoning: string
  draftSubject: string
  draftBody: string
}

function buildClassificationPrompt(input: ClassifyInquiryInput): string {
  const parts = [
    `You are reviewing an inbound inquiry for the domain ${input.domain.domainName}.`,
    `Sender: ${input.inquiry.senderName ?? 'Unknown'} <${input.inquiry.senderEmail}>`,
    `Message: ${input.inquiry.message}`,
  ]

  if (input.inquiry.offerAmount != null) {
    parts.push(`Offer amount: EUR ${input.inquiry.offerAmount}`)
    if (input.domain.quickSalePrice != null) {
      parts.push(`Minimum acceptable (quick sale): EUR ${input.domain.quickSalePrice}`)
    }
    if (input.domain.targetPrice != null) {
      parts.push(`Target price: EUR ${input.domain.targetPrice}`)
    }
  }

  parts.push(
    'Classify the inquiry intent:',
    '  serious_offer — genuine buyer at or near target price, or a credible business showing strong intent',
    '  info_request — asking about the domain but no clear financial commitment',
    '  lowball — offer significantly below the quick sale price',
    '  spam — unrelated, automated, or clearly not a domain purchase inquiry',
    'Return JSON with classification and a brief reason (1–2 sentences).',
  )

  return parts.join('\n')
}

function buildDraftReplyPrompt(input: DraftReplyInput): string {
  const language =
    input.domain.tld === '.nl' || input.domain.language === 'NL' ? 'Dutch' : 'English'

  const parts = [
    `You are drafting a professional reply to an inbound inquiry for the domain ${input.domain.domainName}.`,
    `Write in ${language}.`,
    `Sender: ${input.inquiry.senderName ?? 'the inquirer'}`,
    `Their message: ${input.inquiry.message}`,
  ]

  if (input.inquiry.offerAmount != null) {
    parts.push(`Their offer: EUR ${input.inquiry.offerAmount}`)
  }
  if (input.domain.targetPrice != null) {
    parts.push(`Your asking price: EUR ${input.domain.targetPrice}`)
  }

  parts.push(
    `Classification of this inquiry: ${input.classification}`,
    'Be professional and personalized. Do not auto-accept or auto-reject any offer.',
    'Invite a conversation. Keep it brief (under 120 words).',
    'Body should be plain text with no markdown formatting.',
    'Return JSON with subject and body.',
  )

  return parts.join('\n')
}

function buildNegotiationPrompt(input: NegotiateCounterInput): string {
  const language =
    input.domain.tld === '.nl' || input.domain.language === 'NL' ? 'Dutch' : 'English'

  const history = input.threadHistory
    .map((message, index) => {
      const timestamp = new Date(message.sentAt ?? message.createdAt).toISOString()
      const subjectLine = message.subject ? `Subject: ${message.subject}\n` : ''
      return [
        `Message ${index + 1} (${message.direction}, ${timestamp})`,
        `${subjectLine}Body: ${message.body}`,
      ].join('\n')
    })
    .join('\n\n')

  const parts = [
    `You are negotiating the sale of the domain ${input.domain.domainName}.`,
    `Write the response in ${language}.`,
    `Buyer: ${input.inquiry.senderName ?? 'Unknown'} <${input.inquiry.senderEmail}>`,
    `Original inquiry: ${input.inquiry.message}`,
    `Pricing guardrails: quick sale EUR ${input.domain.quickSalePrice ?? 'unknown'}, target EUR ${input.domain.targetPrice ?? 'unknown'}, aspirational EUR ${input.domain.aspirationalPrice ?? 'unknown'}.`,
    `Initial offer: ${input.inquiry.offerAmount != null ? `EUR ${input.inquiry.offerAmount}` : 'none stated'}.`,
    'Use the full thread history for conversational context and negotiation continuity.',
    'Choose the counter-offer price based only on the pricing guardrails and the latest buyer offer visible in the thread.',
    'Do not accept the offer automatically. Stay professional, confident, and brief.',
    'Reasoning should be 1-2 concise sentences.',
    'Draft body should be plain text with no markdown formatting and under 140 words.',
    'Return JSON with suggestedPrice, reasoning, draftSubject, and draftBody.',
    `Thread history:\n${history || 'No prior thread history.'}`,
  ]

  return parts.join('\n')
}

export async function classifyInquiry(
  input: ClassifyInquiryInput,
): Promise<ClassifyInquiryResult> {
  if (!input.client) {
    throw new Error('AI client is required for classification.')
  }

  const response = await input.client.generateObject({
    schema: classificationOutputSchema,
    system: 'You classify domain purchase inquiry emails. Output only structured JSON.',
    prompt: buildClassificationPrompt(input),
    maxTokens: 300,
    temperature: 0,
  })

  return {
    classification: response.data.classification,
    reason: response.data.reason,
  }
}

export async function draftReply(input: DraftReplyInput): Promise<DraftReplyResult> {
  if (!input.client) {
    throw new Error('AI client is required for draft generation.')
  }

  const response = await input.client.generateObject({
    schema: draftReplyOutputSchema,
    system: 'You draft professional domain sales email replies. Output only structured JSON.',
    prompt: buildDraftReplyPrompt(input),
    maxTokens: 600,
    temperature: 0.3,
  })

  return {
    subject: response.data.subject,
    body: response.data.body,
  }
}

export async function negotiateCounter(
  input: NegotiateCounterInput,
): Promise<NegotiateCounterResult> {
  if (!input.client) {
    throw new Error('AI client is required for negotiation drafting.')
  }

  const response = await input.client.generateObject({
    schema: negotiateCounterOutputSchema,
    system:
      'You draft domain-sale counter-offers. Keep output structured, conservative, and aligned to the provided pricing guardrails.',
    prompt: buildNegotiationPrompt(input),
    maxTokens: 800,
    temperature: 0.2,
  })

  return {
    suggestedPrice: response.data.suggestedPrice,
    reasoning: response.data.reasoning,
    draftSubject: response.data.draftSubject,
    draftBody: response.data.draftBody,
  }
}
