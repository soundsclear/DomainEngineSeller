import type { RegistrarAdapter } from './adapter'
export { generateXelTransferPackage } from '@/lib/xel-transfer'
export type { XelTransferInput, XelTransferPackage } from '@/lib/xel-transfer'

export const xelAdapter: RegistrarAdapter = {
  key: 'xel',
  name: 'Xel',
  capabilities: {
    supportsAvailabilityCheck: false,
    supportsRegistration: false,
    supportsRenewal: false,
    supportsTransfer: true,
    supportsNameserverUpdate: false,
    supportsContactUpdate: false,
    supportsStatusSync: true,
  },
  describeAuth() {
    return ['Support email address', 'Optional internal account identifier', 'Manual operator notes']
  },
  async lookupDomain(domainName) {
    return { domainName, found: true }
  },
  async checkAvailability(domainName) {
    return { domainName, available: false }
  },
  async registerDomain() {
    return { ok: false, note: 'Registration is not automated for the Xel Phase 1 adapter.' }
  },
  async renewDomain(domainName) {
    return { ok: false, note: `Renewal for ${domainName} remains manual until an API-first registrar is active.` }
  },
  async transferDomain(domainName) {
    return { ok: true, note: `Prepare one of the Xel transfer checklists for ${domainName}.` }
  },
  async updateNameservers(domainName) {
    return { ok: false, note: `Nameserver updates for ${domainName} are tracked but executed manually.` }
  },
  async updateContacts(domainName) {
    return { ok: false, note: `Contact changes for ${domainName} should produce holder-change preparation text.` }
  },
  async syncDomainStatus(reference) {
    return { ok: true, note: `Status sync for Xel remains a manual audit step. Reference: ${reference}` }
  },
  async fetchOrderOrTransferStatus(reference) {
    return { ok: true, note: `Check manual checkpoint state for Xel reference ${reference}.` }
  },
}
