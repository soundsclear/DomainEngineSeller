import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

export function PublicShell({ children }: PropsWithChildren) {
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(5,150,105,0.08), transparent 32%), radial-gradient(circle at top right, rgba(255,255,255,0.72), transparent 24%), var(--color-bg)',
      }}
    >
      <header
        className="sticky top-0 z-20 backdrop-blur-xl"
        style={{
          backgroundColor: 'rgba(245, 245, 247, 0.78)',
          borderBottom: '1px solid var(--color-border-soft)',
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <div>
            <Link
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'var(--color-text-secondary)' }}
              to="/"
            >
              Domain Seller Engine
            </Link>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--color-text)' }}>
              Publieke domeinpresentatie voor serieuze kopers en directe aanvragen.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              className="rounded-full px-4 py-2 text-[14px] transition-colors"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'rgba(255,255,255,0.72)',
                color: 'var(--color-text)',
              }}
              to="/"
            >
              Portfolio
            </Link>
            <Link
              className="rounded-full px-4 py-2 text-[14px] text-white transition-colors"
              style={{ backgroundColor: 'var(--color-text)', color: '#ffffff' }}
              to="/admin"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">{children}</main>
    </div>
  )
}
