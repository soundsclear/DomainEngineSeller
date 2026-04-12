import Papa from 'papaparse'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import { createDomainApi, fetchDomains, importDomainsApi, type CreateDomainPayload } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import type { DomainRecord } from '@/types/domain'

const EMPTY_FORM: CreateDomainPayload = {
  domainName: '',
  tld: '',
  language: 'NL',
  category: '',
  status: 'listed',
  sellMode: 'portfolio_redirect',
  currentRegistrar: 'xel',
  acquisitionCost: 0,
  annualRenewalCost: 0,
  notes: '',
  migrationCandidate: false,
}

function deriveTld(domainName: string): string {
  const parts = domainName.split('.')
  return parts.length >= 2 ? `.${parts[parts.length - 1]}` : ''
}

export function DomainsPage() {
  const [domains, setDomains] = useState<DomainRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateDomainPayload>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load() {
    let active = true
    fetchDomains()
      .then((response) => {
        if (active) {
          setDomains(response.items)
          setLoaded(true)
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message)
          setLoaded(true)
        }
      })
    return () => {
      active = false
    }
  }

  useEffect(load, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const tld = form.tld || deriveTld(form.domainName)
      await createDomainApi({ ...form, tld })
      setForm(EMPTY_FORM)
      setShowForm(false)
      load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create domain.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportStatus('Importing...')

    const text = await file.text()
    const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })

    try {
      const result = await importDomainsApi(data)
      setImportStatus(`Imported ${result.created} domain(s). Skipped ${result.skipped}. Parse errors: ${result.parseErrors.length}.`)
      load()
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed.')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (error) {
    return <SectionCard title="Domain portfolio" subtitle="Kon de domeinen niet laden.">{error}</SectionCard>
  }

  if (!loaded) {
    return <SectionCard title="Domain portfolio" subtitle="Domeinen laden...">Even geduld.</SectionCard>
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Domain portfolio"
        subtitle="Phase 1 keeps current domains at Xel while tracking pricing, migration readiness, and lander state."
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ New domain'}
          </button>
          <label className="cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
          {importStatus ? <span className="text-sm text-slate-600">{importStatus}</span> : null}
        </div>

        {showForm ? (
          <form
            className="mb-6 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2"
            onSubmit={handleCreate}
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Domain name</label>
              <input
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="example.nl"
                value={form.domainName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domainName: e.target.value, tld: deriveTld(e.target.value) }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Category</label>
              <input
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="e.g. marketing"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Language</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as 'NL' | 'EN' }))}
              >
                <option value="NL">NL</option>
                <option value="EN">EN</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Status</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CreateDomainPayload['status'] }))}
              >
                {(
                  [
                    'draft',
                    'listed',
                    'inbound_only',
                    'outbound_research',
                    'negotiation',
                    'deal_in_progress',
                    'sold',
                    'drop_candidate',
                  ] as const
                ).map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Acquisition cost (€)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.acquisitionCost}
                onChange={(e) => setForm((f) => ({ ...f, acquisitionCost: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Annual renewal (€)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.annualRenewalCost}
                onChange={(e) => setForm((f) => ({ ...f, annualRenewalCost: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Notes</label>
              <textarea
                className="min-h-16 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {submitError ? <p className="text-sm text-rose-700 md:col-span-2">{submitError}</p> : null}
            <div className="flex gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Add domain'}
              </button>
            </div>
          </form>
        ) : null}

        {domains.length === 0 ? (
          <p className="text-sm text-slate-500">No domains yet. Add one above or import a CSV.</p>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Registrar</th>
                  <th className="px-4 py-3">Target price</th>
                  <th className="px-4 py-3">Migration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-medium text-emerald-800 hover:text-emerald-600"
                        to={`/admin/domains/${domain.id}`}
                      >
                        {domain.domainName}
                      </Link>
                    </td>
                    <td className="px-4 py-4 capitalize">{domain.status.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-4 uppercase">{domain.currentRegistrar}</td>
                    <td className="px-4 py-4">{formatCurrency(domain.targetPrice)}</td>
                    <td className="px-4 py-4">
                      {domain.migrationCandidate ? `Candidate for ${domain.targetRegistrar}` : 'Hold at Xel'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
