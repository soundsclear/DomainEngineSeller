import { resolveBraveSearchConfig, type BraveSearchConfig, type BraveSearchEnvLike } from './config'

export interface BraveSearchRequest {
  query: string
  count?: number
  country?: string
  searchLang?: string
}

export interface BraveSearchResultItem {
  title: string
  url: string
  description: string
  extraSnippets: string[]
}

export interface BraveSearchResponse {
  query: string
  results: BraveSearchResultItem[]
}

export interface SearchClient {
  search(input: BraveSearchRequest): Promise<BraveSearchResponse>
}

interface BraveApiResponse {
  web?: {
    results?: Array<{
      title?: string
      url?: string
      description?: string
      extra_snippets?: string[]
    }>
  }
}

export function createBraveSearchClient(
  config: BraveSearchConfig,
  fetchImpl: typeof fetch = fetch,
): SearchClient {
  return {
    async search(input: BraveSearchRequest) {
      const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search')
      searchUrl.searchParams.set('q', input.query)
      searchUrl.searchParams.set('count', String(input.count ?? 6))
      searchUrl.searchParams.set('extra_snippets', 'true')

      if (input.country) {
        searchUrl.searchParams.set('country', input.country)
      }

      if (input.searchLang) {
        searchUrl.searchParams.set('search_lang', input.searchLang)
      }

      const response = await fetchImpl(searchUrl, {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': config.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Brave ${response.status}: ${await response.text()}`)
      }

      const payload = (await response.json()) as BraveApiResponse
      const results = (payload.web?.results ?? [])
        .filter((item) => item?.title && item?.url && item?.description)
        .map((item) => ({
          title: item.title as string,
          url: item.url as string,
          description: item.description as string,
          extraSnippets: item.extra_snippets ?? [],
        }))

      return {
        query: input.query,
        results,
      }
    },
  }
}

export function createBraveSearchClientFromEnv(
  env: BraveSearchEnvLike,
  fetchImpl: typeof fetch = fetch,
) {
  return createBraveSearchClient(resolveBraveSearchConfig(env), fetchImpl)
}
