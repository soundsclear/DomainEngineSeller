import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

export function PublicShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[#f5f0e6] text-slate-950">
      <header className="border-b border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <Link className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800" to="/portfolio">
              Domain Seller Engine
            </Link>
            <p className="mt-1 text-sm text-slate-600">Domeinportfolio voor directe aanvragen en serieuze biedingen.</p>
          </div>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" to="/">
            Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  )
}
