export interface DomainCsvRow {
  domain_name: string
  tld: string
  language: string
  category: string
  status: string
  sell_mode: string
  current_registrar: string
  acquisition_cost: string
  annual_renewal_cost: string
  notes: string
}

export interface DomainImportInput {
  domainName: string
  tld: string
  language: string
  category: string
  status: string
  sellMode: string
  currentRegistrar: string
  acquisitionCost: number
  annualRenewalCost: number
  notes: string
  migrationCandidate: boolean
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseDomainCsvRow(row: DomainCsvRow): ParseResult<DomainImportInput> {
  if (!row.domain_name?.trim()) {
    return { ok: false, error: 'domain_name is required' }
  }

  const tld = row.tld?.trim() ?? ''
  const normalisedTld = tld.startsWith('.') ? tld : `.${tld}`

  return {
    ok: true,
    value: {
      domainName: row.domain_name.trim().toLowerCase(),
      tld: normalisedTld,
      language: row.language?.trim().toUpperCase() || 'EN',
      category: row.category?.trim() || 'general',
      status: row.status?.trim() || 'listed',
      sellMode: row.sell_mode?.trim() || 'portfolio_redirect',
      currentRegistrar: row.current_registrar?.trim() || 'xel',
      acquisitionCost: row.acquisition_cost ? Number(row.acquisition_cost) : 0,
      annualRenewalCost: row.annual_renewal_cost ? Number(row.annual_renewal_cost) : 0,
      notes: row.notes?.trim() || '',
      migrationCandidate: false,
    },
  }
}

export interface CsvImportResult {
  imported: DomainImportInput[]
  errors: Array<{ row: number; error: string }>
}

export function parseDomainCsvRows(rows: DomainCsvRow[]): CsvImportResult {
  const imported: DomainImportInput[] = []
  const errors: Array<{ row: number; error: string }> = []

  rows.forEach((row, index) => {
    const result = parseDomainCsvRow(row)
    if (result.ok) {
      imported.push(result.value)
    } else {
      errors.push({ row: index, error: result.error })
    }
  })

  return { imported, errors }
}
