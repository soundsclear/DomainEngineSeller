import type { ClosingMethod, DealStatus, RegistrarActionType } from '@/types/domain'

export interface ClosingDecisionInput {
  closingMethod: ClosingMethod
  paymentSecured: boolean
  buyerUsesXel: boolean
  buyerApprovalState: 'pending' | 'approved' | 'disputed'
}

export interface ClosingDecisionResult {
  nextStatus: DealStatus
  registrarAction?: RegistrarActionType
  manualCheckpointRequired: boolean
  reason: string
}

export function determineClosingNextStep(input: ClosingDecisionInput): ClosingDecisionResult {
  if (!input.paymentSecured) {
    return {
      nextStatus: 'awaiting_payment',
      manualCheckpointRequired: false,
      reason: 'Payment is not yet secured.',
    }
  }

  if (input.buyerApprovalState === 'disputed') {
    return {
      nextStatus: 'failed',
      manualCheckpointRequired: true,
      reason: 'Buyer approval is disputed and needs intervention.',
    }
  }

  if (input.buyerUsesXel) {
    return {
      nextStatus: 'seller_transfer_required',
      registrarAction: 'internal_account_transfer',
      manualCheckpointRequired: true,
      reason: 'Buyer uses Xel, so internal transfer is the safest next step.',
    }
  }

  return {
    nextStatus: 'seller_transfer_required',
    registrarAction: 'external_transfer_by_auth_code',
    manualCheckpointRequired: true,
    reason: 'Buyer uses another registrar, so auth-code transfer prep is required.',
  }
}
