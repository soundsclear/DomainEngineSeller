import { demoDeals, demoDomains, demoLeads } from '../src/lib/demo-data'

const summary = {
  generatedAt: new Date().toISOString(),
  domains: demoDomains.length,
  leads: demoLeads.length,
  deals: demoDeals.length,
}

console.log(JSON.stringify(summary, null, 2))
