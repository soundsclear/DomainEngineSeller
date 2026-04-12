import { describe, expect, it } from 'vitest'
import { buildStripeInvoicePayload } from './stripe-invoice'

describe('buildStripeInvoicePayload', () => {
  const baseInput = {
    dealId: 'deal-abc123',
    domainName: 'example.nl',
    agreedPriceInCents: 250000,
    buyerName: 'Acme Corp',
    buyerEmail: 'buyer@acme.com',
  }

  it('sets the correct line item description including domain name', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.line_items[0].price_data.product_data.name).toBe('Domain sale: example.nl')
  })

  it('sets the correct amount in cents', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.line_items[0].price_data.unit_amount).toBe(250000)
  })

  it('includes dealId and domainName in metadata', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.metadata.dealId).toBe('deal-abc123')
    expect(payload.metadata.domainName).toBe('example.nl')
  })

  it('sets the customer email correctly', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.customer_email).toBe('buyer@acme.com')
  })

  it('defaults to EUR currency when not specified', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.line_items[0].price_data.currency).toBe('eur')
  })

  it('uses USD currency when specified', () => {
    const payload = buildStripeInvoicePayload({ ...baseInput, currency: 'USD' })
    expect(payload.line_items[0].price_data.currency).toBe('usd')
  })

  it('sets collection_method to send_invoice', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.collection_method).toBe('send_invoice')
  })

  it('sets days_until_due to 14', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.days_until_due).toBe(14)
  })

  it('includes buyerName in metadata', () => {
    const payload = buildStripeInvoicePayload(baseInput)
    expect(payload.metadata.buyerName).toBe('Acme Corp')
  })
})
