import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import { createDealFromInquiry, fetchInboundInquiries, type InboundInquiryRecord } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import type { ClosingMethod } from '@/types/domain'

type InquiryFilter = 'all' | 'offer' | 'contact'

export function InboxPage() {
  const [items, setItems] = useState<InboundInquiryRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<InquiryFilter>('all')
  const [closingMethodById, setClosingMethodById] = useState<Record<string, ClosingMethod>>({})
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchInboundInquiries()
      .then((response) => {
        if (active) {
          setItems(response.items)
          setClosingMethodById(
            Object.fromEntries(
              response.items.map((item) => [item.id, 'escrow_com' satisfies ClosingMethod]),
            ),
          )
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

  const filteredItems = useMemo(() => {
    if (filter === 'all') {
      return items
    }

    return items.filter((item) => item.inquiryType === filter)
  }, [filter, items])

  if (error) {
    return <SectionCard title="Inbox" subtitle="Kon de inbound inquiries niet laden.">{error}</SectionCard>
  }

  if (!loaded) {
    return <SectionCard title="Inbox" subtitle="Inbox laden...">Even geduld.</SectionCard>
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Inbound inbox"
        subtitle="Publieke offers en contactaanvragen komen hier binnen met hun kernsignalen, zodat je snel kunt opvolgen."
      >
        <div className="flex flex-wrap gap-2">
          {(['all', 'offer', 'contact'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? 'rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white'
                  : 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700'
              }
            >
              {value === 'all' ? 'All' : value === 'offer' ? 'Offers' : 'Contacts'}
            </button>
          ))}
        </div>
      </SectionCard>

      {filteredItems.length === 0 ? (
        <SectionCard title="No inquiries yet" subtitle="Nieuwe inbound berichten verschijnen hier automatisch.">
          Geen inbound inquiries gevonden voor dit filter.
        </SectionCard>
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-[28px] border border-white/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">{item.inquiryType === 'offer' ? 'Offer' : 'Contact'}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950">{item.senderName ?? item.senderEmail}</h2>
                  <p className="mt-1 text-sm text-slate-600">{item.senderEmail}</p>
                </div>
                <div className="text-right">
                  {item.offerAmount ? <p className="text-lg font-medium text-slate-950">{formatCurrency(item.offerAmount)}</p> : null}
                  <p className="mt-1 text-xs uppercase text-slate-500">{new Date(item.createdAt).toLocaleString('nl-NL')}</p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-700">{item.message}</p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{item.domainName ?? 'Unknown domain'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                    value={closingMethodById[item.id] ?? 'escrow_com'}
                    onChange={(event) =>
                      setClosingMethodById((current) => ({
                        ...current,
                        [item.id]: event.target.value as ClosingMethod,
                      }))
                    }
                  >
                    <option value="escrow_com">Escrow.com</option>
                    <option value="sedo_transfer">Sedo transfer</option>
                    <option value="afternic_network">Afternic network</option>
                    <option value="stripe_invoice_manual_transfer">Stripe invoice</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const response = await createDealFromInquiry(item.id, closingMethodById[item.id] ?? 'escrow_com')
                        setActionMessage(`Deal ${response.dealId} created from inquiry ${item.id}.`)
                      } catch (err) {
                        setActionMessage(err instanceof Error ? err.message : 'Kon geen deal aanmaken.')
                      }
                    }}
                    className="rounded-lg bg-emerald-900 px-4 py-2 text-sm text-white"
                  >
                    Create deal
                  </button>
                  {item.domainName ? (
                    <Link className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-900 hover:bg-slate-50" to="/admin/deals">
                      Open deals
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {actionMessage ? (
        <SectionCard title="Last action" subtitle="Result of the most recent inbox action.">
          {actionMessage}
        </SectionCard>
      ) : null}
    </div>
  )
}
