import { describe, it, expect } from 'vitest'
import { pickVariant } from './experiment-rotation'
import type { ExperimentVariantRecord } from './db/experiment-repository'

const makeVariant = (id: string, label: string): ExperimentVariantRecord => ({
  id,
  experimentId: 'exp-1',
  label,
  tone: 'standard',
  hasPrice: false,
  subjectSlot: 'default',
  followupDays1: 5,
  followupDays2: 7,
})

describe('pickVariant', () => {
  it('picks variant with fewest assignments', () => {
    const variants = [makeVariant('v-a', 'A'), makeVariant('v-b', 'B'), makeVariant('v-c', 'C')]
    const counts = { 'v-a': 5, 'v-b': 3, 'v-c': 5 }
    const picked = pickVariant(variants, counts)
    expect(picked.id).toBe('v-b')
  })

  it('picks first variant when all counts are equal', () => {
    const variants = [makeVariant('v-a', 'A'), makeVariant('v-b', 'B')]
    const counts = { 'v-a': 2, 'v-b': 2 }
    const picked = pickVariant(variants, counts)
    expect(picked.id).toBe('v-a')
  })

  it('treats missing count as zero', () => {
    const variants = [makeVariant('v-a', 'A'), makeVariant('v-b', 'B')]
    const counts = { 'v-a': 1 }
    const picked = pickVariant(variants, counts)
    expect(picked.id).toBe('v-b')
  })
})
