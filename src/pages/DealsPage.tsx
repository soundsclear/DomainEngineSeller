import { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '@/components/SectionCard'
import { fetchDeals, fetchTransferTasks, progressDeal, type DealViewRecord, type TransferTaskRecord } from '@/lib/api'

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
            {transferTasks.map((task) => (
              <article key={task.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium text-slate-950">{task.domainName ?? 'Unknown domain'}</h3>
                    <p className="mt-1 text-sm text-slate-600">{task.actionType.replaceAll('_', ' ')}</p>
                  </div>
                  <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium uppercase text-emerald-800">
                    {task.status}
                  </span>
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
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
