import { useEffect, useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { SectionCard } from '@/components/SectionCard'
import { SkeletonRow } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { createDealFromInquiry, fetchInboundInquiries, type InboundInquiryRecord } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'
import type { ClosingMethod } from '@/types/domain'

const CLASSIFICATION_LABELS: Record<string, string> = {
  serious_offer: 'Serious offer',
  info_request: 'Info request',
  lowball: 'Lowball',
  spam: 'Spam',
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  serious_offer: 'bg-emerald-100 text-emerald-800',
  info_request: 'bg-blue-100 text-blue-800',
  lowball: 'bg-yellow-100 text-yellow-800',
  spam: 'bg-red-100 text-red-800',
}

type InquiryFilter = 'all' | 'offer' | 'contact'

export function InboxPage() {
  const [items, setItems] = useState<InboundInquiryRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<InquiryFilter>('all')
  const [closingMethodById, setClosingMethodById] = useState<Record<string, ClosingMethod>>({})
  const toast = useToast()

  function load() {
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
  }

  useEffect(load, [])

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((item) => item.inquiryType === filter)
  }, [filter, items])

  if (!loaded) {
    return (
      <SectionCard title="Inbound inbox">
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
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
        <span style={{ color: 'var(--color-text)' }}>Failed to load inbox: {error}</span>
        <button onClick={load} className="ml-4 text-[13px] font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>Retry</button>
      </div>
    )
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
              className="rounded-lg px-4 py-2 text-[14px] transition-colors"
              style={
                filter === value
                  ? { backgroundColor: 'var(--color-accent)', color: '#ffffff' }
                  : { border: '1px solid var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }
              }
            >
              {value === 'all' ? 'All' : value === 'offer' ? 'Offers' : 'Contacts'}
            </button>
          ))}
        </div>
      </SectionCard>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No inquiries"
          description="Nieuwe inbound berichten verschijnen hier automatisch."
        />
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="rounded-xl p-5"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--color-accent-text)' }}>
                      {item.inquiryType === 'offer' ? 'Offer' : 'Contact'}
                    </p>
                    {item.status === 'new' ? (
                      <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: 'var(--color-text)' }}>Nieuw</span>
                    ) : null}
                    {item.classification ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_COLORS[item.classification] ?? 'bg-slate-100 text-slate-700'}`}>
                        {CLASSIFICATION_LABELS[item.classification] ?? item.classification}
                      </span>
                    ) : null}
                  </div>
                  <Link to={`/admin/inbox/${item.id}`}>
                    <h2 className="mt-2 text-xl font-semibold hover:underline" style={{ color: 'var(--color-text)' }}>
                      {item.senderName ?? item.senderEmail}
                    </h2>
                  </Link>
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{item.senderEmail}</p>
                </div>
                <div className="text-right">
                  {item.offerAmount ? (
                    <p className="text-lg font-medium" style={{ color: 'var(--color-text)' }}>{formatCurrency(item.offerAmount)}</p>
                  ) : null}
                  <p className="mt-1 text-xs uppercase" style={{ color: 'var(--color-text-secondary)' }}>
                    {new Date(item.createdAt).toLocaleString('nl-NL')}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>{item.message}</p>

              <div
                className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4"
                style={{ borderTop: '1px solid var(--color-border-soft)' }}
              >
                <div className="text-sm">
                  <span className="font-medium" style={{ color: 'var(--color-text)' }}>{item.domainName ?? 'Unknown domain'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg px-3 py-2 text-[14px]"
                    style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
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
                        toast.show(`Deal ${response.dealId} created.`, 'success')
                      } catch (err) {
                        toast.show(err instanceof Error ? err.message : 'Kon geen deal aanmaken.', 'error')
                      }
                    }}
                    className="rounded-lg px-4 py-2 text-[14px] text-white"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  >
                    Create deal
                  </button>
                  {item.domainName ? (
                    <Link
                      className="rounded-lg px-4 py-2 text-[14px] hover:bg-[#f5f5f7]"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      to="/admin/deals"
                    >
                      Open deals
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
