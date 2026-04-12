import type { RegistrarAdapter } from './adapter'

export const dynadotAdapter: RegistrarAdapter = {
  key: 'dynadot',
  name: 'Dynadot',
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
    return ['Dynadot API key', 'Optional IP allowlist or account restrictions']
  },
  async lookupDomain(domainName) {
    return { domainName, found: false }
  },
  async checkAvailability(domainName) {
    return { domainName, available: true }
  },
  async registerDomain(domainName) {
    return { ok: false, note: `Registration for ${domainName} is scaffolded but not yet implemented.` }
  },
  async renewDomain(domainName) {
    return { ok: false, note: `Renewal for ${domainName} is scaffolded but not yet implemented.` }
  },
  async transferDomain(domainName) {
    return { ok: false, note: `Transfer for ${domainName} is scaffolded but not yet implemented.` }
  },
  async updateNameservers(domainName) {
    return { ok: false, note: `Nameserver updates for ${domainName} are scaffold-only in this phase.` }
  },
  async updateContacts(domainName) {
    return { ok: false, note: `Contact updates for ${domainName} are scaffold-only in this phase.` }
  },
  async syncDomainStatus(reference) {
    return { ok: false, note: `Dynadot sync for ${reference} is not implemented yet.` }
  },
  async fetchOrderOrTransferStatus(reference) {
    return { ok: false, note: `Dynadot order status fetch for ${reference} is not implemented yet.` }
  },
}
