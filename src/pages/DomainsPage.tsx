import Papa from 'papaparse'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Globe2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { SectionCard } from '@/components/SectionCard'
import { SkeletonRow } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

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
      toast.show('Domain added.', 'success')
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

    const text = await file.text()
    const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })

    try {
      const result = await importDomainsApi(data)
      toast.show(`Imported ${result.created} domain(s). Skipped ${result.skipped}.`, 'success')
      load()
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Import failed.', 'error')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!loaded) {
    return (
      <SectionCard title="Domain portfolio">
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </SectionCard>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3 text-[14px]"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)', borderLeft: '3px solid var(--color-destructive)' }}
      >
        <span style={{ color: 'var(--color-text)' }}>Failed to load domains: {error}</span>
        <button onClick={load} className="ml-4 text-[13px] font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Domain portfolio">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg px-4 py-2 text-[14px] text-white transition-colors"
            style={{ backgroundColor: 'var(--color-accent)' }}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ New domain'}
          </button>
          <label
            className="cursor-pointer rounded-lg px-4 py-2 text-[14px] transition-colors hover:bg-[#f5f5f7]"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
        </div>

        {showForm ? (
          <form
            className="mb-6 grid gap-3 rounded-xl p-5 md:grid-cols-2"
            style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-bg)' }}
            onSubmit={handleCreate}
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">Domain name</label>
              <input
                required
                className="w-full rounded-lg px-3 py-2 text-[14px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
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
                className="w-full rounded-lg px-3 py-2 text-[14px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                placeholder="e.g. marketing"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Language</label>
              <select
                className="w-full rounded-lg px-3 py-2 text-[14px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
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
                className="w-full rounded-lg px-3 py-2 text-[14px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
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
                className="w-full rounded-lg px-3 py-2 text-[14px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                value={form.acquisitionCost}
                onChange={(e) => setForm((f) => ({ ...f, acquisitionCost: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Annual renewal (€)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg px-3 py-2 text-[14px]" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
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
                className="rounded-lg px-4 py-2 text-[14px] text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                {submitting ? 'Saving...' : 'Add domain'}
              </button>
            </div>
          </form>
        ) : null}

        {domains.length === 0 ? (
          <EmptyState
            icon={Globe2}
            title="No domains yet"
            description="Add a domain above or import a CSV to start tracking your portfolio."
          />
        ) : (
          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--color-border-soft)' }}>
            <table className="min-w-full divide-y text-[14px]" style={{ borderColor: 'var(--color-border-soft)' }}>
              <thead style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }} className="text-left">
                <tr>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Registrar</th>
                  <th className="px-4 py-3">Target price</th>
                  <th className="px-4 py-3">Migration</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border-soft)' }}>
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-medium hover:underline"
                        style={{ color: 'var(--color-accent)' }}
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
