import type { LoaderFunctionArgs } from 'react-router-dom'
import { fetchPublicDomain, fetchPublicPortfolio } from '@/lib/api'

export function publicPortfolioLoader() {
  return fetchPublicPortfolio()
}

export function publicDomainLoader({ params }: LoaderFunctionArgs) {
  const domainId = params.domainId

  if (!domainId) {
    throw new Error('Geen domein opgegeven.')
  }

  return fetchPublicDomain(domainId)
}
