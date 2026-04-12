export interface OutreachEligibilityInput {
  doNotContact: boolean
  outreachCount: number
  uninterested: boolean
  autoSendEnabled: boolean
  dailyLimit: number
}

export function canSendOutreach(input: OutreachEligibilityInput) {
  if (input.doNotContact) {
    return { allowed: false, reason: 'Lead is marked do-not-contact.' }
  }

  if (input.uninterested) {
    return { allowed: false, reason: 'Lead already signaled disinterest.' }
  }

  if (input.outreachCount >= 3) {
    return { allowed: false, reason: 'Follow-up ceiling reached for conservative outreach.' }
  }

  if (input.autoSendEnabled && input.dailyLimit <= 0) {
    return { allowed: false, reason: 'Daily sending limit is exhausted.' }
  }

  return { allowed: true, reason: 'Eligible for draft-first outreach.' }
}
