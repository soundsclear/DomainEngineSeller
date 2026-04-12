import { describe, expect, it } from 'vitest'
import { determineClosingNextStep } from './closing-rules'

describe('determineClosingNextStep', () => {
  it('keeps Stripe invoice deals from triggering transfer without explicit approval', () => {
    const result = determineClosingNextStep({
      closingMethod: 'stripe_invoice_manual_transfer',
      paymentSecured: true,
      buyerUsesXel: false,
      buyerApprovalState: 'approved',
    })

    expect(result.nextStatus).toBe('payment_secured')
    expect(result.registrarAction).toBeUndefined()
    expect(result.manualCheckpointRequired).toBe(true)
  })

  it('prefers Xel internal transfer when the buyer also uses Xel', () => {
    const result = determineClosingNextStep({
      closingMethod: 'escrow_com',
      paymentSecured: true,
      buyerUsesXel: true,
      buyerApprovalState: 'approved',
    })

    expect(result.registrarAction).toBe('internal_account_transfer')
  })
})
