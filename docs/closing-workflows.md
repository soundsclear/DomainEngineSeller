# Closing Workflows

## Approved Closing Methods

- `escrow_com`
- `sedo_transfer`
- `afternic_network`
- `stripe_invoice_manual_transfer`

## Direct Deal Defaults

Direct deals should default to escrow-first workflows unless a platform-managed transfer already governs the sale.

## Stripe Constraint

Stripe supports invoices, deposits, and low-risk approved flows. It is not the default direct domain transfer method.

A paid invoice must not automatically trigger transfer. Invoice-only transfer requires explicit admin approval and a matching transfer checklist.

## Registrar Action Engine

After payment is secured, determine the next registrar action:

- prefer Xel internal transfer when buyer is also on Xel
- use holder change when ownership can change without registrar exit
- use auth-code transfer when the buyer wants another registrar

Every action must generate:

- buyer instructions
- seller instructions
- required fields
- deadlines
- manual checkpoint markers
- audit log entries
