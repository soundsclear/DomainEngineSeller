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

function followUpDays(step: OutreachSequenceStep): number | null {
  if (step === 'initial') return 5
  if (step === 'follow_up_1') return 7
  return null
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
      NL: 'klanten in uw regio direct aan u koppelt',
      EN: 'connects local customers directly to your services',
    },
    energy: {
      NL: 'de energiemarkt aansprak als een autoriteitsdomein',
      EN: 'positions you as an authority in the energy market',
    },
    marketing: {
      NL: 'uw SEO-positie in de regio versterkt',
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
    ? 'direct herkenbaar is voor uw doelgroep'
    : 'is immediately recognisable to your target audience'
}

// ---------------------------------------------------------------------------
// Draft builders — NL
// ---------------------------------------------------------------------------

function buildNL(
  input: OutreachDraftInput,
  step: OutreachSequenceStep,
  tone: OutreachTone,
): { subject: string; body: string; tokens: string[] } {
  const { domain, lead, sender } = input
  const price = formatPrice(domain.targetPrice, domain.currency, 'NL')
  const angle = categoryAngle(domain.category, 'NL')
  const firstName = lead.contactName.split(' ')[0]

  const tokens = ['domain.name', 'lead.contactName', 'lead.companyName', 'domain.targetPrice', 'lead.buyerFitReason']

  if (step === 'initial') {
    const subject = `${domain.name} — beschikbaar voor ${lead.companyName}`

    let body: string

    if (tone === 'concise') {
      body = `Hallo ${firstName},

${domain.name} staat te koop. ${lead.buyerFitReason}

Vraagprijs: ${price}. Interesse?

Met vriendelijke groet,
${sender.name}
${sender.email}`
    } else if (tone === 'standard') {
      body = `Hallo ${firstName},

Ik neem contact op omdat ${domain.name} beschikbaar is en dit domein ${angle}.

${lead.buyerFitReason}

De vraagprijs is ${price}. Als u interesse heeft, reageer dan op dit bericht en ik stuur u meer informatie.

Met vriendelijke groet,
${sender.name}
${sender.email}`
    } else {
      // detailed
      body = `Hallo ${firstName},

Mijn naam is ${sender.name} en ik beheer een portfolio van gerichte domeinnamen voor de Nederlandse markt.

Ik ben ${lead.companyName} tegengekomen tijdens mijn onderzoek en wil u ${domain.name} aanbieden, een domein dat ${angle}.

Waarom ${lead.companyName}? ${lead.buyerFitReason}

${domain.notes ? `Aanvullende context: ${domain.notes}\n\n` : ''}De vraagprijs is ${price}. Directe verkoop is mogelijk, of we kunnen kort overleggen als u vragen heeft.

Ik hoor graag van u.

Met vriendelijke groet,
${sender.name}
${sender.email}`

      if (domain.notes) tokens.push('domain.notes')
    }

    return { subject, body, tokens }
  }

  if (step === 'follow_up_1') {
    const subject = `Re: ${domain.name} — korte follow-up`

    const body =
      tone === 'concise'
        ? `Hallo ${firstName},

Korte follow-up op mijn vorige bericht over ${domain.name}.

Nog steeds beschikbaar voor ${price}. Laat het me weten als u interesse heeft.

Met vriendelijke groet,
${sender.name}`
        : `Hallo ${firstName},

Ik stuurde u vorige week een bericht over ${domain.name} en wilde nog een keer vragen of dit iets is voor ${lead.companyName}.

Het domein is nog beschikbaar. Vraagprijs: ${price}.

Als de timing nu niet uitkomt, laat het gerust weten — dan houd ik u op de hoogte als er veranderingen zijn.

Met vriendelijke groet,
${sender.name}
${sender.email}`

    return { subject, body, tokens }
  }

  // follow_up_2
  const subject = `${domain.name} — laatste bericht`

  const body = `Hallo ${firstName},

Dit is mijn laatste bericht over ${domain.name}.

Als u geen interesse heeft, hoeft u niet te reageren — ik zal u niet verder contacteren over dit onderwerp.

Mocht u in de toekomst toch interesse krijgen, dan kunt u me bereiken via ${sender.email}.

Met vriendelijke groet,
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
): { subject: string; body: string; tokens: string[] } {
  const { domain, lead, sender } = input
  const price = formatPrice(domain.targetPrice, domain.currency, 'EN')
  const angle = categoryAngle(domain.category, 'EN')
  const firstName = lead.contactName.split(' ')[0]

  const tokens = ['domain.name', 'lead.contactName', 'lead.companyName', 'domain.targetPrice', 'lead.buyerFitReason']

  if (step === 'initial') {
    const subject = `${domain.name} — available for ${lead.companyName}`

    let body: string

    if (tone === 'concise') {
      body = `Hi ${firstName},

${domain.name} is available for sale. ${lead.buyerFitReason}

Asking price: ${price}. Interested?

Best,
${sender.name}
${sender.email}`
    } else if (tone === 'standard') {
      body = `Hi ${firstName},

I'm reaching out because ${domain.name} is available and it ${angle}.

${lead.buyerFitReason}

The asking price is ${price}. If you're interested, reply to this message and I'll share more details.

Best regards,
${sender.name}
${sender.email}`
    } else {
      // detailed
      body = `Hi ${firstName},

My name is ${sender.name} and I manage a portfolio of targeted domain names.

I came across ${lead.companyName} and wanted to offer you ${domain.name} — a domain that ${angle}.

Why ${lead.companyName}? ${lead.buyerFitReason}

${domain.notes ? `A bit more context: ${domain.notes}\n\n` : ''}The asking price is ${price}. We can close quickly or have a brief conversation if you have questions.

I'd love to hear from you.

Best regards,
${sender.name}
${sender.email}`

      if (domain.notes) tokens.push('domain.notes')
    }

    return { subject, body, tokens }
  }

  if (step === 'follow_up_1') {
    const subject = `Re: ${domain.name} — quick follow-up`

    const body =
      tone === 'concise'
        ? `Hi ${firstName},

Following up on my note about ${domain.name}.

Still available at ${price}. Let me know if you're interested.

Best,
${sender.name}`
        : `Hi ${firstName},

I sent you a note last week about ${domain.name} and wanted to follow up.

The domain is still available at ${price}.

If the timing isn't right, no worries — just let me know and I'll keep you in the loop if anything changes.

Best regards,
${sender.name}
${sender.email}`

    return { subject, body, tokens }
  }

  // follow_up_2
  const subject = `${domain.name} — final note`

  const body = `Hi ${firstName},

This is my last message about ${domain.name}.

If you're not interested, no reply needed — I won't follow up on this topic again.

If you'd ever like to revisit this in the future, you can reach me at ${sender.email}.

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
      ? buildNL(input, step, tone)
      : buildEN(input, step, tone)

  return {
    eligible: true,
    reason: eligibility.reason,
    draft: {
      sequenceStep: step,
      subject,
      body,
      tone,
      language,
      recommendedFollowUpDays: followUpDays(step),
      wordCount: countWords(body),
      personalizationTokensUsed: tokens,
    },
  }
}
