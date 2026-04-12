# Deliverability And Outreach Safety

## Principles

- Keep outreach relevant, low-volume, and reviewable.
- Prefer plain-text messages and clear intent.
- Never design features to bypass spam filters.
- Protect sender reputation through authentication, throttling, and stop logic.

## MVP Rules

- default mode is draft-only
- respect `do_not_contact`
- cap repeated follow-ups
- stop after explicit disinterest
- maintain audit logs for drafts and classifications

## Future Auto-Send

If auto-send is introduced later, require:

- explicit feature flag
- conservative daily limits
- narrow eligibility
- human-review fallback
- full auditability
