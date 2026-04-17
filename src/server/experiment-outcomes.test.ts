import { it, expect } from 'vitest'
import { logOutcomeForThread, logOutcomeForLead } from './experiment-outcomes'

it('logOutcomeForThread is a function', () => {
  expect(typeof logOutcomeForThread).toBe('function')
})

it('logOutcomeForLead is a function', () => {
  expect(typeof logOutcomeForLead).toBe('function')
})
