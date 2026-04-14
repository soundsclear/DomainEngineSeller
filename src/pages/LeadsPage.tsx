import { useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SectionCard } from '@/components/SectionCard'
import { SkeletonRow } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
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

const OUTREACH_SEND_LOCKED = true
const OUTREACH_SEND_LOCK_MESSAGE = 'Contact outreach is hard locked for now. Drafts and enrichment are allowed, but approve/send actions stay disabled until we lift the lock.'

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
  const [saveLoading, setSaveLoading] = useState(false)
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>([])
  const [workflowActionLoadingId, setWorkflowActionLoadingId] = useState<string | null>(null)
  const [batchSendLoading, setBatchSendLoading] = useState(false)
  const toast = useToast()

  function load() {
    let active = true

    Promise.all([fetchLeads(), fetchOutreachWorkflows()])
      .then(([leadResponse, workflowResponse]) => {
        if (!active) return
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
  }

  useEffect(load, [])

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
      OUTREACH_SEND_LOCKED
        ? []
        : selectedWorkflowIds.filter((threadId) =>
            queueRows.some((row) => row.workflow.thread.id === threadId && row.status === 'approved'),
          ),
    [queueRows, selectedWorkflowIds],
  )

  async function refreshWorkflows() {
    const response = await fetchOutreachWorkflows()
    setWorkflows(response.items)
  }

  async function handleGenerateDraft() {
    if (!selectedLead) return

    setDraftLoading(true)

    try {
      const response = await generateLeadOutreachDraft(selectedLead.id, {
        sender: { name: senderName, email: senderEmail },
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
      toast.show(err instanceof Error ? err.message : 'Kon het outreach concept niet genereren.', 'error')
      setDraftState(null)
    } finally {
      setDraftLoading(false)
    }
  }

  async function handleSaveWorkflow() {
    if (!selectedLead || !draftState?.draft) return

    setSaveLoading(true)

    try {
      const response = await saveLeadOutreachWorkflow(selectedLead.id, {
        sender: { name: senderName, email: senderEmail },
        tone,
        outreachCount,
        autoSendEnabled: false,
        dailyLimit: 10,
      })

      setWorkflows((current) => [response.item, ...current.filter((item) => item.thread.id !== response.item.thread.id)])
      setSelectedWorkflowIds((current) => current.filter((threadId) => threadId !== response.item.thread.id))
      toast.show('Draft opgeslagen als reviewbare outreach workflow.', 'success')
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon de workflow niet opslaan.', 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  async function handleApproveWorkflow(threadId: string) {
    if (OUTREACH_SEND_LOCKED) {
      toast.show('Approve for send is locked for now. You can still create and save drafts.', 'error')
      return
    }

    setWorkflowActionLoadingId(threadId)

    try {
      const response = await approveOutreachWorkflow(threadId)
      toast.show(response.message ?? 'Workflow is approved for send.', 'success')
      await refreshWorkflows()
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon de workflow niet goedkeuren.', 'error')
    } finally {
      setWorkflowActionLoadingId(null)
    }
  }

  async function handleSendWorkflow(threadId: string) {
    if (OUTREACH_SEND_LOCKED) {
      toast.show('Send now is locked for now. Drafts and enrichment are still available.', 'error')
      return
    }

    setWorkflowActionLoadingId(threadId)

    try {
      const response = await sendOutreachWorkflowNow(threadId)
      toast.show(response.message ?? 'Workflow is sent.', 'success')
      setSelectedWorkflowIds((current) => current.filter((selectedId) => selectedId !== threadId))
      await refreshWorkflows()
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon de workflow niet verzenden.', 'error')
    } finally {
      setWorkflowActionLoadingId(null)
    }
  }

  async function handleBatchSend() {
    if (OUTREACH_SEND_LOCKED) {
      toast.show('Bulk send is locked for now. Review and draft generation still work.', 'error')
      return
    }

    if (selectedSendableIds.length === 0) return

    setBatchSendLoading(true)

    try {
      const response = await batchSendOutreachWorkflows(selectedSendableIds)
      const sentCount = response.sentCount ?? selectedSendableIds.length
      const skippedCount = response.skippedCount ?? 0
      const blockedCount = response.blockedCount ?? 0

      toast.show(
        response.message ??
          `Batch send completed for ${sentCount} workflow${sentCount === 1 ? '' : 's'}${skippedCount || blockedCount ? ` (${skippedCount} skipped, ${blockedCount} blocked)` : ''}.`,
        'success',
      )
      setSelectedWorkflowIds([])
      await refreshWorkflows()
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon de batch niet verzenden.', 'error')
    } finally {
      setBatchSendLoading(false)
    }
  }

  function handleToggleSelected(threadId: string, checked: boolean) {
    setSelectedWorkflowIds((current) => {
      if (checked) {
        if (current.includes(threadId)) return current
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

  if (!loaded) {
    return (
      <SectionCard title="Buyer discovery and outreach">
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
        <span style={{ color: 'var(--color-text)' }}>Failed to load leads: {error}</span>
        <button onClick={load} className="ml-4 text-[13px] font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>Retry</button>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No leads yet"
        description="Voeg buyer discovery records toe om outreach te starten."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard
        title="Buyer discovery"
        subtitle="Kies een lead en genereer een conceptmail vanuit de bestaande outreach guardrails. Contact uitsturen blijft hard geblokkeerd."
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
                    setDraftState(null)
                  }}
                  className="w-full rounded-lg p-4 text-left transition-colors"
                  style={
                    active
                      ? { border: '1px solid var(--color-accent)', backgroundColor: 'var(--color-accent-light)' }
                      : { border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>{lead.companyName}</h3>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {lead.contactName} - {lead.contactEmail}
                      </p>
                    </div>
                    <span
                      className="rounded-lg px-3 py-1 text-xs font-medium"
                      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-accent-text)' }}
                    >
                      Score {lead.priorityScore}
                    </span>
                  </div>
                  <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{lead.buyerFitReason}</p>
                  <div className="mt-3 flex items-center justify-between text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>
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
        subtitle="Draft-first workflow: enrichment en drafts blijven beschikbaar, maar contactversturen staat hard op slot."
      >
          <div
            className="mb-5 rounded-xl border px-4 py-3 text-[14px]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-accent-light)',
              color: 'var(--color-accent-text)',
            }}
          >
            <p className="font-medium">Send lock actief</p>
            <p className="mt-1">{OUTREACH_SEND_LOCK_MESSAGE}</p>
          </div>

          {selectedLead ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Sender name</span>
                  <input
                    className="w-full rounded-lg px-3 py-2 text-[14px]"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                    value={senderName}
                    onChange={(event) => setSenderName(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Sender email</span>
                  <input
                    className="w-full rounded-lg px-3 py-2 text-[14px]"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                    value={senderEmail}
                    onChange={(event) => setSenderEmail(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Tone</span>
                  <select
                    className="w-full rounded-lg px-3 py-2 text-[14px]"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                    value={tone}
                    onChange={(event) => setTone(event.target.value as 'concise' | 'standard' | 'detailed')}
                  >
                    <option value="concise">Concise</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Sequence step</span>
                  <select
                    className="w-full rounded-lg px-3 py-2 text-[14px]"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                    value={String(outreachCount)}
                    onChange={(event) => setOutreachCount(Number(event.target.value))}
                  >
                    <option value="0">Initial</option>
                    <option value="1">Follow-up 1</option>
                    <option value="2">Follow-up 2</option>
                  </select>
                </label>
              </div>

              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-[14px]"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
              >
                <span>
                  {selectedLead.companyName} - {selectedLead.contactName}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={draftLoading}
                    className="rounded-lg px-4 py-2 text-[14px] text-white disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    {draftLoading ? 'Generating...' : 'Generate draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveWorkflow}
                    disabled={saveLoading || !draftState?.draft || !draftState.eligible}
                    className="rounded-lg px-4 py-2 text-[14px] disabled:opacity-60"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    {saveLoading ? 'Saving...' : 'Save to workflow'}
                  </button>
                </div>
              </div>

              {draftState ? (
                <div className="space-y-4">
                  <div
                    className={
                      draftState.eligible
                        ? 'rounded-lg p-4 text-[14px]'
                        : 'rounded-lg bg-amber-50 p-4 text-[14px] text-amber-900'
                    }
                    style={
                      draftState.eligible
                        ? { backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }
                        : undefined
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

                      <div
                        className="rounded-lg p-4"
                        style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
                      >
                        <p className="text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>Subject</p>
                        <p className="mt-2 text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>{draftState.draft.subject}</p>
                      </div>

                      <div
                        className="rounded-lg p-4"
                        style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
                      >
                        <p className="text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>Body</p>
                        <pre className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>
                          {draftState.draft.body}
                        </pre>
                      </div>

                      <div className="rounded-lg p-4 text-[14px]" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                        <p className="font-medium" style={{ color: 'var(--color-text)' }}>Personalisation tokens</p>
                        <p className="mt-2">{draftState.draft.personalizationTokensUsed.join(', ')}</p>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div
                  className="rounded-lg px-4 py-6 text-[14px]"
                  style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Genereer een concept om de outreach copy voor deze lead te bekijken.
                </div>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="Outreach queue"
        subtitle="Review eerst de drafts. Approve, send-now en batch-send blijven disabled totdat we de lock expliciet opheffen."
      >
        <div className="space-y-4">
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-[14px]"
            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
          >
            <div>
              <p className="font-medium" style={{ color: 'var(--color-text)' }}>Guarded send queue</p>
              <p className="mt-1">{OUTREACH_SEND_LOCK_MESSAGE}</p>
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
              {QUEUE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setQueueFilter(f.key)}
                  className="rounded-full px-4 py-2 text-[14px] transition-colors"
                  style={
                    queueFilter === f.key
                      ? { backgroundColor: 'var(--color-text)', color: '#ffffff' }
                      : { border: '1px solid var(--color-border)', color: 'var(--color-text)' }
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSelectAllVisibleApproved}
                disabled={OUTREACH_SEND_LOCKED || visibleQueueRows.every((row) => !row.canSelect)}
                className="rounded-full px-4 py-2 text-[14px] disabled:opacity-50"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              >
                Select approved ({visibleQueueRows.filter((row) => row.canSelect).length})
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={selectedWorkflowIds.length === 0}
                className="rounded-full px-4 py-2 text-[14px] disabled:opacity-50"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={handleBatchSend}
                disabled={OUTREACH_SEND_LOCKED || batchSendLoading || selectedSendableIds.length === 0}
                className="rounded-full px-4 py-2 text-[14px] text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                {batchSendLoading ? 'Sending...' : OUTREACH_SEND_LOCKED ? 'Send locked' : `Send selected (${selectedSendableIds.length})`}
              </button>
            </div>
          </div>

          {visibleQueueRows.length === 0 ? (
            <div
              className="rounded-lg px-4 py-6 text-[14px]"
              style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Geen workflows in deze statusfilter.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleQueueRows.map((row) => {
                const isSelected = selectedWorkflowIds.includes(row.workflow.thread.id)
                const statusMeta = getQueueStatusMeta(row)
                const loading = workflowActionLoadingId === row.workflow.thread.id

                return (
                  <article
                    key={row.workflow.thread.id}
                    className="rounded-lg p-4"
                    style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-bg)' }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                          {row.workflow.lead.companyName} - {row.workflow.domain.domainName}
                        </h3>
                        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{row.workflow.message.subject}</p>
                      </div>
                      <StatusChip tone={statusMeta.tone} label={statusMeta.label} />
                    </div>

                    <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{statusMeta.description}</p>

                    <div className="mt-3 grid gap-3 text-[14px] md:grid-cols-4" style={{ color: 'var(--color-text-secondary)' }}>
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
                        <label className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={OUTREACH_SEND_LOCKED}
                            onChange={(event) => handleToggleSelected(row.workflow.thread.id, event.target.checked)}
                          />
                          Include in batch send
                        </label>
                      ) : null}

                      {row.canApprove ? (
                        <button
                          type="button"
                          onClick={() => void handleApproveWorkflow(row.workflow.thread.id)}
                          disabled={loading || OUTREACH_SEND_LOCKED}
                          className="rounded-full px-4 py-2 text-[14px] disabled:opacity-60"
                          style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                        >
                          {loading ? 'Approving...' : OUTREACH_SEND_LOCKED ? 'Approve locked' : 'Approve for send'}
                        </button>
                      ) : null}

                      {row.canSendNow ? (
                        <button
                          type="button"
                          onClick={() => void handleSendWorkflow(row.workflow.thread.id)}
                          disabled={loading || OUTREACH_SEND_LOCKED}
                          className="rounded-full px-4 py-2 text-[14px] text-white disabled:opacity-60"
                          style={{ backgroundColor: 'var(--color-accent)' }}
                        >
                          {loading ? 'Sending...' : OUTREACH_SEND_LOCKED ? 'Send locked' : 'Send now'}
                        </button>
                      ) : null}

                      {row.status === 'sent' ? (
                        <span
                          className="rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.12em]"
                          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
                        >
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
  tone: 'accent' | 'amber' | 'slate' | 'rose'
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
      tone: 'accent',
      description: OUTREACH_SEND_LOCKED
        ? 'Approved in review, but sending is hard locked for now.'
        : 'Approved and eligible for send-now or batch-send.',
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
    description: OUTREACH_SEND_LOCKED
      ? 'Draft prepared. Review and save are available, but approval and send stay locked.'
      : 'Draft prepared. Review it first, then approve before any send action.',
  }
}

function QueuePill({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="rounded-full px-3 py-2"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
    >
      {label} {value}
    </span>
  )
}

function StatusChip({ label, tone }: { label: string; tone: 'accent' | 'amber' | 'slate' | 'rose' }) {
  if (tone === 'accent') {
    return (
      <span
        className="rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.12em]"
        style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}
      >
        {label}
      </span>
    )
  }

  const className =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-800'
        : 'bg-slate-100 text-slate-700'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] ${className}`}>
      {label}
    </span>
  )
}

function QueueMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="mt-1 text-[14px]" style={{ color: 'var(--color-text)' }}>{value}</p>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
    >
      <p className="text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="mt-2 text-[14px] font-medium capitalize" style={{ color: 'var(--color-text)' }}>{value.replaceAll('_', ' ')}</p>
    </div>
  )
}
