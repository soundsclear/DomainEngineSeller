export interface StripeInvoiceLineItem {
  price_data: {
    currency: string
    product_data: {
      name: string
    }
    unit_amount: number
  }
  quantity: 1
}

export interface StripeInvoicePayload {
  customer_email: string
  collection_method: 'send_invoice'
  days_until_due: 14
  line_items: StripeInvoiceLineItem[]
  metadata: {
    dealId: string
    domainName: string
    buyerName: string
  }
}

export interface BuildStripeInvoicePayloadInput {
  dealId: string
  domainName: string
  agreedPriceInCents: number
  buyerName: string
  buyerEmail: string
  currency?: 'EUR' | 'USD'
}

export function buildStripeInvoicePayload(input: BuildStripeInvoicePayloadInput): StripeInvoicePayload {
  const currency = (input.currency ?? 'EUR').toLowerCase()

  return {
    customer_email: input.buyerEmail,
    collection_method: 'send_invoice',
    days_until_due: 14,
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `Domain sale: ${input.domainName}`,
          },
          unit_amount: input.agreedPriceInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      dealId: input.dealId,
      domainName: input.domainName,
      buyerName: input.buyerName,
    },
  }
}
