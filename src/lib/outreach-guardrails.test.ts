import { describe, expect, it } from 'vitest'
import { canSendOutreach } from './outreach-guardrails'

describe('canSendOutreach', () => {
  it('blocks do-not-contact leads', () => {
    expect(
      canSendOutreach({
        doNotContact: true,
        outreachCount: 0,
        uninterested: false,
        autoSendEnabled: false,
        dailyLimit: 10,
      }).allowed,
    ).toBe(false)
  })

  it('allows conservative draft-first outreach', () => {
    expect(
      canSendOutreach({
        doNotContact: false,
        outreachCount: 1,
        uninterested: false,
        autoSendEnabled: false,
        dailyLimit: 10,
      }).allowed,
    ).toBe(true)
  })
})
