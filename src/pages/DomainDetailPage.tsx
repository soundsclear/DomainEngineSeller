import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import {
  deleteDomainApi,
  fetchDomain,
  fetchDomainLeads,
  fetchDomainPageContent,
  generateDomainPageContentApi,
  triggerBuyerDiscoveryApi,
  updateDomainApi,
  updateDomainPageContentApi,
  type CreateDomainPayload,
  type DomainLeadRecord,
  type DomainPageContentPayload,
  type PriceRecommendationSummary,
} from '@/lib/api'
import { resolveDomainPageContent, type DomainPageContentRecord } from '@/lib/domain-page-content'
import { formatCurrency } from '@/lib/formatters'
import type { DomainRecord } from '@/types/domain'

type EditForm = Partial<Omit<CreateDomainPayload, 'domainName' | 'tld'>>
type ContentForm = DomainPageContentPayload
type LeadEnrichmentScope = 'lead' | 'batch'
type LeadEnrichmentStatus = 'idle' | 'loading' | 'done' | 'error'

interface LeadEnrichmentProgress {
  status: LeadEnrichmentStatus
  summary: string | null
  updatedAt: number | null
  scope: LeadEnrichmentScope | null
}

interface LeadEnrichmentRun {
  scope: LeadEnrichmentScope
  leadIds: string[]
  status: Exclude<LeadEnrichmentStatus, 'idle'>
  summary: string
  at: number
}

export function DomainDetailPage() {
  const { domainId } = useParams()
  const missingDomainId = !domainId
  const [domain, setDomain] = useState<DomainRecord | null>(null)
  const [recommendation, setRecommendation] = useState<PriceRecommendationSummary | null>(null)
  const [pageContent, setPageContent] = useState<DomainPageContentRecord | null>(null)
  const [leads, setLeads] = useState<DomainLeadRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [contentForm, setContentForm] = useState<ContentForm | null>(null)
  const [contentSaving, setContentSaving] = useState(false)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [contentMessage, setContentMessage] = useState<string | null>(null)
  const [buyerDiscoveryLoading, setBuyerDiscoveryLoading] = useState(false)
  const [buyerDiscoveryMessage, setBuyerDiscoveryMessage] = useState<string | null>(null)
  const [buyerDiscoveryError, setBuyerDiscoveryError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [leadEnrichmentLoadingId, setLeadEnrichmentLoadingId] = useState<string | null>(null)
  const [batchEnrichmentLoading, setBatchEnrichmentLoading] = useState(false)
  const [leadEnrichmentError, setLeadEnrichmentError] = useState<string | null>(null)
  const [leadEnrichmentMessage, setLeadEnrichmentMessage] = useState<string | null>(null)
  const [leadEnrichmentProgressById, setLeadEnrichmentProgressById] = useState<Record<string, LeadEnrichmentProgress>>({})
  const [leadEnrichmentRuns, setLeadEnrichmentRuns] = useState<LeadEnrichmentRun[]>([])

  useEffect(() => {
    if (missingDomainId) return
    let active = true

    Promise.all([fetchDomain(domainId), fetchDomainPageContent(domainId), fetchDomainLeads(domainId)])
      .then(([domainResponse, contentResponse, leadResponse]) => {
        if (!active) {
          return
        }

        setDomain(domainResponse.item)
        setRecommendation(domainResponse.recommendation)
        setPageContent(contentResponse.item)
        setLeads(leadResponse.items)
        setSelectedLeadId((current) => current ?? leadResponse.items[0]?.id ?? null)
        setContentForm(toContentForm(domainResponse.item, contentResponse.item))
        setError(null)
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message)
        }
      })

    return () => {
      active = false
    }
  }, [domainId, missingDomainId])

  function startEdit() {
    if (!domain) return
    setForm({
      language: domain.language as 'NL' | 'EN',
      category: domain.category,
      status: domain.status,
      sellMode: domain.sellMode,
      notes: domain.notes,
      acquisitionCost: domain.acquisitionCost,
      annualRenewalCost: domain.annualRenewalCost,
      migrationCandidate: domain.migrationCandidate,
      targetRegistrar: (domain.targetRegistrar as 'dynadot' | 'openprovider' | undefined) ?? undefined,
    })
    setSaveError(null)
    setEditing(true)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!domainId) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateDomainApi(domainId, form)
      setDomain(updated.item)
      setContentForm((current) => current ?? toContentForm(updated.item, pageContent))
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!domainId || !domain) return
    if (!confirm(`Delete ${domain.domainName}? This cannot be undone.`)) return
    try {
      await deleteDomainApi(domainId)
      window.history.back()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not delete.')
    }
  }

  async function handleContentSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!domainId || !contentForm || !domain) return

    setContentSaving(true)
    setContentError(null)
    setContentMessage(null)

    try {
      const response = await updateDomainPageContentApi(domainId, contentForm)
      setPageContent(response.item)
      setContentForm(toContentForm(domain, response.item))
      setContentMessage('Page content opgeslagen.')
    } catch (err) {
      setContentError(err instanceof Error ? err.message : 'Could not save page content.')
    } finally {
      setContentSaving(false)
    }
  }

  async function handleGenerateContent(force = false) {
    if (!domainId || !domain) return

    setContentLoading(true)
    setContentError(null)
    setContentMessage(null)

    try {
      const response = await generateDomainPageContentApi(domainId, { force })
      setPageContent(response.item)
      setContentForm(toContentForm(domain, response.item))
      setContentMessage(`SEO content gegenereerd via ${response.meta.provider} (${response.meta.model}).`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not generate page content.'
      if (!force && message.includes('force=true')) {
        const confirmed = confirm('Er staat handmatig aangepaste content klaar. Wil je die overschrijven met nieuwe AI-copy?')
        if (confirmed) {
          await handleGenerateContent(true)
          return
        }
      }
      setContentError(message)
    } finally {
      setContentLoading(false)
    }
  }

  async function handleBuyerDiscovery() {
    if (!domainId) return

    setBuyerDiscoveryLoading(true)
    setBuyerDiscoveryError(null)
    setBuyerDiscoveryMessage(null)

    try {
      const response = await triggerBuyerDiscoveryApi(domainId)
      const refreshedLeads = await fetchDomainLeads(domainId)
      setLeads(refreshedLeads.items)
      setSelectedLeadId((current) => current ?? refreshedLeads.items[0]?.id ?? null)

      const summary = [
        `${response.meta.created} nieuwe buyers gevonden`,
        response.meta.skipped > 0 ? `${response.meta.skipped} dubbelen geskipt` : null,
        response.meta.searchErrors > 0 ? `${response.meta.searchErrors} zoekopdrachten faalden` : null,
        response.meta.enriched > 0 ? `${response.meta.enriched} sterke matches automatisch verrijkt` : null,
        response.meta.contactsFound > 0 ? `${response.meta.contactsFound} contactpunten gevonden` : null,
        response.meta.enrichmentErrors > 0 ? `${response.meta.enrichmentErrors} enrichment runs faalden` : null,
      ]
        .filter(Boolean)
        .join(', ')

      setBuyerDiscoveryMessage(summary ? `${summary}.` : 'Buyer discovery afgerond.')
    } catch (err) {
      setBuyerDiscoveryError(err instanceof Error ? err.message : 'Could not run buyer discovery.')
    } finally {
      setBuyerDiscoveryLoading(false)
    }
  }

  async function runLeadEnrichment(leadIds: string[], scope: LeadEnrichmentScope) {
    if (!domainId || leadIds.length === 0) return

    const startedAt = Date.now()
    const loadingSummary = `Contactgegevens ophalen voor ${leadIds.length} lead${leadIds.length === 1 ? '' : 's'}...`

    setLeadEnrichmentError(null)
    setLeadEnrichmentMessage(null)
    setLeadEnrichmentProgressById((current) => {
      const next = { ...current }
      for (const leadId of leadIds) {
        next[leadId] = {
          status: 'loading',
          summary: loadingSummary,
          updatedAt: startedAt,
          scope,
        }
      }
      return next
    })

    try {
      const response =
        scope === 'lead' && leadIds.length === 1
          ? await fetch(`/api/domains/${domainId}/leads/${leadIds[0]}/enrich-contacts`, {
              method: 'POST',
            })
          : await fetch(`/api/domains/${domainId}/lead-enrichment/run`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                leadIds,
              }),
            })

      const body = (await response.json().catch(() => null)) as unknown
      if (!response.ok) {
        throw new Error(extractLeadEnrichmentError(body) ?? 'Could not run lead enrichment.')
      }

      const summary = summarizeLeadEnrichmentResult(body, leadIds.length)
      const refreshedLeads = await fetchDomainLeads(domainId)

      setLeadEnrichmentProgressById((current) => {
        const next = { ...current }
        for (const leadId of leadIds) {
          next[leadId] = {
            status: 'done',
            summary,
            updatedAt: Date.now(),
            scope,
          }
        }
        return next
      })

      setLeadEnrichmentRuns((current) => [
        {
          scope,
          leadIds,
          status: 'done',
          summary,
          at: Date.now(),
        },
        ...current,
      ])
      setLeadEnrichmentMessage(summary)
      setLeads(refreshedLeads.items)
      setSelectedLeadId((current) => current ?? refreshedLeads.items[0]?.id ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not run lead enrichment.'

      setLeadEnrichmentProgressById((current) => {
        const next = { ...current }
        for (const leadId of leadIds) {
          next[leadId] = {
            status: 'error',
            summary: message,
            updatedAt: Date.now(),
            scope,
          }
        }
        return next
      })

      setLeadEnrichmentRuns((current) => [
        {
          scope,
          leadIds,
          status: 'error',
          summary: message,
          at: Date.now(),
        },
        ...current,
      ])
      setLeadEnrichmentError(message)
    }
  }

  async function handleLeadEnrichment(leadId: string) {
    setSelectedLeadId(leadId)
    setLeadEnrichmentLoadingId(leadId)
    try {
      await runLeadEnrichment([leadId], 'lead')
    } finally {
      setLeadEnrichmentLoadingId(null)
    }
  }

  async function handleBatchEnrichment() {
    const candidateIds = leads.filter((lead) => lead.website && !lead.doNotContact).map((lead) => lead.id)
    if (candidateIds.length === 0) return

    setBatchEnrichmentLoading(true)
    try {
      await runLeadEnrichment(candidateIds, 'batch')
    } finally {
      setBatchEnrichmentLoading(false)
    }
  }

  if (missingDomainId) {
    return (
      <SectionCard title="Domain detail" subtitle="Geen domein geselecteerd.">
        Kies eerst een domein.
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard title="Domain detail" subtitle="Kon het domein niet laden.">
        {error}
      </SectionCard>
    )
  }

  if (!domain || !recommendation || !contentForm) {
    return (
      <SectionCard title="Domain detail" subtitle="Laden...">
        Even geduld.
      </SectionCard>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title={domain.domainName} subtitle="Domain details, pricing, and registrar state.">
          {editing ? (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSave}>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Category</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.category ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Language</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.language ?? 'EN'}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as 'NL' | 'EN' }))}
                >
                  <option value="NL">NL</option>
                  <option value="EN">EN</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Status</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.status ?? 'listed'}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DomainRecord['status'] }))}
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
                <label className="mb-1 block text-xs text-slate-500">Sell mode</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.sellMode ?? 'portfolio_redirect'}
                  onChange={(e) => setForm((f) => ({ ...f, sellMode: e.target.value as DomainRecord['sellMode'] }))}
                >
                  <option value="portfolio_redirect">Portfolio redirect</option>
                  <option value="afternic_lander">Afternic lander</option>
                  <option value="sedo_lander">Sedo lander</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Acquisition cost (EUR)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.acquisitionCost ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, acquisitionCost: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Annual renewal (EUR)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.annualRenewalCost ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, annualRenewalCost: Number(e.target.value) }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Notes</label>
                <textarea
                  className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              {saveError ? <p className="text-sm text-rose-700 md:col-span-2">{saveError}</p> : null}
              <div className="flex gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <dl className="grid gap-4 md:grid-cols-2">
                <Detail label="Category" value={domain.category} />
                <Detail label="Status" value={domain.status.replaceAll('_', ' ')} />
                <Detail label="Current registrar" value={domain.currentRegistrar.toUpperCase()} />
                <Detail label="Sell mode" value={domain.sellMode.replaceAll('_', ' ')} />
                <Detail label="Acquisition cost" value={formatCurrency(domain.acquisitionCost)} />
                <Detail label="Renewal cost" value={formatCurrency(domain.annualRenewalCost)} />
              </dl>
              <div className="mt-4 flex gap-3">
                <button onClick={startEdit} className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
                  Edit domain
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-full border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          title="Pricing engine"
          subtitle="Deterministic signals generate quick-sale, target, and aspirational price bands."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Detail label="Quick sale" value={formatCurrency(recommendation.quickSalePrice)} />
            <Detail label="Target" value={formatCurrency(recommendation.targetPrice)} />
            <Detail label="Aspirational" value={formatCurrency(recommendation.aspirationalPrice)} />
          </div>
          <div className="mt-5 rounded-3xl bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-950">Confidence {recommendation.confidenceScore}/100</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-emerald-950/80">
              {recommendation.rationale.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Public page content"
          subtitle="Beheer de publieke lander-copy handmatig of laat een SEO-versie genereren."
        >
          <form className="grid gap-3" onSubmit={handleContentSave}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <div>
                <p className="font-medium text-slate-900">Content status</p>
                <p className="mt-1 capitalize">{(pageContent?.contentStatus ?? contentForm.contentStatus).replaceAll('_', ' ')}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateContent()}
                disabled={contentLoading}
                className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {contentLoading ? 'Generating...' : 'Generate SEO content'}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">SEO title</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={contentForm.seoTitle}
                onChange={(e) =>
                  setContentForm((current) => (current ? { ...current, seoTitle: e.target.value, contentStatus: 'manual' } : current))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Meta description</label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={contentForm.metaDescription}
                onChange={(e) =>
                  setContentForm((current) =>
                    current ? { ...current, metaDescription: e.target.value, contentStatus: 'manual' } : current,
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Hero headline</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={contentForm.heroHeadline}
                onChange={(e) =>
                  setContentForm((current) => (current ? { ...current, heroHeadline: e.target.value, contentStatus: 'manual' } : current))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Hero subheadline</label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={contentForm.heroSubheadline}
                onChange={(e) =>
                  setContentForm((current) =>
                    current ? { ...current, heroSubheadline: e.target.value, contentStatus: 'manual' } : current,
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Body content</label>
              <textarea
                className="min-h-48 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={contentForm.bodyContent}
                onChange={(e) =>
                  setContentForm((current) => (current ? { ...current, bodyContent: e.target.value, contentStatus: 'manual' } : current))
                }
              />
            </div>
            {contentError ? <p className="text-sm text-rose-700">{contentError}</p> : null}
            {contentMessage ? <p className="text-sm text-emerald-700">{contentMessage}</p> : null}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={contentSaving}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-900 disabled:opacity-60"
              >
                {contentSaving ? 'Saving...' : 'Save content'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Buyer discovery + enrichment"
          subtitle="Discovery blijft research-only; enrichment haalt publieke contactgegevens op zonder iets te versturen."
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-medium">Enrichment only</p>
              <p className="mt-1 text-amber-950/80">
                Deze sectie zoekt alleen publieke contactgegevens op bij bestaande leads. Er worden geen mails
                verstuurd en er is geen send-flow aan deze pagina gekoppeld.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <div>
                <p className="font-medium text-slate-900">{leads.length} opgeslagen leads</p>
                <p className="mt-1">
                  Buyer discovery gebruikt AI voor lead-fit redenering, Brave voor web research en Apify om
                  sterke matches automatisch op publieke contactgegevens te verrijken.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleBatchEnrichment()}
                  disabled={batchEnrichmentLoading || leads.filter((lead) => lead.website && !lead.doNotContact).length === 0}
                  className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {batchEnrichmentLoading ? 'Enriching...' : 'Enrich all leads'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleBuyerDiscovery()}
                  disabled={buyerDiscoveryLoading}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 disabled:opacity-60"
                >
                  {buyerDiscoveryLoading ? 'Searching...' : 'Find buyers'}
                </button>
              </div>
            </div>
            {buyerDiscoveryError ? <p className="text-sm text-rose-700">{buyerDiscoveryError}</p> : null}
            {buyerDiscoveryMessage ? <p className="text-sm text-emerald-700">{buyerDiscoveryMessage}</p> : null}
            {leads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                Nog geen buyer discovery leads voor dit domein.
              </div>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => {
                  const progress = leadEnrichmentProgressById[lead.id] ?? null

                  return (
                  <article
                    key={lead.id}
                    className={
                      lead.id === selectedLeadId
                        ? 'rounded-2xl border border-emerald-300 bg-emerald-50 p-4'
                        : 'rounded-2xl border border-slate-200 bg-white p-4'
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-medium text-slate-950">{lead.companyName}</h3>
                        {lead.website ? (
                          <a
                            className="mt-1 inline-block text-sm text-emerald-700 hover:text-emerald-800"
                            href={lead.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {lead.website}
                          </a>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                        Score {lead.priorityScore}
                      </span>
                    </div>
                    {lead.buyerFitReason ? <p className="mt-3 text-sm leading-6 text-slate-600">{lead.buyerFitReason}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-slate-500">
                      <span>{lead.source ?? 'manual'}</span>
                      {lead.country ? <span>{lead.country}</span> : null}
                      {lead.doNotContact ? <span>do not contact</span> : null}
                      <span>
                        {(progress?.status ?? (lead.contactEmail || lead.contactName ? 'done' : 'idle'))
                          .replace('loading', 'enriching')
                          .replace('done', 'enriched')
                          .replace('error', 'failed')}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleLeadEnrichment(lead.id)}
                        disabled={leadEnrichmentLoadingId === lead.id || batchEnrichmentLoading}
                        className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                      >
                        {leadEnrichmentLoadingId === lead.id ? 'Enriching...' : 'Enrich contact data'}
                      </button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">Contact snapshot</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Detail label="Contact name" value={lead.contactName ?? 'Not found yet'} />
                        <Detail label="Contact email" value={lead.contactEmail ?? 'Not found yet'} />
                      </div>
                      <p className="mt-3 text-slate-600">
                        {progress?.summary ??
                          'Run enrichment to look for public contact details on the company website and related pages.'}
                      </p>
                    </div>
                  </article>
                  )
                })}
              </div>
            )}

            {leadEnrichmentError ? <p className="text-sm text-rose-700">{leadEnrichmentError}</p> : null}
            {leadEnrichmentMessage ? <p className="text-sm text-emerald-700">{leadEnrichmentMessage}</p> : null}

            {leadEnrichmentRuns.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">Recent enrichment runs</p>
                <div className="mt-3 space-y-3">
                  {leadEnrichmentRuns.slice(0, 4).map((run) => (
                    <article key={`${run.scope}-${run.at}-${run.leadIds.join('-')}`} className="rounded-xl bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {run.scope === 'batch' ? 'Batch enrichment' : 'Single lead enrichment'}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{run.summary}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {new Date(run.at).toLocaleString('nl-NL')}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function toContentForm(domain: DomainRecord, storedContent: DomainPageContentRecord | null): ContentForm {
  const resolved = resolveDomainPageContent(domain, storedContent)

  return {
    seoTitle: resolved.seoTitle,
    metaDescription: resolved.metaDescription,
    heroHeadline: resolved.heroHeadline,
    heroSubheadline: resolved.heroSubheadline,
    bodyContent: resolved.bodyContent,
    contentStatus: storedContent?.contentStatus ?? 'draft',
    generatedAt: storedContent?.generatedAt ?? null,
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 text-lg font-medium capitalize text-slate-950">{value}</dd>
    </div>
  )
}

function summarizeLeadEnrichmentResult(payload: unknown, leadCount: number) {
  const record = isRecord(payload) ? payload : {}
  const meta = isRecord(record.meta) ? record.meta : {}
  const items = Array.isArray(record.items) ? record.items : []
  const enrichedCount =
    readNumber(meta.enrichedCount) ??
    readNumber(meta.enriched) ??
    readNumber(meta.created) ??
    readNumber(record.enrichedCount) ??
    (items.length > 0 ? items.length : null)
  const skippedCount = readNumber(meta.skipped) ?? readNumber(record.skippedCount) ?? readNumber(record.skipped)
  const contactCount =
    readNumber(meta.contactCount) ??
    readNumber(meta.contactsFound) ??
    readNumber(record.contactCount) ??
    readNumber(record.contactsFound)
  const message = readString(record.message) ?? readString(meta.message) ?? readString(record.summary)

  const parts: string[] = []

  if (enrichedCount != null) {
    parts.push(`${enrichedCount} lead${enrichedCount === 1 ? '' : 's'} verrijkt`)
  }
  if (contactCount != null && contactCount > 0) {
    parts.push(`${contactCount} contact${contactCount === 1 ? '' : 'en'} gevonden`)
  }
  if (skippedCount != null && skippedCount > 0) {
    parts.push(`${skippedCount} overgeslagen`)
  }

  if (parts.length === 0 && message) {
    parts.push(message)
  }

  if (parts.length === 0) {
    parts.push(`Enrichment voor ${leadCount} lead${leadCount === 1 ? '' : 's'} afgerond`)
  }

  return `${parts.join(', ')}.`
}

function extractLeadEnrichmentError(payload: unknown) {
  const record = isRecord(payload) ? payload : {}
  const meta = isRecord(record.meta) ? record.meta : {}

  return readString(record.error) ?? readString(record.message) ?? readString(meta.error) ?? readString(meta.message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

