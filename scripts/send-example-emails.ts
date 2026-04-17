import { generateOutreachDraft } from '../src/lib/outreach-draft'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM_ADDRESS ?? 'onboarding@resend.dev'
const TO = process.env.TEST_EMAIL_TO ?? 'info@soundsclear.nl'

const sender = { name: 'Sara', email: 'sara@dse.example' }

const domainNL = {
  name: 'zonnepanelen-offerte.nl',
  category: 'energy',
  language: 'NL' as const,
  targetPrice: 2500,
  currency: 'EUR',
}

const domainEN = {
  name: 'solarpanel-quote.com',
  category: 'energy',
  language: 'EN' as const,
  targetPrice: 2500,
  currency: 'EUR',
}

const lead = {
  companyName: 'GreenPower BV',
  contactName: 'Thomas van der Berg',
  website: 'https://greenpower.nl',
  buyerFitReason:
    'zonnepanelen verkopen aan particulieren, sluit dit domein direct aan op jullie aanbod.',
  outreachCount: 0,
  doNotContact: false,
  uninterested: false,
}

async function send(subject: string, body: string, label: string) {
  if (!RESEND_API_KEY) {
    throw new Error('Set RESEND_API_KEY before running this script.')
  }

  console.log(`\nSending: ${label}`)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [TO], subject: `[VOORBEELD: ${label}] ${subject}`, text: body }),
  })
  if (!res.ok) {
    console.error('Failed:', await res.text())
  } else {
    console.log('Sent ok')
  }
}

const examples = [
  { domain: domainNL, outreachCount: 0, tone: 'standard' as const, label: 'NL / initieel / standaard' },
  { domain: domainEN, outreachCount: 0, tone: 'standard' as const, label: 'EN / initial / standard' },
]

for (const ex of examples) {
  const result = generateOutreachDraft({
    domain: ex.domain,
    lead: { ...lead, outreachCount: ex.outreachCount },
    sender,
    tone: ex.tone,
    autoSendEnabled: false,
    dailyLimit: 10,
    hasPrice: false,
    followupDays1: 5,
    followupDays2: 7,
  })

  if (!result.eligible || !result.draft) {
    console.log(`Skipped (${ex.label}):`, result.reason)
    continue
  }

  await send(result.draft.subject, result.draft.body, ex.label)
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\nDone.')
