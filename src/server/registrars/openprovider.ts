import type { RegistrarAdapter } from './adapter'

export const openproviderAdapter: RegistrarAdapter = {
  key: 'openprovider',
  name: 'Openprovider',
  capabilities: {
    supportsAvailabilityCheck: true,
    supportsRegistration: true,
    supportsRenewal: true,
    supportsTransfer: true,
    supportsNameserverUpdate: true,
    supportsContactUpdate: true,
    supportsStatusSync: true,
  },
  describeAuth() {
    return ['Openprovider API token', 'Environment-specific endpoint configuration']
  },
  async lookupDomain(domainName) {
    return { domainName, found: false }
  },
  async checkAvailability(domainName) {
    return { domainName, available: true }
  },
  async registerDomain(domainName) {
    return { ok: false, note: `Openprovider registration for ${domainName} is scaffolded but not yet live.` }
  },
  async renewDomain(domainName) {
    return { ok: false, note: `Openprovider renewal for ${domainName} is scaffolded but not yet live.` }
  },
  async transferDomain(domainName) {
    return { ok: false, note: `Openprovider transfer for ${domainName} is scaffolded but not yet live.` }
  },
  async updateNameservers(domainName) {
    return { ok: false, note: `Openprovider nameserver updates for ${domainName} are scaffold-only in this phase.` }
  },
  async updateContacts(domainName) {
    return { ok: false, note: `Openprovider contact updates for ${domainName} are scaffold-only in this phase.` }
  },
  async syncDomainStatus(reference) {
    return { ok: false, note: `Openprovider sync for ${reference} is not implemented yet.` }
  },
  async fetchOrderOrTransferStatus(reference) {
    return { ok: false, note: `Openprovider order status fetch for ${reference} is not implemented yet.` }
  },
}
