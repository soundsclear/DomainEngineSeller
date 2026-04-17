import { z } from 'zod'
import { canSendOutreach } from './outreach-guardrails'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutreachTone = 'concise' | 'standard' | 'detailed'
export type OutreachSequenceStep = 'initial' | 'follow_up_1' | 'follow_up_2'
export type OutreachLanguage = 'NL' | 'EN'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const outreachDraftInputSchema = z.object({
  domain: z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    language: z.enum(['NL', 'EN']),
    targetPrice: z.number().positive(),
    currency: z.string().default('EUR'),
    notes: z.string().optional(),
  }),
  lead: z.object({
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    website: z.string().optional(),
    buyerFitReason: z.string().min(1),
    outreachCount: z.number().int().min(0),
    doNotContact: z.boolean(),
    uninterested: z.boolean(),
  }),
  sender: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  tone: z.enum(['concise', 'standard', 'detailed']).default('standard'),
  autoSendEnabled: z.boolean().default(false),
  dailyLimit: z.number().int().min(0).default(10),
  hasPrice: z.boolean().default(false),
  followupDays1: z.number().int().min(1).default(5),
  followupDays2: z.number().int().min(1).default(7),
})

export type OutreachDraftInput = z.infer<typeof outreachDraftInputSchema>

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface OutreachDraft {
  sequenceStep: OutreachSequenceStep
  subject: string
  body: string
  tone: OutreachTone
  language: OutreachLanguage
  /** Days to wait before the next follow-up; null when this is the final step */
  recommendedFollowUpDays: number | null
  wordCount: number
  /** Which input fields were interpolated into this draft */
  personalizationTokensUsed: string[]
}

export interface OutreachDraftResult {
  eligible: boolean
  reason: string
  draft: OutreachDraft | null
}

// ---------------------------------------------------------------------------
// Sequence helpers
// ---------------------------------------------------------------------------

function stepFromCount(count: number): OutreachSequenceStep {
  if (count === 0) return 'initial'
  if (count === 1) return 'follow_up_1'
  return 'follow_up_2'
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

function formatPrice(amount: number, currency: string, language: OutreachLanguage): string {
  const locale = language === 'NL' ? 'nl-NL' : 'en-GB'
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

// ---------------------------------------------------------------------------
// Category angle — short phrase describing the domain's relevance
// ---------------------------------------------------------------------------

function categoryAngle(category: string, language: OutreachLanguage): string {
  const c = category.toLowerCase()

  const angles: Record<string, { NL: string; EN: string }> = {
    'home services': {
      NL: 'klanten in jullie regio direct aan jullie koppelt',
      EN: 'connects local customers directly to your services',
    },
    energy: {
      NL: 'de energiemarkt aanspreekt als een autoriteitsdomein',
      EN: 'positions you as an authority in the energy market',
    },
    marketing: {
      NL: 'jullie SEO-positie in de regio versterkt',
      EN: 'strengthens your regional SEO positioning',
    },
    saas: {
      NL: 'een sterke merkidentiteit in de AI-ruimte geeft',
      EN: 'gives you a strong brand identity in the AI space',
    },
    'real estate': {
      NL: 'direct vertrouwen wekt bij woningzoekers',
      EN: 'builds immediate trust with property seekers',
    },
    finance: {
      NL: 'autoriteit uitstraalt in de financiële sector',
      EN: 'signals authority in the financial sector',
    },
    health: {
      NL: 'patiënten en cliënten direct aanspreekt',
      EN: 'speaks directly to patients and clients',
    },
    travel: {
      NL: 'reizigers meteen het juiste gevoel geeft',
      EN: 'gives travellers the right impression immediately',
    },
  }

  for (const key of Object.keys(angles)) {
    if (c.includes(key)) return angles[key][language]
  }

  // Generic fallback
  return language === 'NL'
    ? 'direct herkenbaar is voor jullie doelgroep'
    : 'is immediately recognisable to your target audience'
}

// ---------------------------------------------------------------------------
// Draft builders — NL
// ---------------------------------------------------------------------------

function buildNL(
  input: OutreachDraftInput,
  step: OutreachSequenceStep,
  tone: OutreachTone,
  hasPrice: boolean,
): { subject: string; body: string; tokens: string[] } {
  const { domain, lead, sender } = input
  const price = formatPrice(domain.targetPrice, domain.currency, 'NL')
  const angle = categoryAngle(domain.category, 'NL')
  const firstName = lead.contactName.split(' ')[0]

  const tokens = ['domain.name', 'lead.contactName', 'lead.companyName', 'domain.targetPrice', 'lead.buyerFitReason']

  if (step === 'initial') {
    const subject = `${domain.name} beschikbaar voor ${lead.companyName}`

    let body: string

    if (tone === 'concise') {
      const priceLine = hasPrice ? `\nDe vraagprijs is ${price}.\n` : ''
      body = `Hallo ${firstName},

Ik neem contact op omdat ${domain.name} beschikbaar is. Omdat jullie ${lead.buyerFitReason}
${priceLine}
Is dit iets wat relevant kan zijn voor jullie?

Groeten,
${sender.name}
${sender.email}`
    } else if (tone === 'standard') {
      const priceLine = hasPrice ? `\nDe vraagprijs is ${price}.\n` : ''
      body = `Hallo ${firstName},

Ik neem even contact op omdat ${domain.name} beschikbaar is en ik denk dat het strategisch interessant kan zijn. Het is een domein dat ${angle}.

Omdat jullie ${lead.buyerFitReason}
${priceLine}
Is aankoop van dit domein iets wat jullie zou aanspreken? Als dat zo is, deel ik graag de voorwaarden en prijsindicatie.

Groeten,
${sender.name}
${sender.email}`
    } else {
      // detailed
      const priceLine = hasPrice ? `\nDe vraagprijs is ${price}.\n` : ''
      body = `Hallo ${firstName},

Mijn naam is ${sender.name}. Ik beheer een portfolio van domeinnamen en ben ${lead.companyName} tegengekomen tijdens mijn onderzoek.

Ik wil jullie ${domain.name} aanbieden, een domein dat ${angle}. Omdat jullie ${lead.buyerFitReason}
${priceLine}
${domain.notes ? `Wat extra context: ${domain.notes}\n\n` : ''}Als dit interessant klinkt, hoor ik het graag. Dan deel ik de verdere details en prijsindicatie.

Groeten,
${sender.name}
${sender.email}`

      if (domain.notes) tokens.push('domain.notes')
    }

    return { subject, body, tokens }
  }

  if (step === 'follow_up_1') {
    const subject = `Re: ${domain.name} beschikbaar voor ${lead.companyName}`

    const body =
      tone === 'concise'
        ? `Hallo ${firstName},

Ik wilde even opvolgen over ${domain.name}.

Nog steeds beschikbaar voor ${price}. Laat het me weten als jullie interesse hebben.

Groeten,
${sender.name}`
        : `Hallo ${firstName},

Ik stuurde jullie vorige week een bericht over ${domain.name} en wilde even vragen of het iets voor ${lead.companyName} zou kunnen zijn.

Het domein is nog beschikbaar. Vraagprijs: ${price}.

Als de timing nu niet uitkomt, geeft dat ook niks, laat het dan gerust weten.

Groeten,
${sender.name}
${sender.email}`

    return { subject, body, tokens }
  }

  // follow_up_2
  const subject = `Nog een laatste bericht over ${domain.name}`

  const body = `Hallo ${firstName},

Dit is mijn laatste berichtje over ${domain.name}.

Als u geen interesse heeft, hoeft u niets te doen. Ik stuur u hier verder niks meer over.

Mocht u in de toekomst toch interesse krijgen, dan kunt u me altijd bereiken via ${sender.email}.

Groeten,
${sender.name}`

  return { subject, body, tokens }
}

// ---------------------------------------------------------------------------
// Draft builders — EN
// ---------------------------------------------------------------------------

function buildEN(
  input: OutreachDraftInput,
  step: OutreachSequenceStep,
  tone: OutreachTone,
  hasPrice: boolean,
): { subject: string; body: string; tokens: string[] } {
  const { domain, lead, sender } = input
  const price = formatPrice(domain.targetPrice, domain.currency, 'EN')
  const angle = categoryAngle(domain.category, 'EN')
  const firstName = lead.contactName.split(' ')[0]

  const tokens = ['domain.name', 'lead.contactName', 'lead.companyName', 'domain.targetPrice', 'lead.buyerFitReason']

  if (step === 'initial') {
    const subject = `${domain.name} available for ${lead.companyName}`

    let body: string

    if (tone === 'concise') {
      const priceLine = hasPrice ? `\nThe asking price is ${price}.\n` : ''
      body = `Hi ${firstName},

I'm reaching out because ${domain.name} is available. Because you ${lead.buyerFitReason}
${priceLine}
Would this be relevant for you?

Best,
${sender.name}
${sender.email}`
    } else if (tone === 'standard') {
      const priceLine = hasPrice ? `\nThe asking price is ${price}.\n` : ''
      body = `Hi ${firstName},

I'm reaching out because ${domain.name} is available and I think it could be strategically interesting. It is a domain that ${angle}.

Because you ${lead.buyerFitReason}
${priceLine}
Would acquiring this domain be something that appeals to you? If so, I'm happy to share the details and pricing.

Best,
${sender.name}
${sender.email}`
    } else {
      // detailed
      const priceLine = hasPrice ? `\nThe asking price is ${price}.\n` : ''
      body = `Hi ${firstName},

My name is ${sender.name}. I manage a portfolio of domain names and came across ${lead.companyName} while doing some research.

I wanted to reach out about ${domain.name}, a domain that ${angle}. Because you ${lead.buyerFitReason}
${priceLine}
${domain.notes ? `A bit of context: ${domain.notes}\n\n` : ''}If this sounds interesting, I'd love to hear from you and can share further details and pricing.

Best,
${sender.name}
${sender.email}`

      if (domain.notes) tokens.push('domain.notes')
    }

    return { subject, body, tokens }
  }

  if (step === 'follow_up_1') {
    const subject = `Re: ${domain.name} available for ${lead.companyName}`

    const body =
      tone === 'concise'
        ? `Hi ${firstName},

Just following up on my note about ${domain.name}.

Still available at ${price}. Let me know if you're interested.

Best,
${sender.name}`
        : `Hi ${firstName},

I sent you a note last week about ${domain.name} and wanted to check in.

The domain is still available at ${price}.

If the timing isn't right, no worries at all. Just let me know.

Best,
${sender.name}
${sender.email}`

    return { subject, body, tokens }
  }

  // follow_up_2
  const subject = `Final note on ${domain.name}`

  const body = `Hi ${firstName},

This is my last message about ${domain.name}.

If it's not a fit, no reply needed. I won't follow up again.

If you ever want to revisit this down the line, you can reach me at ${sender.email}.

Best,
${sender.name}`

  return { subject, body, tokens }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a personalised plain-text outreach draft for a domain sale.
 *
 * Checks eligibility via the existing guardrails before generating.
 * Selects the correct sequence step (initial / follow-up 1 / follow-up 2)
 * based on outreachCount. Supports NL and EN, and three tone variants.
 *
 * This is a pure function — no I/O, no side effects.
 * The caller is responsible for persisting the draft and updating outreachCount.
 */
export function generateOutreachDraft(rawInput: OutreachDraftInput): OutreachDraftResult {
  const input = outreachDraftInputSchema.parse(rawInput)

  const eligibility = canSendOutreach({
    doNotContact: input.lead.doNotContact,
    outreachCount: input.lead.outreachCount,
    uninterested: input.lead.uninterested,
    autoSendEnabled: input.autoSendEnabled,
    dailyLimit: input.dailyLimit,
  })

  if (!eligibility.allowed) {
    return { eligible: false, reason: eligibility.reason, draft: null }
  }

  const step = stepFromCount(input.lead.outreachCount)
  const tone = input.tone
  const language = input.domain.language

  const { subject, body, tokens } =
    language === 'NL'
      ? buildNL(input, step, tone, input.hasPrice)
      : buildEN(input, step, tone, input.hasPrice)

  const recommendedFollowUpDays =
    step === 'initial' ? input.followupDays1 :
    step === 'follow_up_1' ? input.followupDays2 :
    null

  return {
    eligible: true,
    reason: eligibility.reason,
    draft: {
      sequenceStep: step,
      subject,
      body,
      tone,
      language,
      recommendedFollowUpDays,
      wordCount: countWords(body),
      personalizationTokensUsed: tokens,
    },
  }
}
