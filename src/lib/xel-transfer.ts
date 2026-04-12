import { z } from 'zod'
import type { RegistrarActionType } from '@/types/domain'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const xelTransferInputSchema = z.object({
  domainName: z.string().min(1),
  transferMode: z.enum(['internal_account_transfer', 'holder_change', 'external_transfer_by_auth_code']),
  sellerXelAccount: z.string().min(1),
  buyer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    /** Required for internal_account_transfer */
    xelAccount: z.string().optional(),
    /** Destination registrar name for external_transfer_by_auth_code */
    registrar: z.string().optional(),
  }),
  dealReference: z.string().min(1),
  agreedPrice: z.number().positive(),
  currency: z.string().default('EUR'),
})

export type XelTransferInput = z.infer<typeof xelTransferInputSchema>

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string
  label: string
  required: boolean
  note?: string
}

export interface DataField {
  field: string
  placeholder: string
  required: boolean
  /** Pre-filled when known from input */
  value?: string
}

export interface Deadline {
  label: string
  daysFromNow: number
  /** ISO date string */
  absoluteDate: string
  critical: boolean
}

export interface ManualCheckpoint {
  id: string
  description: string
  requiresAdminConfirmation: boolean
  /** Cannot proceed to next deal step until this is cleared */
  blocksNextStep: boolean
}

export interface AuditEntry {
  timestamp: string
  actor: 'system'
  event: string
  details: string
}

export interface XelTransferPackage {
  domainName: string
  transferMode: RegistrarActionType
  dealReference: string
  generatedAt: string
  sellerChecklist: ChecklistItem[]
  buyerChecklist: ChecklistItem[]
  requiredDataPackage: DataField[]
  supportRequestCopy: string
  sellerFacingInstructions: string
  buyerFacingInstructions: string
  deadlines: Deadline[]
  manualCheckpoints: ManualCheckpoint[]
  auditLogEntries: AuditEntry[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Mode: internal_account_transfer
// ---------------------------------------------------------------------------

function buildInternalTransfer(input: XelTransferInput): XelTransferPackage {
  const { domainName, buyer, dealReference, agreedPrice, currency, sellerXelAccount } = input

  const sellerChecklist: ChecklistItem[] = [
    { id: 's1', label: 'Confirm domain status is Active and unlocked in your Xel account', required: true },
    { id: 's2', label: `Obtain buyer's Xel account ID: ${buyer.xelAccount ?? '(not yet provided)'}`, required: true },
    { id: 's3', label: 'Initiate push transfer from your Xel control panel using the buyer account ID', required: true },
    { id: 's4', label: 'Record the Xel push reference number in the deal notes', required: true },
    { id: 's5', label: 'Notify buyer that the push has been initiated', required: true },
    { id: 's6', label: 'Wait up to 5 business days for buyer to accept', required: true },
    { id: 's7', label: 'Verify domain no longer appears in your Xel portfolio', required: true },
    { id: 's8', label: 'Mark transfer step as complete in the deal record', required: true },
  ]

  const buyerChecklist: ChecklistItem[] = [
    { id: 'b1', label: 'Log in to your Xel account and check for an incoming domain push', required: true },
    { id: 'b2', label: `Accept the push for ${domainName}`, required: true },
    { id: 'b3', label: 'Confirm the domain appears in your Xel portfolio', required: true },
    { id: 'b4', label: 'Reply to seller confirming receipt', required: true },
  ]

  const requiredDataPackage: DataField[] = [
    { field: 'Seller Xel Account', placeholder: 'your-xel-username', required: true, value: sellerXelAccount },
    { field: 'Buyer Xel Account', placeholder: 'buyer-xel-username', required: true, value: buyer.xelAccount },
    { field: 'Domain Name', placeholder: 'example.com', required: true, value: domainName },
    { field: 'Xel Push Reference', placeholder: 'XEL-PUSH-XXXXXX', required: true },
    { field: 'Agreed Sale Price', placeholder: '1500', required: true, value: `${agreedPrice} ${currency}` },
  ]

  const supportRequestCopy = `Subject: Domain Push Transfer Request – ${domainName}

Dear Xel Support,

I would like to initiate an internal account transfer (push) for the following domain:

  Domain: ${domainName}
  From account: ${sellerXelAccount}
  To account: ${buyer.xelAccount ?? '[BUYER XEL ACCOUNT ID]'}
  Deal reference: ${dealReference}

Please confirm once the push is visible in the recipient account. If there are any issues, contact me at this email address.

Kind regards,
[Seller Name]`

  const sellerFacingInstructions = `Internal Xel Transfer – Seller Steps for ${domainName}

1. Log in to Xel and navigate to your domain portfolio.
2. Select ${domainName} and choose "Push/Transfer to Another Xel Account".
3. Enter the buyer's Xel account ID: ${buyer.xelAccount ?? '[PROVIDED BY BUYER]'}.
4. Confirm the push and note the reference number.
5. Notify ${buyer.name} <${buyer.email}> that the push is waiting for their acceptance.
6. If the push is not accepted within 5 business days, contact Xel support or re-initiate.

Do not release any auth codes — this is an internal push and no auth code is required.`

  const buyerFacingInstructions = `Internal Xel Transfer – Buyer Steps for ${domainName}

1. Log in to your Xel account.
2. Check your incoming transfers or notifications for a push from ${sellerXelAccount}.
3. Review the domain (${domainName}) and click Accept.
4. Once accepted, verify the domain appears in your portfolio.
5. Confirm receipt by replying to the seller at the email used for this deal.

If the push does not appear within 1 business day, contact Xel support or notify the seller.`

  const deadlines: Deadline[] = [
    {
      label: 'Buyer must accept push',
      daysFromNow: 5,
      absoluteDate: addDays(5),
      critical: true,
    },
    {
      label: 'Transfer fully confirmed',
      daysFromNow: 7,
      absoluteDate: addDays(7),
      critical: true,
    },
  ]

  const manualCheckpoints: ManualCheckpoint[] = [
    {
      id: 'mc1',
      description: 'Admin confirms push was initiated in Xel and reference number is recorded',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
    {
      id: 'mc2',
      description: 'Admin confirms buyer has accepted and domain is in buyer account',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
  ]

  const auditLogEntries: AuditEntry[] = [
    {
      timestamp: nowIso(),
      actor: 'system',
      event: 'xel_transfer_package_generated',
      details: `Internal account transfer package generated for ${domainName} (deal: ${dealReference}). Buyer Xel account: ${buyer.xelAccount ?? 'not yet provided'}.`,
    },
  ]

  return {
    domainName,
    transferMode: 'internal_account_transfer',
    dealReference,
    generatedAt: nowIso(),
    sellerChecklist,
    buyerChecklist,
    requiredDataPackage,
    supportRequestCopy,
    sellerFacingInstructions,
    buyerFacingInstructions,
    deadlines,
    manualCheckpoints,
    auditLogEntries,
  }
}

// ---------------------------------------------------------------------------
// Mode: holder_change
// ---------------------------------------------------------------------------

function buildHolderChange(input: XelTransferInput): XelTransferPackage {
  const { domainName, buyer, dealReference, agreedPrice, currency, sellerXelAccount } = input

  const sellerChecklist: ChecklistItem[] = [
    { id: 's1', label: 'Verify your current registrant details in Xel are accurate', required: true },
    { id: 's2', label: 'Collect complete registrant data from buyer (see required data package)', required: true },
    { id: 's3', label: 'Submit a holder change request to Xel support with the new registrant details', required: true },
    { id: 's4', label: 'Attach or reference the deal agreement in the support ticket', required: true },
    { id: 's5', label: 'Wait for Xel to send authorization emails to both parties', required: true },
    { id: 's6', label: 'Authorize the holder change from your side when prompted', required: true },
    { id: 's7', label: 'Confirm updated WHOIS reflects buyer registrant details', required: true },
    {
      id: 's8',
      label: 'Record ticket number and completion date in deal notes',
      required: true,
    },
  ]

  const buyerChecklist: ChecklistItem[] = [
    { id: 'b1', label: 'Provide full registrant details to seller (see required data package)', required: true },
    { id: 'b2', label: 'Check email for a holder change authorization request from Xel', required: true },
    { id: 'b3', label: 'Complete the authorization step within the deadline', required: true, note: 'Links expire — act promptly' },
    { id: 'b4', label: 'Verify WHOIS shows your details as new registrant', required: true },
    { id: 'b5', label: 'Confirm with seller once WHOIS is updated', required: true },
  ]

  const requiredDataPackage: DataField[] = [
    { field: 'Seller Xel Account', placeholder: 'your-xel-username', required: true, value: sellerXelAccount },
    { field: 'Domain Name', placeholder: 'example.com', required: true, value: domainName },
    { field: 'New Registrant Name', placeholder: 'Full legal name or company name', required: true, value: buyer.name },
    { field: 'New Registrant Email', placeholder: 'registrant@example.com', required: true, value: buyer.email },
    { field: 'New Registrant Phone', placeholder: '+31612345678', required: true },
    { field: 'New Registrant Address', placeholder: 'Street, City, Postal Code', required: true },
    { field: 'New Registrant Country', placeholder: 'NL', required: true },
    { field: 'Xel Support Ticket Number', placeholder: 'XEL-TICKET-XXXXXX', required: true },
    { field: 'Agreed Sale Price', placeholder: '1500', required: true, value: `${agreedPrice} ${currency}` },
  ]

  const supportRequestCopy = `Subject: Holder Change Request – ${domainName}

Dear Xel Support,

I would like to request a holder change for the following domain:

  Domain: ${domainName}
  Current registrant / account: ${sellerXelAccount}
  Deal reference: ${dealReference}

New registrant details:
  Name: ${buyer.name}
  Email: ${buyer.email}
  Phone: [BUYER PHONE]
  Address: [BUYER ADDRESS]
  Country: [BUYER COUNTRY]

Both parties consent to this change. Please send the authorization emails to both the current and new registrant at your earliest convenience.

Kind regards,
[Seller Name]`

  const sellerFacingInstructions = `Holder Change – Seller Steps for ${domainName}

1. Ask the buyer (${buyer.name}) to provide their full registrant details (name, email, phone, address, country).
2. Log in to Xel and confirm your current registrant record is accurate.
3. Contact Xel support (support ticket) requesting a holder change for ${domainName}.
4. Include ${buyer.name}'s details and reference deal ${dealReference}.
5. When Xel sends an authorization email to you, complete the authorization immediately.
6. Once both parties have authorized, Xel will update the registrant.
7. Check WHOIS within 48 hours to verify the new registrant (${buyer.name}) is live.
8. Record the ticket number and completion date in the deal.`

  const buyerFacingInstructions = `Holder Change – Buyer Steps for ${domainName}

1. Send the seller your full registrant details:
   - Legal name (or company name)
   - Email address
   - Phone number (international format)
   - Street address, city, postal code, country
2. Watch for an authorization email from Xel — act promptly, links expire.
3. Complete the holder change authorization in the email.
4. After completion, verify your name appears as registrant in the public WHOIS for ${domainName}.
5. Notify the seller once WHOIS is confirmed.`

  const deadlines: Deadline[] = [
    {
      label: 'Buyer must provide registrant data',
      daysFromNow: 2,
      absoluteDate: addDays(2),
      critical: true,
    },
    {
      label: 'Authorization emails must be acted on',
      daysFromNow: 7,
      absoluteDate: addDays(7),
      critical: true,
    },
    {
      label: 'WHOIS update confirmed',
      daysFromNow: 10,
      absoluteDate: addDays(10),
      critical: false,
    },
  ]

  const manualCheckpoints: ManualCheckpoint[] = [
    {
      id: 'mc1',
      description: 'Admin confirms full registrant data received from buyer',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
    {
      id: 'mc2',
      description: 'Admin confirms Xel support ticket submitted and reference recorded',
      requiresAdminConfirmation: true,
      blocksNextStep: false,
    },
    {
      id: 'mc3',
      description: 'Admin confirms both parties have completed authorization and WHOIS is updated',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
  ]

  const auditLogEntries: AuditEntry[] = [
    {
      timestamp: nowIso(),
      actor: 'system',
      event: 'xel_transfer_package_generated',
      details: `Holder change package generated for ${domainName} (deal: ${dealReference}). New registrant: ${buyer.name} <${buyer.email}>.`,
    },
  ]

  return {
    domainName,
    transferMode: 'holder_change',
    dealReference,
    generatedAt: nowIso(),
    sellerChecklist,
    buyerChecklist,
    requiredDataPackage,
    supportRequestCopy,
    sellerFacingInstructions,
    buyerFacingInstructions,
    deadlines,
    manualCheckpoints,
    auditLogEntries,
  }
}

// ---------------------------------------------------------------------------
// Mode: external_transfer_by_auth_code
// ---------------------------------------------------------------------------

function buildExternalTransfer(input: XelTransferInput): XelTransferPackage {
  const { domainName, buyer, dealReference, agreedPrice, currency, sellerXelAccount } = input

  const sellerChecklist: ChecklistItem[] = [
    {
      id: 's1',
      label: 'Confirm domain is older than 60 days (ICANN transfer lock period)',
      required: true,
      note: 'Newly registered or recently transferred domains cannot be moved for 60 days',
    },
    { id: 's2', label: 'Remove any registrar lock / transfer-lock in your Xel account', required: true },
    { id: 's3', label: 'Request the EPP / auth code for the domain from Xel', required: true },
    {
      id: 's4',
      label: 'Send auth code to buyer securely — do not share via unencrypted channels if avoidable',
      required: true,
    },
    {
      id: 's5',
      label: 'Wait for buyer to initiate the transfer at their registrar',
      required: true,
    },
    {
      id: 's6',
      label: 'Monitor your Xel account for a transfer request notification',
      required: true,
    },
    {
      id: 's7',
      label: 'When prompted, APPROVE the outgoing transfer — do not deny or ignore',
      required: true,
      note: 'Ignoring for 5 days also completes the transfer, but explicit approval is faster',
    },
    { id: 's8', label: 'Confirm domain has left your Xel portfolio', required: true },
    { id: 's9', label: 'Record completion date and buyer confirmation in deal notes', required: true },
  ]

  const buyerChecklist: ChecklistItem[] = [
    {
      id: 'b1',
      label: `Log in to ${buyer.registrar ?? 'your registrar'} and start an incoming domain transfer`,
      required: true,
    },
    { id: 'b2', label: `Enter the domain name: ${domainName}`, required: true },
    { id: 'b3', label: 'Enter the auth code provided by the seller', required: true },
    { id: 'b4', label: 'Pay any renewal or transfer fee required by your registrar', required: false },
    { id: 'b5', label: 'Watch for a confirmation email from your registrar once transfer is accepted', required: true },
    {
      id: 'b6',
      label: 'Confirm domain appears in your portfolio within 7 business days',
      required: true,
    },
    { id: 'b7', label: 'Notify seller of successful transfer', required: true },
  ]

  const requiredDataPackage: DataField[] = [
    { field: 'Seller Xel Account', placeholder: 'your-xel-username', required: true, value: sellerXelAccount },
    { field: 'Domain Name', placeholder: 'example.com', required: true, value: domainName },
    { field: 'Buyer Name', placeholder: 'Full name or company', required: true, value: buyer.name },
    { field: 'Buyer Email', placeholder: 'buyer@example.com', required: true, value: buyer.email },
    {
      field: 'Buyer Registrar',
      placeholder: 'Dynadot / Namecheap / etc.',
      required: false,
      value: buyer.registrar,
    },
    { field: 'EPP / Auth Code', placeholder: 'Obtained from Xel — share securely', required: true },
    { field: 'Transfer Lock Removal Date', placeholder: 'YYYY-MM-DD', required: true },
    { field: 'Transfer Initiated Date', placeholder: 'YYYY-MM-DD', required: true },
    { field: 'Transfer Completion Date', placeholder: 'YYYY-MM-DD', required: true },
    { field: 'Agreed Sale Price', placeholder: '1500', required: true, value: `${agreedPrice} ${currency}` },
  ]

  const supportRequestCopy = `Subject: Transfer Lock Removal and Auth Code Request – ${domainName}

Dear Xel Support,

Please remove the transfer lock and provide the EPP (auth) code for the following domain:

  Domain: ${domainName}
  Account: ${sellerXelAccount}
  Deal reference: ${dealReference}

The buyer is initiating an outgoing transfer to their registrar${buyer.registrar ? ` (${buyer.registrar})` : ''}. I will approve any incoming transfer request promptly.

Kind regards,
[Seller Name]`

  const sellerFacingInstructions = `External Transfer (Auth Code) – Seller Steps for ${domainName}

1. Log in to Xel and navigate to ${domainName}.
2. Disable the transfer lock / registrar lock if active.
3. Request the EPP auth code — Xel may email it or display it in the panel.
4. Send the auth code to ${buyer.name} <${buyer.email}> securely.
5. Buyer will initiate the transfer at their registrar. This usually takes 5–7 days.
6. Keep an eye on your Xel account for an outgoing transfer approval request.
7. Approve it promptly — do not deny. Ignoring it for 5 days will auto-approve.
8. Once confirmed, mark the transfer step complete in the deal record.

Important: Auth codes expire. If the buyer has not initiated within 3 days, request a new code.`

  const buyerFacingInstructions = `External Transfer (Auth Code) – Buyer Steps for ${domainName}

1. Log in to ${buyer.registrar ?? 'your registrar'}.
2. Start a domain transfer and enter: ${domainName}
3. When prompted, enter the auth code provided by the seller.
4. Complete any payment required by your registrar.
5. Your registrar will contact Xel to confirm the transfer.
6. The transfer window is up to 7 days. You may receive an email to confirm.
7. Once complete, the domain will appear in your portfolio.
8. Notify the seller by replying to this deal's email thread.

Note: Auth codes are time-limited. Use it within 3 days of receiving it.`

  const deadlines: Deadline[] = [
    {
      label: 'Buyer must initiate transfer at their registrar',
      daysFromNow: 3,
      absoluteDate: addDays(3),
      critical: true,
    },
    {
      label: 'ICANN standard transfer window closes',
      daysFromNow: 7,
      absoluteDate: addDays(7),
      critical: true,
    },
    {
      label: 'Transfer fully confirmed in buyer portfolio',
      daysFromNow: 10,
      absoluteDate: addDays(10),
      critical: true,
    },
  ]

  const manualCheckpoints: ManualCheckpoint[] = [
    {
      id: 'mc1',
      description: 'Admin confirms transfer lock removed and auth code obtained from Xel',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
    {
      id: 'mc2',
      description: 'Admin confirms auth code was sent to buyer securely',
      requiresAdminConfirmation: true,
      blocksNextStep: false,
    },
    {
      id: 'mc3',
      description: 'Admin approves outgoing transfer request in Xel (or confirms auto-approval after 5 days)',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
    {
      id: 'mc4',
      description: 'Admin confirms domain has left Xel portfolio and buyer has acknowledged receipt',
      requiresAdminConfirmation: true,
      blocksNextStep: true,
    },
  ]

  const auditLogEntries: AuditEntry[] = [
    {
      timestamp: nowIso(),
      actor: 'system',
      event: 'xel_transfer_package_generated',
      details: `External auth-code transfer package generated for ${domainName} (deal: ${dealReference}). Buyer: ${buyer.name} <${buyer.email}>${buyer.registrar ? `, destination registrar: ${buyer.registrar}` : ''}.`,
    },
  ]

  return {
    domainName,
    transferMode: 'external_transfer_by_auth_code',
    dealReference,
    generatedAt: nowIso(),
    sellerChecklist,
    buyerChecklist,
    requiredDataPackage,
    supportRequestCopy,
    sellerFacingInstructions,
    buyerFacingInstructions,
    deadlines,
    manualCheckpoints,
    auditLogEntries,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a complete Xel transfer package for a domain sale.
 *
 * Covers all three Xel transfer modes:
 *   - internal_account_transfer  (both parties on Xel)
 *   - holder_change              (ownership change, staying on Xel)
 *   - external_transfer_by_auth_code  (buyer moves to another registrar)
 *
 * This is a pure function — no I/O, no side effects.
 * Persist the result and write an audit log entry in the calling layer.
 */
export function generateXelTransferPackage(rawInput: XelTransferInput): XelTransferPackage {
  const input = xelTransferInputSchema.parse(rawInput)

  if (input.transferMode === 'internal_account_transfer') {
    if (!input.buyer.xelAccount) {
      throw new Error('internal_account_transfer requires buyer.xelAccount')
    }
    return buildInternalTransfer(input)
  }

  if (input.transferMode === 'holder_change') {
    return buildHolderChange(input)
  }

  return buildExternalTransfer(input)
}
