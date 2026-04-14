import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BadgeEuro } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { SectionCard } from '@/components/SectionCard'
import { SkeletonRow } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  fetchDeals,
  fetchTransferTasks,
  fetchProviderTransactions,
  createProviderTransactionApi,
  generateStripeInvoicePayload,
  progressDeal,
  type DealViewRecord,
  type StripeInvoicePayloadResponse,
  type TransferTaskRecord,
  type ProviderTransactionRecord,
  type CreateProviderTransactionPayload,
} from '@/lib/api'
import type { XelTransferPackage } from '@/lib/xel-transfer'

export function DealsPage() {
  const [deals, setDeals] = useState<DealViewRecord[]>([])
  const [transferTasks, setTransferTasks] = useState<TransferTaskRecord[]>([])
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [paymentSecured, setPaymentSecured] = useState(false)
  const [buyerUsesXel, setBuyerUsesXel] = useState(false)
  const [buyerApprovalState, setBuyerApprovalState] = useState<'pending' | 'approved' | 'disputed'>('pending')
  const [buyerXelAccount, setBuyerXelAccount] = useState('')
  const [buyerRegistrar, setBuyerRegistrar] = useState('')
  const [explicitInvoiceTransferApproval, setExplicitInvoiceTransferApproval] = useState(false)
  const [invoiceBuyerEmail, setInvoiceBuyerEmail] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [invoicePayload, setInvoicePayload] = useState<StripeInvoicePayloadResponse['payload'] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const [providerTxs, setProviderTxs] = useState<ProviderTransactionRecord[]>([])
  const [showTxForm, setShowTxForm] = useState(false)
  const [txForm, setTxForm] = useState<CreateProviderTransactionPayload>({
    provider: 'escrow_com',
    providerReference: '',
    status: 'pending',
  })
  const [txError, setTxError] = useState<string | null>(null)
  const [txSubmitting, setTxSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    Promise.all([fetchDeals(), fetchTransferTasks()])
      .then(([dealResponse, taskResponse]) => {
        if (active) {
          setDeals(dealResponse.items)
          setTransferTasks(taskResponse.items)
          const first = dealResponse.items[0]
          if (first) {
            setSelectedDealId(first.id)
            setPaymentSecured(first.paymentSecured)
            setBuyerApprovalState(first.buyerApprovalState ?? 'pending')
          }
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

  useEffect(() => {
    if (!selectedDealId) {
      setProviderTxs([])
      return
    }
    let active = true
    fetchProviderTransactions(selectedDealId)
      .then((response) => {
        if (active) setProviderTxs(response.items)
      })
      .catch(() => {
        if (active) setProviderTxs([])
      })
    return () => {
      active = false
    }
  }, [selectedDealId])

  const selectedDeal = useMemo(() => deals.find((deal) => deal.id === selectedDealId) ?? null, [deals, selectedDealId])

  async function handleAddProviderTx(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedDealId) return
    setTxSubmitting(true)
    setTxError(null)
    try {
      const result = await createProviderTransactionApi(selectedDealId, txForm)
      setProviderTxs((current) => [result.item, ...current])
      setTxForm({ provider: 'escrow_com', providerReference: '', status: 'pending' })
      setShowTxForm(false)
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Kon de transactie niet opslaan.')
    } finally {
      setTxSubmitting(false)
    }
  }

  async function handleProgress() {
    if (!selectedDeal) return

    try {
      const response = await progressDeal(selectedDeal.id, {
        paymentSecured,
        buyerUsesXel,
        buyerApprovalState,
        explicitInvoiceTransferApproval,
        buyerXelAccount: buyerXelAccount || undefined,
        buyerRegistrar: buyerRegistrar || undefined,
      })

      setDeals((current) =>
        current.map((deal) =>
          deal.id === selectedDeal.id
            ? {
                ...deal,
                status: response.decision.decision.nextStatus,
                paymentSecured,
                buyerApprovalState,
                updatedAt: Date.now(),
              }
            : deal,
        ),
      )
      if (response.decision.transferTask) {
        const task = response.decision.transferTask
        setTransferTasks((current) => [task, ...current])
      }
      toast.show(response.decision.decision.reason, 'success')
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kon de dealstatus niet bijwerken.', 'error')
    }
  }

  async function handleGenerateInvoice() {
    if (!selectedDeal) return

    try {
      const response = await generateStripeInvoicePayload(selectedDeal.id, {
        buyerName: selectedDeal.companyName ?? 'Unknown buyer',
        buyerEmail: invoiceBuyerEmail,
        currency: 'EUR',
      })
      setInvoicePayload(response.payload)
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not generate invoice payload.', 'error')
    }
  }

  if (!loaded) {
    return (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Deals">
          {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
        </SectionCard>
        <SectionCard title="Deal progression">
          {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
        </SectionCard>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3 text-[14px]"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)', borderLeft: '3px solid var(--color-destructive)' }}
      >
        <span style={{ color: 'var(--color-text)' }}>Failed to load deals: {error}</span>
      </div>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <SectionCard title="Deals" subtitle="Offers en inbound leads die zijn doorgezet naar een closing workflow.">
        {deals.length === 0 ? (
          <EmptyState
            icon={BadgeEuro}
            title="No active deals"
            description="Convert an inquiry to a deal to start tracking negotiations."
          />
        ) : (
          <div className="space-y-2">
            {deals.map((deal) => (
              <button
                key={deal.id}
                type="button"
                onClick={() => {
                  setSelectedDealId(deal.id)
                  setPaymentSecured(deal.paymentSecured)
                  setBuyerApprovalState(deal.buyerApprovalState ?? 'pending')
                  setBuyerUsesXel(false)
                  setBuyerXelAccount('')
                  setBuyerRegistrar('')
                  setExplicitInvoiceTransferApproval(false)
                  setInvoiceBuyerEmail('')
                  setInvoicePayload(null)
                }}
                className="w-full rounded-lg p-4 text-left transition-colors"
                style={
                  deal.id === selectedDealId
                    ? { border: '1px solid var(--color-accent)', backgroundColor: 'var(--color-accent-light)' }
                    : { border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-bg)' }
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-medium" style={{ color: 'var(--color-text)' }}>{deal.domainName ?? 'Unknown domain'}</h3>
                    <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{deal.companyName ?? 'Unknown buyer'}</p>
                  </div>
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase" style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}>
                    {deal.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Deal progression" subtitle="Werk de closing state bij en laat de beslislogica de volgende status bepalen.">
        {selectedDeal ? (
          <div className="space-y-4">
            <div className="rounded-lg p-4 text-[14px]" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
              <p className="font-medium">{selectedDeal.domainName}</p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{selectedDeal.companyName ?? 'Unknown buyer'} · {selectedDeal.closingMethod.replaceAll('_', ' ')}</p>
            </div>

            <label className="flex items-center gap-3 text-[14px]" style={{ color: 'var(--color-text)' }}>
              <input type="checkbox" checked={paymentSecured} onChange={(event) => setPaymentSecured(event.target.checked)} />
              Payment secured
            </label>
            <label className="flex items-center gap-3 text-[14px]" style={{ color: 'var(--color-text)' }}>
              <input type="checkbox" checked={buyerUsesXel} onChange={(event) => setBuyerUsesXel(event.target.checked)} />
              Buyer uses Xel
            </label>
            {buyerUsesXel ? (
              <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text)' }}>
                <span>Buyer Xel account</span>
                <input className="w-full rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-border)' }} value={buyerXelAccount} onChange={(event) => setBuyerXelAccount(event.target.value)} />
              </label>
            ) : (
              <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text)' }}>
                <span>Buyer registrar</span>
                <input className="w-full rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-border)' }} value={buyerRegistrar} onChange={(event) => setBuyerRegistrar(event.target.value)} />
              </label>
            )}
            <label className="flex items-center gap-3 text-[14px]" style={{ color: 'var(--color-text)' }}>
              <input type="checkbox" checked={explicitInvoiceTransferApproval} onChange={(event) => setExplicitInvoiceTransferApproval(event.target.checked)} />
              Explicit invoice transfer approval
            </label>
            <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text)' }}>
              <span>Buyer approval state</span>
              <select className="w-full rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-border)' }} value={buyerApprovalState} onChange={(event) => setBuyerApprovalState(event.target.value as 'pending' | 'approved' | 'disputed')}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="disputed">Disputed</option>
              </select>
            </label>

            <button type="button" onClick={handleProgress} className="rounded-lg px-4 py-2 text-[14px] text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
              Update deal status
            </button>

            {selectedDeal.closingMethod === 'stripe_invoice_manual_transfer' && (
              <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-bg)' }}>
                <p className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>Generate Stripe invoice payload</p>
                <label className="space-y-2 text-[14px]" style={{ color: 'var(--color-text)' }}>
                  <span>Buyer email</span>
                  <input
                    type="email"
                    className="w-full rounded-lg px-3 py-2"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                    placeholder="buyer@example.com"
                    value={invoiceBuyerEmail}
                    onChange={(event) => setInvoiceBuyerEmail(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!explicitInvoiceTransferApproval || !invoiceBuyerEmail}
                  onClick={handleGenerateInvoice}
                  className="rounded-lg px-4 py-2 text-[14px] text-white disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  Generate invoice payload
                </button>
                {!explicitInvoiceTransferApproval && (
                  <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>Enable "Explicit invoice transfer approval" above to unlock.</p>
                )}
                {invoicePayload ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg p-3 text-[12px]" style={{ border: '1px solid var(--color-border-soft)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
                    {JSON.stringify(invoicePayload, null, 2)}
                  </pre>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-500">Selecteer een deal.</div>
        )}
      </SectionCard>

      <SectionCard title="Transfer tasks" subtitle="Xel transfer-prep tasks generated from deal progression.">
        {transferTasks.length === 0 ? (
          <div className="text-sm text-slate-500">Nog geen transfer tasks beschikbaar.</div>
        ) : (
          <div className="space-y-3">
            {transferTasks.map((task) => {
              const isExpanded = expandedTaskId === task.id
              let checklist: XelTransferPackage | null = null
              if (isExpanded && task.checklistJson) {
                try {
                  checklist = JSON.parse(task.checklistJson) as XelTransferPackage
                } catch {
                  checklist = null
                }
              }

              return (
                <article key={task.id} className="rounded-lg border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-medium text-slate-950">{task.domainName ?? 'Unknown domain'}</h3>
                        <p className="mt-1 text-sm text-slate-600">{task.actionType.replaceAll('_', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium uppercase text-emerald-800">
                          {task.status}
                        </span>
                        <span className="text-xs text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-700">
                      <div>
                        <p className="text-xs uppercase text-slate-500">Buyer</p>
                        <p className="mt-1">{task.companyName ?? 'Unknown buyer'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500">Deadline</p>
                        <p className="mt-1">{task.deadlineAt ? new Date(task.deadlineAt).toLocaleDateString('nl-NL') : 'No deadline'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500">Manual checkpoint</p>
                        <p className="mt-1">{task.manualCheckpointRequired ? 'Required' : 'Not required'}</p>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 px-4 pb-4 pt-4 space-y-5">
                      {checklist === null ? (
                        <p className="text-sm text-rose-600">Could not parse checklist data.</p>
                      ) : (
                        <>
                          <div className="rounded-lg bg-white border border-slate-200 p-3 text-sm">
                            <p className="text-xs uppercase text-slate-500 mb-1">Transfer mode</p>
                            <p className="font-medium text-slate-900">{checklist.transferMode.replaceAll('_', ' ')}</p>
                            <p className="mt-1 text-slate-500 text-xs">Deal ref: {checklist.dealReference} · Generated: {new Date(checklist.generatedAt).toLocaleString('nl-NL')}</p>
                          </div>

                          {checklist.sellerChecklist.length > 0 && (
                            <div>
                              <p className="text-xs uppercase text-slate-500 mb-2">Seller checklist</p>
                              <ol className="space-y-1 list-decimal list-inside text-sm text-slate-700">
                                {checklist.sellerChecklist.map((item, i) => (
                                  <li key={i}>{item.label}{item.required ? ' *' : ''}{item.note ? <span className="text-slate-400"> — {item.note}</span> : null}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {checklist.buyerChecklist.length > 0 && (
                            <div>
                              <p className="text-xs uppercase text-slate-500 mb-2">Buyer checklist</p>
                              <ol className="space-y-1 list-decimal list-inside text-sm text-slate-700">
                                {checklist.buyerChecklist.map((item, i) => (
                                  <li key={i}>{item.label}{item.required ? ' *' : ''}{item.note ? <span className="text-slate-400"> — {item.note}</span> : null}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {checklist.manualCheckpoints.length > 0 && (
                            <div>
                              <p className="text-xs uppercase text-slate-500 mb-2">Manual checkpoints</p>
                              <div className="space-y-2">
                                {checklist.manualCheckpoints.map((cp, i) => (
                                  <div key={i} className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                                    <p className="font-medium">{cp.description}</p>
                                    {cp.blocksNextStep && <p className="mt-1 text-xs text-amber-700">Blocks next step</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {checklist.sellerFacingInstructions && (
                            <div>
                              <p className="text-xs uppercase text-slate-500 mb-2">Seller instructions</p>
                              <pre className="rounded-lg bg-white border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap">{checklist.sellerFacingInstructions}</pre>
                            </div>
                          )}

                          {checklist.buyerFacingInstructions && (
                            <div>
                              <p className="text-xs uppercase text-slate-500 mb-2">Buyer instructions</p>
                              <pre className="rounded-lg bg-white border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap">{checklist.buyerFacingInstructions}</pre>
                            </div>
                          )}

                          {checklist.supportRequestCopy && (
                            <div>
                              <p className="text-xs uppercase text-slate-500 mb-2">Support request copy</p>
                              <pre className="rounded-lg bg-white border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap">{checklist.supportRequestCopy}</pre>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Escrow / platform referenties" subtitle="Vastgelegde betalings- en overdrachtsreferenties van het escrow- of transferplatform.">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setShowTxForm((v) => !v)}
            disabled={!selectedDealId}
            className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {showTxForm ? 'Annuleren' : 'Referentie toevoegen'}
          </button>
        </div>

        {showTxForm && selectedDealId && (
          <form onSubmit={handleAddProviderTx} className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="block space-y-1 text-sm text-slate-700">
              <span>Platform</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={txForm.provider}
                onChange={(e) => setTxForm((f) => ({ ...f, provider: e.target.value as CreateProviderTransactionPayload['provider'] }))}
              >
                <option value="escrow_com">Escrow.com</option>
                <option value="sedo">Sedo</option>
                <option value="afternic">Afternic</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm text-slate-700">
              <span>Referentienummer *</span>
              <input
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={txForm.providerReference}
                onChange={(e) => setTxForm((f) => ({ ...f, providerReference: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm text-slate-700">
              <span>Status</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                value={txForm.status}
                onChange={(e) => setTxForm((f) => ({ ...f, status: e.target.value }))}
              />
            </label>
            {txError && <p className="text-sm text-rose-700">{txError}</p>}
            <button
              type="submit"
              disabled={txSubmitting}
              className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {txSubmitting ? 'Opslaan...' : 'Opslaan'}
            </button>
          </form>
        )}

        {providerTxs.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen referenties vastgelegd voor deze deal.</p>
        ) : (
          <div className="space-y-3">
            {providerTxs.map((tx) => (
              <article key={tx.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{tx.provider.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-slate-600">Ref: {tx.providerReference}</p>
                  </div>
                  <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium uppercase text-slate-700">
                    {tx.status}
                  </span>
                </div>
                {tx.amount != null && (
                  <p className="mt-2 text-slate-600">Bedrag: €{tx.amount.toLocaleString('nl-NL')}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">{new Date(tx.createdAt).toLocaleDateString('nl-NL')}</p>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
