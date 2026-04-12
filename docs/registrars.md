# Registrar Strategy

## Phase 1 Constraint

The live portfolio remains at Xel. Domain Seller Engine must ship without forcing migration away from Xel.

## Adapter Model

Every registrar adapter should expose:

- adapter metadata and capability flags
- auth configuration requirements
- domain lookup
- availability checks
- register
- renew
- transfer
- nameserver updates
- contact updates
- status sync
- order or transfer status fetch

## Xel

Xel is modeled as a semi-automated adapter. It should:

- mark Xel as current registrar of record
- prepare `internal_account_transfer`, `holder_change`, and `external_transfer_by_auth_code` workflows
- generate request text and support text
- assemble buyer and seller checklists
- track pending confirmations and deadlines
- preserve a full audit trail for manual steps

## Dynadot And Openprovider

These begin as scaffolds and become activation targets in Phase 2.

Required migration fields per domain:

- `current_registrar`
- `target_registrar`
- `migration_candidate`
- `transfer_eligibility`
- `migration_priority`
- `migration_notes`
