import type { DomainPageContentRecord } from '@/lib/domain-page-content'

export type DomainStatus =
  | 'draft'
  | 'listed'
  | 'inbound_only'
  | 'outbound_research'
  | 'negotiation'
  | 'deal_in_progress'
  | 'sold'
  | 'drop_candidate'

export type SellMode = 'afternic_lander' | 'sedo_lander' | 'portfolio_redirect'

export type ClosingMethod =
  | 'escrow_com'
  | 'sedo_transfer'
  | 'afternic_network'
  | 'stripe_invoice_manual_transfer'

export type DealStatus =
  | 'offer_accepted'
  | 'awaiting_payment'
  | 'payment_secured'
  | 'seller_transfer_required'
  | 'transfer_in_progress'
  | 'buyer_review'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RegistrarActionType =
  | 'internal_account_transfer'
  | 'holder_change'
  | 'external_transfer_by_auth_code'

export interface DomainRecord {
  id: string
  domainName: string
  tld: string
  language: string
  category: string
  status: DomainStatus
  sellMode: SellMode
  currentRegistrar: 'xel' | 'dynadot' | 'openprovider'
  acquisitionCost: number
  annualRenewalCost: number
  targetPrice: number
  quickSalePrice: number
  aspirationalPrice: number
  migrationCandidate: boolean
  targetRegistrar?: 'dynadot' | 'openprovider'
  notes: string
}

export interface PublicPortfolioDomainRecord extends DomainRecord {
  slug: string
  heroSubheadline: string | null
}

export interface PublicDomainRecord {
  slug: string
  domain: DomainRecord
  content: DomainPageContentRecord | null
}

export interface LeadRecord {
  id: string
  domainId: string
  companyName: string
  website: string
  contactName: string
  contactEmail: string
  buyerFitReason: string
  priorityScore: number
  doNotContact: boolean
  country: string
  source: string
}

export interface DealRecord {
  id: string
  domainId: string
  leadId: string
  closingMethod: ClosingMethod
  status: DealStatus
  agreedPrice: number
  paymentSecured: boolean
  buyerApprovalState: 'pending' | 'approved' | 'disputed'
}
