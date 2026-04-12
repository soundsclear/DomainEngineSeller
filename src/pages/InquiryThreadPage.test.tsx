// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InquiryThreadPage } from './InquiryThreadPage'

function requestUrl(input: string | URL | Request) {
  if (typeof input === 'string') return input
  if (input instanceof Request) return input.url
  return input.toString()
}

describe('InquiryThreadPage', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('shows the negotiation CTA and linked deal state after generating a counter-offer', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input as string | URL | Request)

      if (url.endsWith('/api/inquiries/inquiry-1/thread')) {
        return new Response(
          JSON.stringify({
            inquiry: {
              id: 'inquiry-1',
              domainId: 'domain-1',
              threadId: 'thread-1',
              inquiryType: 'offer',
              senderName: 'Alice',
              senderEmail: 'alice@example.com',
              message: 'I can offer 4000.',
              offerAmount: 4000,
              status: 'read',
              classification: 'serious_offer',
              classificationReason: 'Strong offer.',
              createdAt: Date.now(),
              domainName: 'greenbatteryhub.com',
            },
            messages: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.endsWith('/api/inquiries/inquiry-1/negotiate')) {
        return new Response(
          JSON.stringify({
            ok: true,
            deal: { dealId: 'deal-1', created: true },
            draft: {
              id: 'msg-neg-1',
              payload: {
                suggestedPrice: 5200,
                reasoning: 'Buyer is close enough to justify a measured counter.',
                draftSubject: 'Re: Offer',
                draftBody: 'Thanks, we can do 5200.',
              },
            },
            negotiation: {
              suggestedPrice: 5200,
              reasoning: 'Buyer is close enough to justify a measured counter.',
              draftSubject: 'Re: Offer',
              draftBody: 'Thanks, we can do 5200.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(
      <MemoryRouter initialEntries={['/admin/inbox/inquiry-1']}>
        <Routes>
          <Route path="/admin/inbox/:inquiryId" element={<InquiryThreadPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: /suggest counter-offer/i })
    await userEvent.click(button)

    await screen.findByText(/counter-offer suggestion/i)
    expect(screen.getByText(/deal gestart/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open deals/i })).toHaveAttribute('href', '/admin/deals')
    expect(screen.getAllByText(/€\s*5\.200/).length).toBeGreaterThan(0)
  })
})
