import { describe, expect, it } from 'vitest'
import { generateXelTransferPackage } from './xel-transfer'
import type { XelTransferInput } from './xel-transfer'

const baseInput: XelTransferInput = {
  domainName: 'cloudtax.nl',
  sellerXelAccount: 'seller-xel',
  buyer: {
    name: 'Acme BV',
    email: 'info@acmebv.nl',
  },
  dealReference: 'DEAL-001',
  agreedPrice: 2500,
  currency: 'EUR',
  transferMode: 'internal_account_transfer',
}

describe('generateXelTransferPackage – internal_account_transfer', () => {
  it('throws when buyer.xelAccount is missing', () => {
    expect(() =>
      generateXelTransferPackage({ ...baseInput, transferMode: 'internal_account_transfer' }),
    ).toThrow('buyer.xelAccount')
  })

  it('returns a complete package with correct transferMode', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    expect(pkg.transferMode).toBe('internal_account_transfer')
    expect(pkg.domainName).toBe('cloudtax.nl')
    expect(pkg.dealReference).toBe('DEAL-001')
  })

  it('includes at least 6 seller checklist items', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    expect(pkg.sellerChecklist.length).toBeGreaterThanOrEqual(6)
  })

  it('requires all seller checklist items', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    const allRequired = pkg.sellerChecklist.every((item) => item.required)
    expect(allRequired).toBe(true)
  })

  it('sets deadline within 5-7 days', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    const days = pkg.deadlines.map((d) => d.daysFromNow)
    expect(days).toContain(5)
    expect(days).toContain(7)
  })

  it('generates 2 manual checkpoints both blocking next step', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    expect(pkg.manualCheckpoints).toHaveLength(2)
    expect(pkg.manualCheckpoints.every((mc) => mc.blocksNextStep)).toBe(true)
  })

  it('includes buyer Xel account in supportRequestCopy', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    expect(pkg.supportRequestCopy).toContain('buyer-xel')
  })

  it('includes an audit log entry for package generation', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'buyer-xel' },
      transferMode: 'internal_account_transfer',
    })

    const entry = pkg.auditLogEntries.find((e) => e.event === 'xel_transfer_package_generated')
    expect(entry).toBeDefined()
    expect(entry?.actor).toBe('system')
  })
})

describe('generateXelTransferPackage – holder_change', () => {
  const holderInput: XelTransferInput = {
    ...baseInput,
    transferMode: 'holder_change',
  }

  it('returns transferMode holder_change', () => {
    const pkg = generateXelTransferPackage(holderInput)
    expect(pkg.transferMode).toBe('holder_change')
  })

  it('includes buyer email in supportRequestCopy', () => {
    const pkg = generateXelTransferPackage(holderInput)
    expect(pkg.supportRequestCopy).toContain('info@acmebv.nl')
  })

  it('requires new registrant fields in data package', () => {
    const pkg = generateXelTransferPackage(holderInput)
    const fieldNames = pkg.requiredDataPackage.map((f) => f.field)
    expect(fieldNames).toContain('New Registrant Name')
    expect(fieldNames).toContain('New Registrant Email')
    expect(fieldNames).toContain('New Registrant Phone')
    expect(fieldNames).toContain('New Registrant Country')
  })

  it('has 3 deadlines covering data receipt through WHOIS confirmation', () => {
    const pkg = generateXelTransferPackage(holderInput)
    expect(pkg.deadlines).toHaveLength(3)
  })

  it('has 3 manual checkpoints', () => {
    const pkg = generateXelTransferPackage(holderInput)
    expect(pkg.manualCheckpoints).toHaveLength(3)
  })

  it('includes buyer name in sellerFacingInstructions', () => {
    const pkg = generateXelTransferPackage(holderInput)
    expect(pkg.sellerFacingInstructions).toContain('Acme BV')
  })

  it('includes domain name in buyerFacingInstructions', () => {
    const pkg = generateXelTransferPackage(holderInput)
    expect(pkg.buyerFacingInstructions).toContain('cloudtax.nl')
  })
})

describe('generateXelTransferPackage – external_transfer_by_auth_code', () => {
  const externalInput: XelTransferInput = {
    ...baseInput,
    transferMode: 'external_transfer_by_auth_code',
    buyer: {
      ...baseInput.buyer,
      registrar: 'Dynadot',
    },
  }

  it('returns transferMode external_transfer_by_auth_code', () => {
    const pkg = generateXelTransferPackage(externalInput)
    expect(pkg.transferMode).toBe('external_transfer_by_auth_code')
  })

  it('includes auth code field in required data package', () => {
    const pkg = generateXelTransferPackage(externalInput)
    const fieldNames = pkg.requiredDataPackage.map((f) => f.field)
    expect(fieldNames).toContain('EPP / Auth Code')
  })

  it('mentions buyer registrar in buyer-facing instructions', () => {
    const pkg = generateXelTransferPackage(externalInput)
    expect(pkg.buyerFacingInstructions).toContain('Dynadot')
  })

  it('mentions transfer lock removal in seller checklist', () => {
    const pkg = generateXelTransferPackage(externalInput)
    const labels = pkg.sellerChecklist.map((i) => i.label.toLowerCase())
    expect(labels.some((l) => l.includes('lock'))).toBe(true)
  })

  it('has 3-day buyer initiation deadline and 7-day ICANN window', () => {
    const pkg = generateXelTransferPackage(externalInput)
    const days = pkg.deadlines.map((d) => d.daysFromNow)
    expect(days).toContain(3)
    expect(days).toContain(7)
  })

  it('has 4 manual checkpoints with correct blocking behaviour', () => {
    const pkg = generateXelTransferPackage(externalInput)
    expect(pkg.manualCheckpoints).toHaveLength(4)

    const blocking = pkg.manualCheckpoints.filter((mc) => mc.blocksNextStep)
    // mc1 (lock removed), mc3 (transfer approved), mc4 (domain gone) — 3 blocking
    expect(blocking).toHaveLength(3)
  })

  it('includes seller account in supportRequestCopy', () => {
    const pkg = generateXelTransferPackage(externalInput)
    expect(pkg.supportRequestCopy).toContain('seller-xel')
  })

  it('works without optional buyer.registrar', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      transferMode: 'external_transfer_by_auth_code',
    })
    expect(pkg.transferMode).toBe('external_transfer_by_auth_code')
    expect(pkg.buyerFacingInstructions).toContain('your registrar')
  })
})

describe('generateXelTransferPackage – shared behaviour', () => {
  it('rejects invalid email', () => {
    expect(() =>
      generateXelTransferPackage({
        ...baseInput,
        buyer: { ...baseInput.buyer, email: 'not-an-email', xelAccount: 'x' },
        transferMode: 'internal_account_transfer',
      }),
    ).toThrow()
  })

  it('rejects negative agreedPrice', () => {
    expect(() =>
      generateXelTransferPackage({
        ...baseInput,
        buyer: { ...baseInput.buyer, xelAccount: 'x' },
        transferMode: 'internal_account_transfer',
        agreedPrice: -100,
      }),
    ).toThrow()
  })

  it('includes generatedAt as valid ISO string', () => {
    const pkg = generateXelTransferPackage({
      ...baseInput,
      buyer: { ...baseInput.buyer, xelAccount: 'x' },
      transferMode: 'internal_account_transfer',
    })
    expect(() => new Date(pkg.generatedAt)).not.toThrow()
    expect(new Date(pkg.generatedAt).toISOString()).toBe(pkg.generatedAt.replace('Z', '.000Z').replace('.000Z', 'Z') || pkg.generatedAt)
  })

  it('always includes agreed price in the required data package', () => {
    for (const mode of ['internal_account_transfer', 'holder_change', 'external_transfer_by_auth_code'] as const) {
      const pkg = generateXelTransferPackage({
        ...baseInput,
        buyer: mode === 'internal_account_transfer' ? { ...baseInput.buyer, xelAccount: 'x' } : baseInput.buyer,
        transferMode: mode,
      })
      const priceField = pkg.requiredDataPackage.find((f) => f.field === 'Agreed Sale Price')
      expect(priceField).toBeDefined()
      expect(priceField?.value).toContain('2500')
    }
  })
})
