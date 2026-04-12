import { z } from 'zod'

export const registrarCapabilitySchema = z.object({
  supportsAvailabilityCheck: z.boolean(),
  supportsRegistration: z.boolean(),
  supportsRenewal: z.boolean(),
  supportsTransfer: z.boolean(),
  supportsNameserverUpdate: z.boolean(),
  supportsContactUpdate: z.boolean(),
  supportsStatusSync: z.boolean(),
})

export type RegistrarCapabilities = z.infer<typeof registrarCapabilitySchema>

export interface RegistrarAdapter {
  key: 'xel' | 'dynadot' | 'openprovider'
  name: string
  capabilities: RegistrarCapabilities
  describeAuth(): string[]
  lookupDomain(domainName: string): Promise<{ domainName: string; found: boolean }>
  checkAvailability(domainName: string): Promise<{ domainName: string; available: boolean }>
  registerDomain(domainName: string): Promise<{ ok: boolean; note: string }>
  renewDomain(domainName: string): Promise<{ ok: boolean; note: string }>
  transferDomain(domainName: string): Promise<{ ok: boolean; note: string }>
  updateNameservers(domainName: string, nameservers: string[]): Promise<{ ok: boolean; note: string }>
  updateContacts(domainName: string, contactId: string): Promise<{ ok: boolean; note: string }>
  syncDomainStatus(domainName: string): Promise<{ ok: boolean; note: string }>
  fetchOrderOrTransferStatus(reference: string): Promise<{ ok: boolean; note: string }>
}
