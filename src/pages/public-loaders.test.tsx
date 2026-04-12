// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoaderFunctionArgs } from 'react-router-dom'
import { publicDomainLoader, publicPortfolioLoader } from './public-loaders'

function createLoaderArgs(domainId?: string): LoaderFunctionArgs {
  return {
    request: new Request(`http://localhost${domainId ? `/d/${domainId}` : '/d'}`),
    params: domainId ? { domainId } : {},
    context: undefined,
    unstable_pattern: null,
    unstable_url: new URL(`http://localhost${domainId ? `/d/${domainId}` : '/d'}`),
  } as unknown as LoaderFunctionArgs
}

describe('public route loaders', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('loads the public portfolio from the dedicated API route', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 'testdomein-nl' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await publicPortfolioLoader()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/portfolio',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
    expect(result).toEqual({ items: [{ id: 'testdomein-nl' }] })
  })

  it('loads a public domain by domain id', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          slug: 'testdomein-nl',
          domain: { id: 'testdomein-nl', domainName: 'testdomein.nl' },
          content: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const result = await publicDomainLoader(createLoaderArgs('testdomein-nl'))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/domains/testdomein-nl',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
    expect(result).toEqual({
      slug: 'testdomein-nl',
      domain: { id: 'testdomein-nl', domainName: 'testdomein.nl' },
      content: null,
    })
  })

  it('rejects public domain loads without a domain id', async () => {
    expect(() => publicDomainLoader(createLoaderArgs())).toThrow('Geen domein opgegeven.')
  })
})
