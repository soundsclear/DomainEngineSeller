import type { DomainApiRecord } from '../db/domain-repository'

interface SemanticRule {
  token: string
  literalMeaning: string
  disallowedInterpretations: string[]
}

const SEMANTIC_RULES: SemanticRule[] = [
  {
    token: 'servies',
    literalMeaning: 'tableware, crockery, dishes, dinnerware',
    disallowedInterpretations: ['service', 'services', 'dienstverlening', 'serviceverlening'],
  },
]

function extractBaseLabel(domainName: string) {
  return domainName.replace(/\.[^.]+$/, '').toLowerCase()
}

function tokenizeLabel(label: string) {
  return label
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function findMatchingRules(tokens: string[]) {
  const joined = tokens.join(' ')
  return SEMANTIC_RULES.filter((rule) => tokens.includes(rule.token) || joined.includes(rule.token))
}

export function buildSemanticGuidance(domain: Pick<DomainApiRecord, 'domainName' | 'notes'>) {
  const label = extractBaseLabel(domain.domainName)
  const tokens = tokenizeLabel(label)
  const rules = findMatchingRules(tokens)

  const lines = [
    `Literal domain label: ${label}.`,
    `Visible tokens: ${tokens.join(', ') || label}.`,
    'Use the literal meaning of the visible tokens as the primary interpretation.',
    'Do not substitute a different word just because it sounds similar or resembles an English word.',
  ]

  if (domain.notes?.trim()) {
    lines.push(`Authoritative domain notes: ${domain.notes.trim()}.`)
    lines.push('If there is tension between your guess and the domain notes, the domain notes win.')
  }

  for (const rule of rules) {
    lines.push(
      `Token guidance for "${rule.token}": interpret it as ${rule.literalMeaning}. Never reinterpret it as ${rule.disallowedInterpretations.join(', ')}.`,
    )
  }

  return lines.join('\n')
}
