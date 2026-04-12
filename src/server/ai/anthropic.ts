import type { z } from 'zod'
import { resolveAnthropicConfig, type AnthropicConfig, type AnthropicEnvLike } from './config'
import { parseStructuredOutput } from './json'

export interface StructuredGenerationRequest<T> {
  schema: z.ZodType<T>
  prompt: string
  system?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface StructuredGenerationResult<T> {
  data: T
  rawText: string
  responseId: string | null
  model: string
}

export interface StructuredAiClient {
  generateObject<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>
}

interface AnthropicMessagesResponse {
  id?: string
  model?: string
  content?: Array<{
    type: string
    text?: string
  }>
  error?: {
    message?: string
  }
}

export function createAnthropicClient(
  config: AnthropicConfig,
  fetchImpl: typeof fetch = fetch,
): StructuredAiClient {
  return {
    async generateObject<T>(request: StructuredGenerationRequest<T>) {
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: request.model ?? config.model,
          max_tokens: request.maxTokens ?? 1_200,
          temperature: request.temperature ?? 0,
          system: request.system,
          messages: [
            {
              role: 'user',
              content: `${request.prompt}\n\nReturn only valid JSON with no markdown fences and no explanatory prose.`,
            },
          ],
        }),
      })

      const payload = (await response.json()) as AnthropicMessagesResponse

      if (!response.ok) {
        throw new Error(payload.error?.message ?? `Anthropic ${response.status}`)
      }

      const rawText = (payload.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()

      if (!rawText) {
        throw new Error('Anthropic response did not contain text content.')
      }

      return {
        data: parseStructuredOutput(rawText, request.schema),
        rawText,
        responseId: payload.id ?? null,
        model: payload.model ?? request.model ?? config.model,
      }
    },
  }
}

export function createAnthropicClientFromEnv(
  env: AnthropicEnvLike,
  fetchImpl: typeof fetch = fetch,
) {
  return createAnthropicClient(resolveAnthropicConfig(env), fetchImpl)
}
