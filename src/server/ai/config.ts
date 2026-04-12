export interface AnthropicEnvLike {
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
}

export interface BraveSearchEnvLike {
  BRAVE_SEARCH_API_KEY?: string
}

export interface AnthropicConfig {
  apiKey: string
  model: string
}

export interface BraveSearchConfig {
  apiKey: string
}

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

function requireEnvValue(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`${key} not configured`)
  }

  return value
}

export function resolveAnthropicConfig(env: AnthropicEnvLike): AnthropicConfig {
  return {
    apiKey: requireEnvValue(env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY'),
    model: env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
  }
}

export function resolveBraveSearchConfig(env: BraveSearchEnvLike): BraveSearchConfig {
  return {
    apiKey: requireEnvValue(env.BRAVE_SEARCH_API_KEY, 'BRAVE_SEARCH_API_KEY'),
  }
}
