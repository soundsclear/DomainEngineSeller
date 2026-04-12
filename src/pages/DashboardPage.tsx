import { useEffect, useState } from 'react'
import { BarChart3, BadgeEuro, MailCheck, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionCard } from '@/components/SectionCard'
import { StatCard } from '@/components/StatCard'
import { fetchDashboard, type DashboardMetrics } from '@/lib/api'
import { formatCurrency } from '@/lib/formatters'

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetchDashboard()
      .then((response) => {
        if (active) {
          setMetrics(response.metrics)
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

  if (error) {
    return <SectionCard title="Dashboard" subtitle="Kon de dashboardgegevens niet laden.">{error}</SectionCard>
  }

  if (!metrics) {
    return <SectionCard title="Dashboard" subtitle="Dashboardgegevens laden...">Even geduld.</SectionCard>
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Domains" value={String(metrics.domains)} hint="Portfolio currently managed at Xel." />
        <StatCard label="Inbound inquiries" value={String(metrics.inboundInquiries)} hint="Includes contact and offer forms queued for follow-up." />
        <StatCard label="Deals in progress" value={String(metrics.dealsInProgress)} hint="Secure closing logic separated from transfer state." />
        <StatCard label="Migration candidates" value={String(metrics.migrationCandidates)} hint="Prepared for Phase 2, not auto-migrated." />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <SectionCard
          title="MVP readiness"
          subtitle="The scaffold already reflects the operational guardrails for launch under the Xel constraint."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-emerald-50 p-4">
              <div className="flex items-center gap-3 text-emerald-900">
                <BadgeEuro className="h-5 w-5" />
                <p className="font-medium">Pipeline value</p>
              </div>
              <p className="mt-3 text-2xl font-semibold">{formatCurrency(metrics.pipelineValue)}</p>
              <p className="mt-2 text-sm text-emerald-900/75">Accepted or active deals tracked independently from transfer state.</p>
            </div>
            <div className="rounded-3xl bg-amber-50 p-4">
              <div className="flex items-center gap-3 text-amber-900">
                <ShieldAlert className="h-5 w-5" />
                <p className="font-medium">Xel transfer checkpoints</p>
              </div>
              <p className="mt-3 text-2xl font-semibold">{metrics.xelTransferCheckpoints}</p>
              <p className="mt-2 text-sm text-amber-900/75">Manual checkpoints stay visible until the registrar step is fully closed.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Activity queue" subtitle="Draft-first outreach and response handling remain intentionally conservative.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="flex items-center gap-2"><MailCheck className="h-4 w-4" /> Draft outreach queue</span>
              <strong>{metrics.draftOutreachQueue}</strong>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Replies awaiting action</span>
              <strong>{metrics.repliesAwaitingAction}</strong>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span>Follow-ups due this week</span>
              <strong>{metrics.followUpsDueThisWeek}</strong>
            </div>
            <Link to="/admin/inbox" className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 hover:bg-slate-50">
              Open inbound inbox
            </Link>
          </div>
        </SectionCard>
      </section>
    </div>
  )
}
