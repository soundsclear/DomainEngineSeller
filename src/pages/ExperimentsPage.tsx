import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import {
  fetchExperiments,
  fetchExperimentResults,
  createExperiment,
  updateExperimentStatus,
  type ExperimentRecord,
  type VariantResult,
  type PricingRow,
} from '@/lib/api'

function formatEur(cents: number | null): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

export function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [variants, setVariants] = useState<VariantResult[]>([])
  const [pricing, setPricing] = useState<PricingRow[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchExperiments()
      .then((items) => {
        setExperiments(items)
        if (items.length > 0) setSelectedId(items[0].id)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    fetchExperimentResults(selectedId).then(({ variants: v, pricing: p }) => {
      setVariants(v)
      setPricing(p)
    })
  }, [selectedId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const exp = await createExperiment(newName.trim())
    setExperiments((prev) => [exp, ...prev])
    setSelectedId(exp.id)
    setNewName('')
  }

  async function handleStatus(id: string, status: 'active' | 'paused' | 'completed') {
    await updateExperimentStatus(id, status)
    setExperiments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)))
  }

  const selected = experiments.find((e) => e.id === selectedId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-white">Experiments</h1>
      </div>

      {/* New experiment */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p className="text-sm font-medium text-white/60 mb-3">Nieuw experiment</p>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Naam (bijv. 'Eerste mail Q2 2026')"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Aanmaken
          </button>
        </form>
      </div>

      {/* Experiment selector */}
      {experiments.length > 0 && (
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-sm font-medium text-white/60 mb-3">Experiment kiezen</p>
          <div className="flex flex-wrap gap-2">
            {experiments.map((exp) => (
              <button
                key={exp.id}
                onClick={() => setSelectedId(exp.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedId === exp.id
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                {exp.name}
                <span className={`ml-2 text-xs ${exp.status === 'active' ? 'text-green-400' : 'text-white/30'}`}>
                  {exp.status}
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="mt-3 flex gap-2">
              {selected.status !== 'active' && (
                <button
                  onClick={() => handleStatus(selected.id, 'active')}
                  className="px-3 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white transition-colors"
                >
                  Activeren
                </button>
              )}
              {selected.status === 'active' && (
                <button
                  onClick={() => handleStatus(selected.id, 'paused')}
                  className="px-3 py-1 rounded text-xs bg-yellow-700 hover:bg-yellow-600 text-white transition-colors"
                >
                  Pauzeren
                </button>
              )}
              {selected.status !== 'completed' && (
                <button
                  onClick={() => handleStatus(selected.id, 'completed')}
                  className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
                >
                  Afsluiten
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Variant results */}
      {selectedId && variants.length > 0 && (
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-sm font-medium text-white/60 mb-3">Resultaten per variant</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="pb-2 pr-4">Variant</th>
                  <th className="pb-2 pr-4">Toon</th>
                  <th className="pb-2 pr-4">Prijs</th>
                  <th className="pb-2 pr-4">Verzonden</th>
                  <th className="pb-2 pr-4">Replies</th>
                  <th className="pb-2 pr-4">Reply rate</th>
                  <th className="pb-2 pr-4">Biedingen</th>
                  <th className="pb-2 pr-4">Gem. bod</th>
                  <th className="pb-2">Deals</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variantId} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-semibold text-white">{v.label}</td>
                    <td className="py-2 pr-4">{v.tone}</td>
                    <td className="py-2 pr-4">{v.hasPrice ? 'Ja' : 'Nee'}</td>
                    <td className="py-2 pr-4">{v.sent}</td>
                    <td className="py-2 pr-4">{v.replies}</td>
                    <td className="py-2 pr-4">
                      {v.sent > 0 ? `${Math.round((v.replies / v.sent) * 100)}%` : '—'}
                    </td>
                    <td className="py-2 pr-4">{v.offerCount}</td>
                    <td className="py-2 pr-4">{formatEur(v.avgOffer)}</td>
                    <td className="py-2">{v.dealCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pricing intelligence */}
      {pricing.length > 0 && (
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)' }}>
          <p className="text-sm font-medium text-white/60 mb-3">Pricing intelligence</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="pb-2 pr-4">Categorie</th>
                  <th className="pb-2 pr-4">Gem. eerste bod</th>
                  <th className="pb-2 pr-4">% van vraagprijs</th>
                  <th className="pb-2 pr-4">Gem. slotprijs</th>
                  <th className="pb-2">Datapunten</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((row) => (
                  <tr key={row.category} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-medium text-white">{row.category}</td>
                    <td className="py-2 pr-4">{formatEur(row.avgFirstOffer)}</td>
                    <td className="py-2 pr-4">{row.avgOfferPct != null ? `${row.avgOfferPct}%` : '—'}</td>
                    <td className="py-2 pr-4">{formatEur(row.avgClosingPrice)}</td>
                    <td className="py-2 text-white/40">{row.dataPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && experiments.length === 0 && (
        <p className="text-white/40 text-sm">Nog geen experimenten. Maak er een aan om te beginnen.</p>
      )}
    </div>
  )
}
