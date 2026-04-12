import { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '@/components/SectionCard'
import {
  approveOutreachWorkflow,
  batchSendOutreachWorkflows,
  fetchLeads,
  fetchOutreachWorkflows,
  generateLeadOutreachDraft,
  saveLeadOutreachWorkflow,
  sendOutreachWorkflowNow,
  type OutreachWorkflowRecord,
} from '@/lib/api'
import type { OutreachDraft } from '@/lib/outreach-draft'
import type { LeadRecord } from '@/types/domain'

type QueueFilter = 'all' | 'draft' | 'approved' | 'sent' | 'blocked'

interface DraftState {
  eligible: boolean
  reason: string
  draft: OutreachDraft | null
  domainName: string
  companyName: string
}

interface QueueRowState {
  workflow: OutreachWorkflowRecord
  lead: LeadRecord | null
  status: Exclude<QueueFilter, 'all'>
  blockedReason: string | null
  canApprove: boolean
  canSendNow: boolean
  canSelect: boolean
}

const QUEUE_FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'approved', label: 'Approved' },
  { key: 'sent', label: 'Sent' },
  { key: 'blocked', label: 'Blocked' },
]

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
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>([])
  const [workflowActionLoadingId, setWorkflowActionLoadingId] = useState<string | null>(null)
  const [batchSendLoading, setBatchSendLoading] = useState(false)
  const [queueMessage, setQueueMessage] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    Promise.all([fetchLeads(), fetchOutreachWorkflows()])
      .then(([leadResponse, workflowResponse]) => {
        if (!active) {
          return
        }

        setLeads(leadResponse.items)
        setSelectedLeadId(leadResponse.items[0]?.id ?? null)
        setWorkflows(workflowResponse.items)
        setLoaded(true)
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

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead] as const)), [leads])

  const queueRows = useMemo<QueueRowState[]>(
    () =>
      workflows.map((workflow) => {
        const lead = leadById.get(workflow.thread.leadId) ?? null
        const blockedReason = lead?.doNotContact
          ? 'Do-not-contact is set for this lead.'
          : !workflow.lead.contactEmail
            ? 'This workflow has no contact email, so it cannot be approved or sent yet.'
            : null

        if (blockedReason) {
          return {
            workflow,
            lead,
            status: 'blocked',
            blockedReason,
            canApprove: false,
            canSendNow: false,
            canSelect: false,
          }
        }

        if (workflow.thread.status === 'approved_to_send') {
          return {
            workflow,
            lead,
            status: 'approved',
            blockedReason: null,
            canApprove: false,
            canSendNow: true,
            canSelect: true,
          }
        }

        if (workflow.thread.status === 'sent') {
          return {
            workflow,
            lead,
            status: 'sent',
            blockedReason: null,
            canApprove: false,
            canSendNow: false,
            canSelect: false,
          }
        }

        return {
          workflow,
          lead,
          status: 'draft',
          blockedReason: null,
          canApprove: true,
          canSendNow: false,
          canSelect: false,
        }
      }),
    [leadById, workflows],
  )

  const visibleQueueRows = useMemo(
    () => queueRows.filter((row) => queueFilter === 'all' || row.status === queueFilter),
    [queueFilter, queueRows],
  )

  const queueCounts = useMemo(() => {
    return queueRows.reduce(
      (accumulator, row) => {
        accumulator[row.status] += 1
        return accumulator
      },
      { draft: 0, approved: 0, sent: 0, blocked: 0 } as Record<Exclude<QueueFilter, 'all'>, number>,
    )
  }, [queueRows])

  const selectedSendableIds = useMemo(
    () =>
      selectedWorkflowIds.filter((threadId) =>
        queueRows.some((row) => row.workflow.thread.id === threadId && row.status === 'approved'),
      ),
    [queueRows, selectedWorkflowIds],
  )

  async function refreshWorkflows() {
    const response = await fetchOutreachWorkflows()
    setWorkflows(response.items)
  }

  async function handleGenerateDraft() {
    if (!selectedLead) {
      return
    }

    setDraftLoading(true)
    setDraftError(null)
    setSaveMessage(null)
    setQueueMessage(null)

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
    setQueueMessage(null)

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

      setWorkflows((current) => [response.item, ...current.filter((item) => item.thread.id !== response.item.thread.id)])
      setSelectedWorkflowIds((current) => current.filter((threadId) => threadId !== response.item.thread.id))
      setQueueMessage('Draft opgeslagen als reviewbare outreach workflow.')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Kon de workflow niet opslaan.')
    } finally {
      setSaveLoading(false)
    }
  }

  async function handleApproveWorkflow(threadId: string) {
    setWorkflowActionLoadingId(threadId)
    setQueueError(null)
    setQueueMessage(null)

    try {
      const response = await approveOutreachWorkflow(threadId)
      setQueueMessage(response.message ?? 'Workflow is approved for send.')
      await refreshWorkflows()
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Kon de workflow niet goedkeuren.')
    } finally {
      setWorkflowActionLoadingId(null)
    }
  }

  async function handleSendWorkflow(threadId: string) {
    setWorkflowActionLoadingId(threadId)
    setQueueError(null)
    setQueueMessage(null)

    try {
      const response = await sendOutreachWorkflowNow(threadId)
      setQueueMessage(response.message ?? 'Workflow is sent.')
      setSelectedWorkflowIds((current) => current.filter((selectedId) => selectedId !== threadId))
      await refreshWorkflows()
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Kon de workflow niet verzenden.')
    } finally {
      setWorkflowActionLoadingId(null)
    }
  }

  async function handleBatchSend() {
    if (selectedSendableIds.length === 0) {
      return
    }

    setBatchSendLoading(true)
    setQueueError(null)
    setQueueMessage(null)

    try {
      const response = await batchSendOutreachWorkflows(selectedSendableIds)
      const sentCount = response.sentCount ?? selectedSendableIds.length
      const skippedCount = response.skippedCount ?? 0
      const blockedCount = response.blockedCount ?? 0

      setQueueMessage(
        response.message ??
          `Batch send completed for ${sentCount} workflow${sentCount === 1 ? '' : 's'}${skippedCount || blockedCount ? ` (${skippedCount} skipped, ${blockedCount} blocked)` : ''}.`,
      )
      setSelectedWorkflowIds([])
      await refreshWorkflows()
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Kon de batch niet verzenden.')
    } finally {
      setBatchSendLoading(false)
    }
  }

  function handleToggleSelected(threadId: string, checked: boolean) {
    setSelectedWorkflowIds((current) => {
      if (checked) {
        if (current.includes(threadId)) {
          return current
        }
        return [...current, threadId]
      }

      return current.filter((id) => id !== threadId)
    })
  }

  function handleSelectAllVisibleApproved() {
    const ids = visibleQueueRows.filter((row) => row.canSelect).map((row) => row.workflow.thread.id)
    setSelectedWorkflowIds(Array.from(new Set(ids)))
  }

  function handleClearSelection() {
    setSelectedWorkflowIds([])
  }

  if (error) {
    return (
      <SectionCard title="Buyer discovery and outreach" subtitle="Kon de leads niet laden.">
        {error}
      </SectionCard>
    )
  }

  if (!loaded) {
    return (
      <SectionCard title="Buyer discovery and outreach" subtitle="Leads laden...">
        Even geduld.
      </SectionCard>
    )
  }

  if (leads.length === 0) {
    return (
      <SectionCard title="Buyer discovery and outreach" subtitle="Nog geen leads beschikbaar.">
        Voeg buyer discovery records toe om outreach te starten.
      </SectionCard>
    )
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
                    setQueueMessage(null)
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
                      <p className="text-sm text-slate-600">
                        {lead.contactName} - {lead.contactEmail}
                      </p>
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
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={senderName}
                    onChange={(event) => setSenderName(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Sender email</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={senderEmail}
                    onChange={(event) => setSenderEmail(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Tone</span>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={tone}
                    onChange={(event) => setTone(event.target.value as 'concise' | 'standard' | 'detailed')}
                  >
                    <option value="concise">Concise</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Sequence step</span>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={String(outreachCount)}
                    onChange={(event) => setOutreachCount(Number(event.target.value))}
                  >
                    <option value="0">Initial</option>
                    <option value="1">Follow-up 1</option>
                    <option value="2">Follow-up 2</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span>
                  {selectedLead.companyName} - {selectedLead.contactName}
                </span>
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
                  <div
                    className={
                      draftState.eligible
                        ? 'rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900'
                        : 'rounded-lg bg-amber-50 p-4 text-sm text-amber-900'
                    }
                  >
                    <p className="font-medium">
                      {draftState.companyName} - {draftState.domainName}
                    </p>
                    <p className="mt-1">{draftState.reason}</p>
                  </div>

                  {draftState.draft ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Meta label="Step" value={draftState.draft.sequenceStep} />
                        <Meta label="Language" value={draftState.draft.language} />
                        <Meta
                          label="Follow-up"
                          value={
                            draftState.draft.recommendedFollowUpDays === null
                              ? 'Final step'
                              : `${draftState.draft.recommendedFollowUpDays} days`
                          }
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase text-slate-500">Subject</p>
                        <p className="mt-2 text-sm font-medium text-slate-950">{draftState.draft.subject}</p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs uppercase text-slate-500">Body</p>
                        <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                          {draftState.draft.body}
                        </pre>
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
        title="Outreach queue"
        subtitle="Review eerst de drafts, keur ze goed, en gebruik alleen approved items voor send-now of batch-send."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div>
              <p className="font-medium text-slate-900">Guarded send queue</p>
              <p className="mt-1">Drafts need approval before send. Blocked items can never be sent.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.12em]">
              <QueuePill label="Drafts" value={queueCounts.draft} />
              <QueuePill label="Approved" value={queueCounts.approved} />
              <QueuePill label="Sent" value={queueCounts.sent} />
              <QueuePill label="Blocked" value={queueCounts.blocked} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {QUEUE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setQueueFilter(filter.key)}
                  className={
                    queueFilter === filter.key
                      ? 'rounded-full bg-slate-900 px-4 py-2 text-sm text-white'
                      : 'rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700'
                  }
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSelectAllVisibleApproved}
                disabled={visibleQueueRows.every((row) => !row.canSelect)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                Select approved ({visibleQueueRows.filter((row) => row.canSelect).length})
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={selectedWorkflowIds.length === 0}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={handleBatchSend}
                disabled={batchSendLoading || selectedSendableIds.length === 0}
                className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {batchSendLoading ? 'Sending...' : `Send selected (${selectedSendableIds.length})`}
              </button>
            </div>
          </div>

          {queueError ? <p className="text-sm text-rose-700">{queueError}</p> : null}
          {queueMessage ? <p className="text-sm text-emerald-700">{queueMessage}</p> : null}

          {visibleQueueRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
              Geen workflows in deze statusfilter.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleQueueRows.map((row) => {
                const isSelected = selectedWorkflowIds.includes(row.workflow.thread.id)
                const statusMeta = getQueueStatusMeta(row)
                const loading = workflowActionLoadingId === row.workflow.thread.id

                return (
                  <article key={row.workflow.thread.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-medium text-slate-950">
                          {row.workflow.lead.companyName} - {row.workflow.domain.domainName}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">{row.workflow.message.subject}</p>
                      </div>
                      <StatusChip tone={statusMeta.tone} label={statusMeta.label} />
                    </div>

                    <p className="mt-3 text-sm text-slate-600">{statusMeta.description}</p>

                    <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-4">
                      <QueueMeta label="Contact" value={row.workflow.lead.contactName} />
                      <QueueMeta
                        label="Follow-up due"
                        value={row.workflow.followupTask.dueAt ? new Date(row.workflow.followupTask.dueAt).toLocaleDateString('nl-NL') : 'No follow-up needed'}
                      />
                      <QueueMeta label="Draft step" value={row.workflow.draft.sequenceStep.replaceAll('_', ' ')} />
                      <QueueMeta
                        label="Last updated"
                        value={new Date(row.workflow.thread.lastMessageAt).toLocaleDateString('nl-NL')}
                      />
                    </div>

                    {row.blockedReason ? (
                      <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{row.blockedReason}</div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {row.canSelect ? (
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => handleToggleSelected(row.workflow.thread.id, event.target.checked)}
                          />
                          Include in batch send
                        </label>
                      ) : null}

                      {row.canApprove ? (
                        <button
                          type="button"
                          onClick={() => void handleApproveWorkflow(row.workflow.thread.id)}
                          disabled={loading}
                          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 disabled:opacity-60"
                        >
                          {loading ? 'Approving...' : 'Approve for send'}
                        </button>
                      ) : null}

                      {row.canSendNow ? (
                        <button
                          type="button"
                          onClick={() => void handleSendWorkflow(row.workflow.thread.id)}
                          disabled={loading}
                          className="rounded-full bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                        >
                          {loading ? 'Sending...' : 'Send now'}
                        </button>
                      ) : null}

                      {row.status === 'sent' ? (
                        <span className="rounded-full bg-white px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          Sent
                        </span>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

function getQueueStatusMeta(row: QueueRowState): {
  label: string
  tone: 'emerald' | 'amber' | 'slate' | 'rose'
  description: string
} {
  if (row.status === 'blocked') {
    return {
      label: 'Blocked',
      tone: 'rose',
      description: row.blockedReason ?? 'This workflow is blocked from sending.',
    }
  }

  if (row.status === 'approved') {
    return {
      label: 'Approved',
      tone: 'emerald',
      description: 'Approved and eligible for send-now or batch-send.',
    }
  }

  if (row.status === 'sent') {
    return {
      label: 'Sent',
      tone: 'slate',
      description: 'The latest message in this thread has already been sent.',
    }
  }

  return {
    label: 'Draft',
    tone: 'amber',
    description: 'Draft prepared. Review it first, then approve before any send action.',
  }
}

function QueuePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-white px-3 py-2 text-slate-700">
      {label} {value}
    </span>
  )
}

function StatusChip({ label, tone }: { label: string; tone: 'emerald' | 'amber' | 'slate' | 'rose' }) {
  const className =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-800'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-800'
          : 'bg-slate-100 text-slate-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] ${className}`}>{label}</span>
}

function QueueMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value}</p>
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
