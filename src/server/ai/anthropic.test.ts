import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAnthropicClient } from './anthropic'

describe('createAnthropicClient', () => {
  it('sends a messages request and parses structured JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'msg_123',
        model: 'claude-test',
        content: [{ type: 'text', text: '{"value":"ok"}' }],
      }),
    } as Response)

    const client = createAnthropicClient({ apiKey: 'secret', model: 'claude-test' }, fetchMock)
    const result = await client.generateObject({
      schema: z.object({ value: z.string() }),
      prompt: 'Return a value.',
    })

    expect(result.data.value).toBe('ok')
    expect(result.model).toBe('claude-test')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('surfaces API errors with the response message', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'invalid x-api-key',
        },
      }),
    } as Response)

    const client = createAnthropicClient({ apiKey: 'secret', model: 'claude-test' }, fetchMock)

    await expect(
      client.generateObject({
        schema: z.object({ value: z.string() }),
        prompt: 'Return a value.',
      }),
    ).rejects.toThrow('invalid x-api-key')
  })
})
