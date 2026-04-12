import { describe, expect, it, vi } from 'vitest'
import { classifyInquiry, draftReply } from './inquiry-intelligence'

const domain = {
  domainName: 'geboorteservies.nl',
  targetPrice: 4800,
  quickSalePrice: 2500,
  language: 'NL',
  tld: '.nl',
}

const baseInquiry = {
  senderName: 'Jan de Vries',
  senderEmail: 'jan@example.nl',
  message: 'Hallo, ik heb interesse in dit domein. Wat is de vraagprijs?',
  offerAmount: null as number | null,
  inquiryType: 'contact',
}

describe('classifyInquiry', () => {
  it('classifies a genuine offer as serious_offer', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          classification: 'serious_offer',
          reason: 'Offer near target price from an identifiable business.',
        },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({
      inquiry: { ...baseInquiry, offerAmount: 4500 },
      domain,
      client,
    })

    expect(result.classification).toBe('serious_offer')
    expect(result.reason).toBeTruthy()
    expect(client.generateObject).toHaveBeenCalledOnce()
  })

  it('classifies a very low offer as lowball', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: { classification: 'lowball', reason: 'Offer far below quick sale price.' },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({
      inquiry: { ...baseInquiry, offerAmount: 50 },
      domain,
      client,
    })

    expect(result.classification).toBe('lowball')
  })

  it('classifies a contact without offer as info_request', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: { classification: 'info_request', reason: 'No offer made, asking for price information.' },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({ inquiry: baseInquiry, domain, client })

    expect(result.classification).toBe('info_request')
    expect(result.reason).toBeTruthy()
  })

  it('classifies unrelated messages as spam', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: { classification: 'spam', reason: 'Unrelated to domain purchase.' },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await classifyInquiry({
      inquiry: { ...baseInquiry, message: 'Buy cheap SEO backlinks now!' },
      domain,
      client,
    })

    expect(result.classification).toBe('spam')
  })

  it('throws when no client is provided', async () => {
    await expect(
      classifyInquiry({ inquiry: baseInquiry, domain }),
    ).rejects.toThrow('AI client is required')
  })
})

describe('draftReply', () => {
  it('returns subject and body for an info request', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          subject: 'Re: Interesse in geboorteservies.nl',
          body: 'Hallo Jan,\n\nBedankt voor uw interesse in geboorteservies.nl.\n\nMet vriendelijke groet',
        },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await draftReply({
      inquiry: baseInquiry,
      domain,
      classification: 'info_request',
      client,
    })

    expect(result.subject).toBeTruthy()
    expect(result.body).toBeTruthy()
    expect(client.generateObject).toHaveBeenCalledOnce()
  })

  it('returns a reply for a serious offer', async () => {
    const client = {
      generateObject: vi.fn().mockResolvedValue({
        data: {
          subject: 'Re: Bod op geboorteservies.nl',
          body: 'Hallo Jan,\n\nDank u voor uw bod. Uw aanbod van EUR 4500 ligt dicht bij onze vraagprijs.\n\nMet vriendelijke groet',
        },
        rawText: '{}',
        model: 'claude-test',
        responseId: null,
      }),
    }

    const result = await draftReply({
      inquiry: { ...baseInquiry, offerAmount: 4500 },
      domain,
      classification: 'serious_offer',
      client,
    })

    expect(result.subject).toContain('geboorteservies')
    expect(result.body).toBeTruthy()
  })

  it('throws when no client is provided', async () => {
    await expect(
      draftReply({ inquiry: baseInquiry, domain, classification: 'info_request' }),
    ).rejects.toThrow('AI client is required')
  })
})
