// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DomainDetailPage } from './DomainDetailPage'

function requestUrl(input: string | URL | Request) {
  if (typeof input === 'string') return input
  if (input instanceof Request) return input.url
  return input.toString()
}

function requestMethod(input: string | URL | Request) {
  if (input instanceof Request) return input.method
  return 'GET'
}

describe('DomainDetailPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('enriches contact data for a discovered buyer lead', async () => {
    let leadFetchCount = 0

    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input as string | URL | Request)

      if (url.endsWith('/api/domains/domain-1')) {
        return new Response(
          JSON.stringify({
            item: {
              id: 'domain-1',
              domainName: 'greenbatteryhub.com',
              tld: '.com',
              language: 'EN',
              category: 'Energy',
              status: 'listed',
              sellMode: 'portfolio_redirect',
              currentRegistrar: 'xel',
              acquisitionCost: 100,
              annualRenewalCost: 10,
              notes: 'Strong energy brand.',
              migrationCandidate: false,
              quickSalePrice: 2000,
              targetPrice: 5000,
              aspirationalPrice: 7000,
            },
            recommendation: {
              quickSalePrice: 2000,
              targetPrice: 5000,
              aspirationalPrice: 7000,
              confidenceScore: 88,
              rationale: ['Strong commercial phrasing'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.endsWith('/api/domains/domain-1/page-content')) {
        return new Response(JSON.stringify({ item: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/domains/domain-1/leads') && requestMethod(input as string | URL | Request) !== 'POST') {
        leadFetchCount += 1

        return new Response(
          JSON.stringify({
            items:
              leadFetchCount === 1
                ? [
                    {
                      id: 'lead-1',
                      domainId: 'domain-1',
                      companyName: 'Volt Storage',
                      website: 'https://voltstorage.example',
                      buyerFitReason: 'Already active in industrial battery storage.',
                      priorityScore: 92,
                      doNotContact: false,
                      country: 'NL',
                      source: 'buyer_discovery',
                      createdAt: Date.now(),
                    },
                  ]
                : [
                    {
                      id: 'lead-1',
                      domainId: 'domain-1',
                      companyName: 'Volt Storage',
                      website: 'https://voltstorage.example',
                      buyerFitReason: 'Already active in industrial battery storage.',
                      priorityScore: 92,
                      doNotContact: false,
                      country: 'NL',
                      source: 'buyer_discovery',
                      createdAt: Date.now(),
                      contactName: 'Jamie Buyer',
                      contactEmail: 'jamie@voltstorage.example',
                    },
                  ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.endsWith('/api/outreach/workflows')) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/domains/domain-1/leads/lead-1/enrich-contacts')) {
        return new Response(
          JSON.stringify({
            ok: true,
            item: {
              leadId: 'lead-1',
              latestRun: {
                id: 'lead-enrichment-1',
                leadId: 'lead-1',
                provider: 'apify',
                actorId: 'poidata/contact-details-scraper',
                status: 'completed',
                sourceWebsite: 'https://voltstorage.example',
                rawPayloadJson: '[]',
                errorMessage: null,
                startedAt: Date.now(),
                finishedAt: Date.now(),
                createdAt: Date.now(),
              },
              contacts: [
                {
                  id: 'contact-1',
                  leadId: 'lead-1',
                  runId: 'lead-enrichment-1',
                  type: 'email',
                  value: 'jamie@voltstorage.example',
                  label: 'Jamie Buyer',
                  sourceUrl: 'https://voltstorage.example/contact',
                  confidence: 92,
                  createdAt: Date.now(),
                },
              ],
            },
            meta: {
              provider: 'apify',
              actorId: 'poidata/contact-details-scraper',
              website: 'https://voltstorage.example',
              enriched: 1,
              contactsFound: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(
      <MemoryRouter initialEntries={['/admin/domains/domain-1']}>
        <Routes>
          <Route path="/admin/domains/:domainId" element={<DomainDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('Volt Storage')
    await userEvent.click(screen.getByRole('button', { name: /enrich contact data/i }))

    const summaries = await screen.findAllByText(/1 lead verrijkt/i)
    expect(summaries.length).toBeGreaterThan(0)
    expect(screen.getByText('Jamie Buyer')).toBeInTheDocument()
    expect(screen.getByText('jamie@voltstorage.example')).toBeInTheDocument()
  })
})
