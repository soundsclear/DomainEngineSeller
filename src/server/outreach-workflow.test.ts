import { describe, expect, it } from 'vitest'
import { createLeadOutreachWorkflow } from './outreach-workflow'

describe('createLeadOutreachWorkflow', () => {
  it('creates a thread, draft message, and pending follow-up for initial outreach', () => {
    const record = createLeadOutreachWorkflow({
      leadId: 'lead-1',
      sender: {
        name: 'Jan Seller',
        email: 'jan@dse.example',
      },
      outreachCount: 0,
      tone: 'standard',
    })

    expect(record.thread.leadId).toBe('lead-1')
    expect(record.message.classification).toBe('draft')
    expect(record.followupTask.status).toBe('pending')
    expect(record.followupTask.dueAt).not.toBeNull()
  })

  it('marks final follow-up as not needing another task', () => {
    const record = createLeadOutreachWorkflow({
      leadId: 'lead-1',
      sender: {
        name: 'Jan Seller',
        email: 'jan@dse.example',
      },
      outreachCount: 2,
      tone: 'concise',
    })

    expect(record.draft.sequenceStep).toBe('follow_up_2')
    expect(record.followupTask.status).toBe('not_needed')
    expect(record.followupTask.dueAt).toBeNull()
  })

  it('rejects ineligible outreach saves', () => {
    expect(() =>
      createLeadOutreachWorkflow({
        leadId: 'lead-1',
        sender: {
          name: 'Jan Seller',
          email: 'jan@dse.example',
        },
        outreachCount: 3,
      }),
    ).toThrow()
  })
})
