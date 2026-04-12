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

  it('generates and saves an outreach workflow for a discovered buyer lead', async () => {
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
        return new Response(
          JSON.stringify({
            items: [
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

      if (url.endsWith('/api/domains/domain-1/leads/lead-1/outreach-draft')) {
        return new Response(
          JSON.stringify({
            lead: {
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
            domain: { id: 'domain-1', domainName: 'greenbatteryhub.com' },
            result: {
              eligible: true,
              reason: 'Looks like a strong buyer fit.',
              draft: {
                sequenceStep: 'initial',
                subject: 'greenbatteryhub.com - available',
                body: 'Hi there,\n\ngreenbatteryhub.com is available.\n',
                tone: 'standard',
                language: 'EN',
                recommendedFollowUpDays: 5,
                wordCount: 20,
                personalizationTokensUsed: ['lead.companyName'],
              },
            },
            meta: { outreachCount: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.endsWith('/api/domains/domain-1/leads/lead-1/outreach-workflow')) {
        return new Response(
          JSON.stringify({
            ok: true,
            item: {
              thread: {
                id: 'thread-1',
                leadId: 'lead-1',
                domainId: 'domain-1',
                status: 'draft_prepared',
                autoSendEnabled: false,
                lastMessageAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              },
              message: {
                id: 'msg-1',
                threadId: 'thread-1',
                direction: 'outbound',
                channel: 'email',
                subject: 'greenbatteryhub.com - available',
                body: 'Hi there,\n\ngreenbatteryhub.com is available.\n',
                classification: 'draft',
                createdAt: new Date().toISOString(),
              },
              followupTask: {
                id: 'followup-1',
                threadId: 'thread-1',
                dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'pending',
                createdAt: new Date().toISOString(),
              },
              lead: {
                id: 'lead-1',
                companyName: 'Volt Storage',
                contactName: 'Volt Storage',
              },
              domain: {
                id: 'domain-1',
                domainName: 'greenbatteryhub.com',
              },
              draft: {
                sequenceStep: 'initial',
                subject: 'greenbatteryhub.com - available',
                body: 'Hi there,\n\ngreenbatteryhub.com is available.\n',
                tone: 'standard',
                language: 'EN',
                recommendedFollowUpDays: 5,
                wordCount: 20,
                personalizationTokensUsed: ['lead.companyName'],
              },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
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
    await userEvent.click(screen.getByRole('button', { name: /generate outreach draft/i }))

    await screen.findByText(/looks like a strong buyer fit/i)
    expect(screen.getByText(/greenbatteryhub\.com - available/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /save to workflow/i }))
    await screen.findByText(/draft opgeslagen als outreach workflow/i)
    expect(screen.getByText(/saved outreach workflows/i)).toBeInTheDocument()
  })
})
