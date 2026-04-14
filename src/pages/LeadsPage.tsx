import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { SectionCard } from '@/components/SectionCard'
import { fetchLeads, fetchOutreachWorkflows, generateLeadOutreachDraft, saveLeadOutreachWorkflow, createLeadApi, updateLeadDoNotContactApi, type OutreachWorkflowRecord } from '@/lib/api'
import type { OutreachDraft } from '@/lib/outreach-draft'
import type { LeadRecord } from '@/types/domain'

interface DraftState {
  eligible: boolean
  reason: string
  draft: OutreachDraft | null
  domainName: string
  companyName: string
}

export function LeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [workflows, setWorkflows] = useState<OutreachWorkflowRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [senderName, setSenderName] = useState('Jan Seller')
  const [senderEmail, setSenderEmail] = useState('jan@dse.example')
  const [tone, setTone] = useState<'concise' | 'standard' | 'detailed'>('standard')
  const [outreachCount, setOutreachCount] = useState(0)
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ companyName: '', website: '', country: '' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    Promise.all([fetchLeads(), fetchOutreachWorkflows()])
      .then(([leadResponse, workflowResponse]) => {
        if (active) {
          setLeads(leadResponse.items)
          setSelectedLeadId(leadResponse.items[0]?.id ?? null)
          setWorkflows(workflowResponse.items)
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
  }, [])

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  )

  async function handleCreateLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateSubmitting(true)
    setCreateError(null)
    try {
      const result = await createLeadApi({
        companyName: createForm.companyName,
        website: createForm.website || undefined,
        country: createForm.country || undefined,
      })
      setLeads((current) => [...current, result.item as unknown as LeadRecord])
      setCreateForm({ companyName: '', website: '', country: '' })
      setShowCreate(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Kon de lead niet aanmaken.')
    } finally {
      setCreateSubmitting(false)
    }
  }

  async function handleToggleDoNotContact(leadId: string, current: boolean) {
    try {
      await updateLeadDoNotContactApi(leadId, !current)
      setLeads((items) =>
        items.map((lead) => (lead.id === leadId ? { ...lead, doNotContact: !current } : lead)),
      )
    } catch {
      // non-critical, UI stays consistent on next load
    }
  }

  async function handleGenerateDraft() {
    if (!selectedLead) {
      return
    }

    setDraftLoading(true)
    setDraftError(null)
    setSaveMessage(null)

    try {
      const response = await generateLeadOutreachDraft(selectedLead.id, {
        sender: {
          name: senderName,
          email: senderEmail,
        },
        tone,
        outreachCount,
        autoSendEnabled: false,
        dailyLimit: 10,
      })

      setDraftState({
        eligible: response.result.eligible,
        reason: response.result.reason,
        draft: response.result.draft,
        domainName: response.domain.domainName,
        companyName: response.lead.companyName,
      })
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Kon het outreach concept niet genereren.')
      setDraftState(null)
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleSaveWorkflow() {
    if (!selectedLead || !draftState?.draft) {
      return
    }

    setSaveLoading(true)
    setDraftError(null)
    setSaveMessage(null)

    try {
      const response = await saveLeadOutreachWorkflow(selectedLead.id, {
        sender: {
          name: senderName,
          email: senderEmail,
        },
        tone,
        outreachCount,
        autoSendEnabled: false,
        dailyLimit: 10,
      })

      setWorkflows((current) => [response.item, ...current])
      setSaveMessage('Draft opgeslagen als outreach thread met follow-up taak.')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Kon de workflow niet opslaan.')
    } finally {
      setSaveLoading(false)
    }
  }

  if (error) {
    return <SectionCard title="Buyer discovery and outreach" subtitle="Kon de leads niet laden.">{error}</SectionCard>
  }

  if (!loaded) {
    return <SectionCard title="Buyer discovery and outreach" subtitle="Leads laden...">Even geduld.</SectionCard>
  }

  if (leads.length === 0) {
    return <SectionCard title="Buyer discovery and outreach" subtitle="Nog geen leads beschikbaar.">Voeg buyer discovery records toe om outreach te starten.</SectionCard>
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Buyer discovery"
          subtitle="Kies een lead en genereer een conceptmail vanuit de bestaande outreach guardrails."
        >
          <div className="space-y-3">
            {leads.map((lead) => {
              const active = lead.id === selectedLeadId

              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => {
                    setSelectedLeadId(lead.id)
                    setDraftError(null)
                    setDraftState(null)
                    setSaveMessage(null)
                  }}
                  className={
                    active
                      ? 'w-full rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-left'
                      : 'w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-left'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-medium text-slate-950">{lead.companyName}</h3>
                      <p className="text-sm text-slate-600">{lead.contactName} · {lead.contactEmail}</p>
                    </div>
                    <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-emerald-800">
                      Score {lead.priorityScore}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{lead.buyerFitReason}</p>
                  <div className="mt-3 flex items-center justify-between text-xs uppercase text-slate-500">
                    <span>{lead.source}</span>
                    <span>{lead.country}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="Outreach draft"
          subtitle="Draft-first workflow: geen verzending, wel een opslaanbare thread, draft message en follow-up taak."
        >
          {selectedLead ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Sender name</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={senderName} onChange={(event) => setSenderName(event.target.value)} />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Sender email</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Tone</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={tone} onChange={(event) => setTone(event.target.value as 'concise' | 'standard' | 'detailed')}>
                    <option value="concise">Concise</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Sequence step</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={String(outreachCount)} onChange={(event) => setOutreachCount(Number(event.target.value))}>
                    <option value="0">Initial</option>
                    <option value="1">Follow-up 1</option>
                    <option value="2">Follow-up 2</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span>{selectedLead.companyName} · {selectedLead.contactName}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={draftLoading}
                    className="rounded-lg bg-emerald-900 px-4 py-2 text-white disabled:opacity-60"
                  >
                    {draftLoading ? 'Generating...' : 'Generate draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveWorkflow}
                    disabled={saveLoading || !draftState?.draft || !draftState.eligible}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 disabled:opacity-60"
                  >
                    {saveLoading ? 'Saving...' : 'Save to workflow'}
                  </button>
                </div>
              </div>

              {draftError ? <p className="text-sm text-rose-700">{draftError}</p> : null}
              {saveMessage ? <p className="text-sm text-emerald-700">{saveMessage}</p> : null}

              {draftState ? (
                <div className="space-y-4">
                  <div className={draftState.eligible ? 'rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900' : 'rounded-lg bg-amber-50 p-4 text-sm text-amber-900'}>
                    <p className="font-medium">{draftState.companyName} · {draftState.domainName}</p>
                    <p className="mt-1">{draftState.reason}</p>
                  </div>

                  {draftState.draft ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Meta label="Step" value={draftState.draft.sequenceStep} />
                        <Meta label="Language" value={draftState.draft.language} />
                        <Meta label="Follow-up" value={draftState.draft.recommendedFollowUpDays === null ? 'Final step' : `${draftState.draft.recommendedFollowUpDays} days`} />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase text-slate-500">Subject</p>
                        <p className="mt-2 text-sm font-medium text-slate-950">{draftState.draft.subject}</p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase text-slate-500">Body</p>
                        <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{draftState.draft.body}</pre>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Personalisation tokens</p>
                        <p className="mt-2">{draftState.draft.personalizationTokensUsed.join(', ')}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Genereer een concept om de outreach copy voor deze lead te bekijken.
                </div>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="Leads"
        subtitle="Potentiële kopers per domein. Outreach is altijd draft-first."
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white"
          >
            {showCreate ? 'Annuleren' : 'Nieuwe lead'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreateLead} className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="block space-y-1 text-sm text-slate-700">
              <span>Bedrijfsnaam *</span>
              <input
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={createForm.companyName}
                onChange={(e) => setCreateForm((f) => ({ ...f, companyName: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm text-slate-700">
              <span>Website</span>
              <input
                type="url"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={createForm.website}
                onChange={(e) => setCreateForm((f) => ({ ...f, website: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm text-slate-700">
              <span>Land</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={createForm.country}
                onChange={(e) => setCreateForm((f) => ({ ...f, country: e.target.value }))}
              />
            </label>
            {createError && <p className="text-sm text-rose-700">{createError}</p>}
            <button
              type="submit"
              disabled={createSubmitting}
              className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {createSubmitting ? 'Opslaan...' : 'Lead aanmaken'}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {leads.map((lead) => (
            <div key={lead.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{lead.companyName}</p>
                {lead.website && <p className="text-xs text-slate-500">{lead.website}</p>}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={lead.doNotContact}
                  onChange={() => handleToggleDoNotContact(lead.id, lead.doNotContact)}
                />
                Do not contact
              </label>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Outreach queue"
        subtitle="Opgeslagen draft threads met eerste message en follow-up planning."
      >
        {workflows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
            Nog geen opgeslagen outreach workflow.
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <article key={workflow.thread.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium text-slate-950">{workflow.lead.companyName} · {workflow.domain.domainName}</h3>
                    <p className="mt-1 text-sm text-slate-600">{workflow.message.subject}</p>
                  </div>
                  <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium uppercase text-emerald-800">
                    {workflow.thread.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-700">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Contact</p>
                    <p className="mt-1">{workflow.lead.contactName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Follow-up due</p>
                    <p className="mt-1">{workflow.followupTask.dueAt ? new Date(workflow.followupTask.dueAt).toLocaleDateString('nl-NL') : 'No follow-up needed'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Draft step</p>
                    <p className="mt-1 capitalize">{workflow.draft.sequenceStep.replaceAll('_', ' ')}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium capitalize text-slate-950">{value.replaceAll('_', ' ')}</p>
    </div>
  )
}
