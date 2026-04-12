import type { z } from 'zod'

export class StructuredOutputError extends Error {
  rawText: string

  constructor(message: string, rawText: string) {
    super(message)
    this.name = 'StructuredOutputError'
    this.rawText = rawText
  }
}

function extractFromMarkdownFence(rawText: string) {
  const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match?.[1]?.trim() ?? null
}

function extractBalancedJson(rawText: string) {
  const start = rawText.search(/[{[]/)
  if (start === -1) {
    return null
  }

  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let index = start; index < rawText.length; index++) {
    const char = rawText[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{' || char === '[') {
      stack.push(char)
      continue
    }

    if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '['
      if (stack.at(-1) !== expected) {
        throw new StructuredOutputError('Structured output contained malformed JSON.', rawText)
      }

      stack.pop()

      if (stack.length === 0) {
        return rawText.slice(start, index + 1)
      }
    }
  }

  return null
}

export function extractJsonString(rawText: string) {
  const fenced = extractFromMarkdownFence(rawText)
  if (fenced) {
    return fenced
  }

  const trimmed = rawText.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  const balanced = extractBalancedJson(rawText)
  if (balanced) {
    return balanced.trim()
  }

  throw new StructuredOutputError('No JSON object found in model output.', rawText)
}

export function parseStructuredOutput<T>(rawText: string, schema: z.ZodType<T>): T {
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(extractJsonString(rawText))
  } catch (error) {
    throw new StructuredOutputError(
      error instanceof Error ? error.message : 'Could not parse model JSON output.',
      rawText,
    )
  }

  const result = schema.safeParse(parsedJson)
  if (!result.success) {
    throw new StructuredOutputError(result.error.message, rawText)
  }

  return result.data
}
