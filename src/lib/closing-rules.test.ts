import { describe, expect, it } from 'vitest'
import { determineClosingNextStep } from './closing-rules'

describe('determineClosingNextStep', () => {
  it('returns awaiting_payment when payment is not secured', () => {
    const result = determineClosingNextStep({
      closingMethod: 'escrow_com',
      paymentSecured: false,
      buyerUsesXel: false,
      buyerApprovalState: 'pending',
    })
    expect(result.nextStatus).toBe('awaiting_payment')
    expect(result.manualCheckpointRequired).toBe(false)
  })

  it('returns failed when buyer approval is disputed', () => {
    const result = determineClosingNextStep({
      closingMethod: 'escrow_com',
      paymentSecured: true,
      buyerUsesXel: false,
      buyerApprovalState: 'disputed',
    })
    expect(result.nextStatus).toBe('failed')
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
    expect(result.nextStatus).toBe('seller_transfer_required')
  })

  it('uses auth-code transfer when buyer uses another registrar', () => {
    const result = determineClosingNextStep({
      closingMethod: 'escrow_com',
      paymentSecured: true,
      buyerUsesXel: false,
      buyerApprovalState: 'approved',
    })
    expect(result.registrarAction).toBe('external_transfer_by_auth_code')
    expect(result.nextStatus).toBe('seller_transfer_required')
    expect(result.manualCheckpointRequired).toBe(true)
  })
})
