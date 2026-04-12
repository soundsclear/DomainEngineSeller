import type { PropsWithChildren } from 'react'
import { ArrowRightLeft, BadgeEuro, Gauge, Globe2, Inbox, Mail, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/admin/inbox', label: 'Inbox', icon: Inbox },
  { to: '/admin/deals', label: 'Deals', icon: BadgeEuro },
  { to: '/admin/domains', label: 'Domains', icon: Globe2 },
  { to: '/admin/leads', label: 'Leads', icon: Mail },
  { to: '/portfolio', label: 'Public site', icon: ShieldCheck },
]

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()

  return (
    <div className="min-h-screen text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-5 md:px-6">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_80px_rgba(73,86,62,0.12)] backdrop-blur md:block">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">Domain Seller Engine</p>
          <h1 className="mt-3 text-2xl font-semibold">Sell first. Automate carefully.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Phase 1 stays Xel-compatible, keeps outreach draft-first, and prepares secure closings without forcing
            risky automation.
          </p>

          <nav className="mt-8 space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to || location.pathname.startsWith(`${to}/`)

              return (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
                    active ? 'bg-emerald-900 text-white' : 'text-slate-700 hover:bg-emerald-50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-10 rounded-3xl bg-slate-950 p-4 text-sm text-slate-100">
            <p className="font-medium">Registrar migration runway</p>
            <p className="mt-2 text-slate-300">
              Keep the adapter contract stable so Dynadot and Openprovider can land later without reworking deal
              flows.
            </p>
          </div>
        </aside>

        <main className="flex-1 rounded-[32px] border border-white/50 bg-[#fcfaf4]/90 p-4 shadow-[0_24px_100px_rgba(73,86,62,0.15)] backdrop-blur md:p-6">
          <header className="mb-6 flex flex-col gap-3 rounded-[28px] border border-emerald-100 bg-white/70 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">Operations cockpit</p>
              <h2 className="mt-2 text-3xl font-semibold">Phase 1 MVP foundation</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
              <ArrowRightLeft className="h-4 w-4" />
              Xel-first, escrow-first, draft-first
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  )
}
