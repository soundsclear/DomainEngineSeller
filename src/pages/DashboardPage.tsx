import { useEffect, useState } from 'react'
import { BarChart3, BadgeEuro, Inbox, MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import { StatCard } from '@/components/StatCard'
import { SkeletonCard, SkeletonRow } from '@/components/Skeleton'
import { fetchDashboardMetrics, type RealDashboardMetrics } from '@/lib/api'

function DataRow({ label, value, icon: Icon }: { label: string; value: string | number; icon?: typeof MailCheck }) {
  return (
    <div
      className="flex items-center justify-between px-0 py-3 text-[14px]"
      style={{ borderBottom: '1px solid var(--color-border-soft)' }}
    >
      <span className="flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
        {Icon && <Icon className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />}
        {label}
      </span>
      <strong className="font-semibold" style={{ color: 'var(--color-text)' }}>{value}</strong>
    </div>
  )
}

function ErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-4 py-3 text-[14px]"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-soft)',
        borderLeft: '3px solid var(--color-destructive)',
      }}
    >
      <span style={{ color: 'var(--color-text)' }}>Failed to load dashboard data: {message}</span>
      <button
        onClick={onRetry}
        className="ml-4 text-[13px] font-medium hover:underline"
        style={{ color: 'var(--color-accent)' }}
      >
        Retry
      </button>
    </div>
  )
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<RealDashboardMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    setError(null)
    let active = true

    fetchDashboardMetrics()
      .then((response) => {
        if (active) {
          setMetrics(response.metrics)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { active = false }
  }

  useEffect(load, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }}>
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }}>
            {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        </section>
      </div>
    )
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={load} />
  }

  if (!metrics) return null

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Domains" value={String(metrics.totalDomains)} hint="Managed in portfolio" />
        <StatCard label="Inquiries" value={String(metrics.totalInquiries)} hint="Inbound contact and offer forms" />
        <StatCard label="Active deals" value={String(metrics.activeDeals)} hint="In negotiation or transfer" />
        <StatCard label="Leads" value={String(metrics.totalLeads)} hint="Total in outreach system" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <SectionCard title="Portfolio status">
          <DataRow label="Listed domains" value={metrics.listedDomains} icon={BadgeEuro} />
          <DataRow label="Unread inquiries" value={metrics.unreadInquiries} icon={Inbox} />
          <DataRow label="Pending outreach" value={metrics.pendingOutreach} icon={MailCheck} />
          <DataRow label="Sent outreach threads" value={metrics.sentOutreach} icon={BarChart3} />
        </SectionCard>

        <SectionCard
          title="Quick actions"
          action={
            <Link
              to="/admin/inbox"
              className="text-[13px] font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              Open inbox
            </Link>
          }
        >
          <div className="space-y-2 pt-1">
            <Link
              to="/admin/inbox"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[14px] transition-colors hover:bg-[#f5f5f7]"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="flex items-center gap-2">
                <Inbox className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
                View all inquiries
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>→</span>
            </Link>
            <Link
              to="/admin/deals"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[14px] transition-colors hover:bg-[#f5f5f7]"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="flex items-center gap-2">
                <BadgeEuro className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
                Active deals
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>→</span>
            </Link>
            <Link
              to="/admin/leads"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[14px] transition-colors hover:bg-[#f5f5f7]"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="flex items-center gap-2">
                <MailCheck className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
                Outreach leads
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>→</span>
            </Link>
          </div>
        </SectionCard>
      </section>
    </div>
  )
}
