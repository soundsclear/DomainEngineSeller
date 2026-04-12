import { describe, expect, it } from 'vitest'
import { parseDomainCsvRow, parseDomainCsvRows } from './csv-import'

describe('parseDomainCsvRow', () => {
  it('parses a valid row', () => {
    const result = parseDomainCsvRow({
      domain_name: 'test.nl',
      tld: '.nl',
      language: 'nl',
      category: 'marketing',
      status: 'listed',
      sell_mode: 'portfolio_redirect',
      current_registrar: 'xel',
      acquisition_cost: '45',
      annual_renewal_cost: '12',
      notes: 'Test domain',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.domainName).toBe('test.nl')
      expect(result.value.tld).toBe('.nl')
      expect(result.value.acquisitionCost).toBe(45)
      expect(result.value.annualRenewalCost).toBe(12)
    }
  })

  it('normalises tld to include leading dot', () => {
    const result = parseDomainCsvRow({
      domain_name: 'test.nl',
      tld: 'nl',
      language: 'nl',
      category: 'marketing',
      status: 'listed',
      sell_mode: 'portfolio_redirect',
      current_registrar: 'xel',
      acquisition_cost: '',
      annual_renewal_cost: '',
      notes: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.tld).toBe('.nl')
    }
  })

  it('returns error when domain_name is missing', () => {
    const result = parseDomainCsvRow({
      domain_name: '',
      tld: '.nl',
      language: 'nl',
      category: 'marketing',
      status: 'listed',
      sell_mode: 'portfolio_redirect',
      current_registrar: 'xel',
      acquisition_cost: '',
      annual_renewal_cost: '',
      notes: '',
    })
    expect(result.ok).toBe(false)
  })

  it('defaults missing optional fields', () => {
    const result = parseDomainCsvRow({
      domain_name: 'test.nl',
      tld: '.nl',
      language: '',
      category: '',
      status: '',
      sell_mode: '',
      current_registrar: '',
      acquisition_cost: '',
      annual_renewal_cost: '',
      notes: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.language).toBe('EN')
      expect(result.value.status).toBe('listed')
      expect(result.value.sellMode).toBe('portfolio_redirect')
      expect(result.value.currentRegistrar).toBe('xel')
      expect(result.value.acquisitionCost).toBe(0)
    }
  })
})

describe('parseDomainCsvRows', () => {
  it('returns parsed values and errors separately', () => {
    const result = parseDomainCsvRows([
      { domain_name: 'good.nl', tld: '.nl', language: 'nl', category: 'marketing', status: 'listed', sell_mode: 'portfolio_redirect', current_registrar: 'xel', acquisition_cost: '10', annual_renewal_cost: '12', notes: '' },
      { domain_name: '', tld: '.nl', language: 'nl', category: 'marketing', status: 'listed', sell_mode: 'portfolio_redirect', current_registrar: 'xel', acquisition_cost: '', annual_renewal_cost: '', notes: '' },
    ])
    expect(result.imported).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].row).toBe(1)
  })
})
