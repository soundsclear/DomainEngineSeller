import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractJsonString, parseStructuredOutput, StructuredOutputError } from './json'

describe('structured output parsing', () => {
  it('extracts JSON from markdown fences', () => {
    const raw = 'Here you go:\n```json\n{"ok":true,"items":[1,2]}\n```'
    expect(extractJsonString(raw)).toBe('{"ok":true,"items":[1,2]}')
  })

  it('extracts the first balanced JSON object from surrounding prose', () => {
    const raw =
      'Result follows: {"seoTitle":"Title","metaDescription":"Desc long enough for parse","heroHeadline":"Hello there","heroSubheadline":"This is a subheadline with enough length","bodyContent":"A long enough body content that keeps going until validation is happy."} Thanks.'

    const parsed = parseStructuredOutput(
      raw,
      z.object({
        seoTitle: z.string(),
        metaDescription: z.string(),
        heroHeadline: z.string(),
        heroSubheadline: z.string(),
        bodyContent: z.string(),
      }),
    )

    expect(parsed.seoTitle).toBe('Title')
  })

  it('throws a structured error when no JSON is present', () => {
    expect(() => extractJsonString('No structured data here.')).toThrow(StructuredOutputError)
  })
})
