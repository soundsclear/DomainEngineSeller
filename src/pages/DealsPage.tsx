import { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '@/components/SectionCard'
import { fetchDeals, fetchTransferTasks, generateStripeInvoicePayload, progressDeal, type DealViewRecord, type StripeInvoicePayloadResponse, type TransferTaskRecord } from '@/lib/api'
import type { XelTransferPackage } from '@/lib/xel-transfer'

export function DealsPage() {
  const [deals, setDeals] = useState<DealViewRecord[]>([])
  const [transferTasks, setTransferTasks] = useState<TransferTaskRecord[]>([])
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [paymentSecured, setPaymentSecured] = useState(false)
  const [buyerUsesXel, setBuyerUsesXel] = useState(false)
  const [buyerApprovalState, setBuyerApprovalState] = useState<'pending' | 'approved' | 'disputed'>('pending')
  const [explicitInvoiceTransferApproval, setExplicitInvoiceTransferApproval] = useState(false)
  const [buyerXelAccount, setBuyerXelAccount] = useState('')
  const [buyerRegistrar, setBuyerRegistrar] = useState('')
  const [invoiceBuyerEmail, setInvoiceBuyerEmail] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [invoicePayload, setInvoicePayload] = useState<StripeInvoicePayloadResponse['payload'] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const selectedDeal = useMemo(() => deals.find((deal) => deal.id === selectedDealId) ?? null, [deals, selectedDealId])

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
      setMessage(response.decision.decision.reason)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon de dealstatus niet bijwerken.')
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
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate invoice payload.')
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <SectionCard title="Deals" subtitle="Offers en inbound leads die zijn doorgezet naar een closing workflow.">
        {deals.length === 0 ? (
          <div className="text-sm text-slate-500">Nog geen deals beschikbaar.</div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => (
              <button
                key={deal.id}
                type="button"
                onClick={() => {
                  setSelectedDealId(deal.id)
                  setPaymentSecured(deal.paymentSecured)
                  setBuyerApprovalState(deal.buyerApprovalState ?? 'pending')
                  setBuyerUsesXel(false)
                  setExplicitInvoiceTransferApproval(false)
                  setBuyerXelAccount('')
                  setBuyerRegistrar('')
                  setInvoiceBuyerEmail('')
                  setInvoicePayload(null)
                  setMessage(null)
                  setError(null)
                }}
                className={
                  deal.id === selectedDealId
                    ? 'w-full rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-left'
                    : 'w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-left'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium text-slate-950">{deal.domainName ?? 'Unknown domain'}</h3>
                    <p className="mt-1 text-sm text-slate-600">{deal.companyName ?? 'Unknown buyer'}</p>
                  </div>
                  <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium uppercase text-emerald-800">
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
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{selectedDeal.domainName}</p>
              <p className="mt-1">{selectedDeal.companyName ?? 'Unknown buyer'} · {selectedDeal.closingMethod.replaceAll('_', ' ')}</p>
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={paymentSecured} onChange={(event) => setPaymentSecured(event.target.checked)} />
              Payment secured
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={buyerUsesXel} onChange={(event) => setBuyerUsesXel(event.target.checked)} />
              Buyer uses Xel
            </label>
            {buyerUsesXel ? (
              <label className="space-y-2 text-sm text-slate-700">
                <span>Buyer Xel account</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={buyerXelAccount} onChange={(event) => setBuyerXelAccount(event.target.value)} />
              </label>
            ) : (
              <label className="space-y-2 text-sm text-slate-700">
                <span>Buyer registrar</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={buyerRegistrar} onChange={(event) => setBuyerRegistrar(event.target.value)} />
              </label>
            )}
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={explicitInvoiceTransferApproval} onChange={(event) => setExplicitInvoiceTransferApproval(event.target.checked)} />
              Explicit invoice transfer approval
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Buyer approval state</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={buyerApprovalState} onChange={(event) => setBuyerApprovalState(event.target.value as 'pending' | 'approved' | 'disputed')}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="disputed">Disputed</option>
              </select>
            </label>

            <button type="button" onClick={handleProgress} className="rounded-lg bg-emerald-900 px-4 py-2 text-white">
              Update deal status
            </button>

            {selectedDeal.closingMethod === 'stripe_invoice_manual_transfer' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-900">Generate Stripe invoice payload</p>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Buyer email</span>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                    placeholder="buyer@example.com"
                    value={invoiceBuyerEmail}
                    onChange={(event) => setInvoiceBuyerEmail(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!explicitInvoiceTransferApproval || !invoiceBuyerEmail}
                  onClick={handleGenerateInvoice}
                  className="rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-40"
                >
                  Generate invoice payload
                </button>
                {!explicitInvoiceTransferApproval && (
                  <p className="text-xs text-slate-500">Enable "Explicit invoice transfer approval" above to unlock.</p>
                )}
                {invoicePayload ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
                    {JSON.stringify(invoicePayload, null, 2)}
                  </pre>
                ) : null}
              </div>
            )}

            {message ? <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div> : null}
            {error ? <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-900">{error}</div> : null}
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
    </div>
  )
}
