import { it, expect } from 'vitest'
import { insertExperiment } from './experiment-repository'

it('insertExperiment returns record with id', () => {
  const exp = insertExperiment({ name: 'Test', status: 'active' })
  expect(exp).toMatchObject({ name: 'Test', status: 'active' })
  expect(typeof exp.id).toBe('string')
})
