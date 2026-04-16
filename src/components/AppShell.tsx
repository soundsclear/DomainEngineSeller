import type { PropsWithChildren } from 'react'
import { BarChart3, BadgeEuro, Globe2, Inbox, Mail, Settings } from 'lucide-react'
import { clsx } from 'clsx'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3, exact: true },
  { to: '/admin/inbox', label: 'Inbox', icon: Inbox, exact: false },
  { to: '/admin/deals', label: 'Deals', icon: BadgeEuro, exact: false },
  { to: '/admin/domains', label: 'Domains', icon: Globe2, exact: false },
  { to: '/admin/leads', label: 'Leads', icon: Mail, exact: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, exact: false },
]

const pageTitles: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/inbox': 'Inbox',
  '/admin/deals': 'Deals',
  '/admin/domains': 'Domains',
  '/admin/leads': 'Leads',
  '/admin/settings': 'Settings',
  '/login': 'Sign In',
}

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  if (pathname.startsWith('/admin/inbox/')) return 'Conversation'
  if (pathname.startsWith('/admin/domains/')) return 'Domain'
  return 'Domain Seller Engine'
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()
  const title = getPageTitle(location.pathname)

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside
        className="hidden md:flex w-60 shrink-0 flex-col"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          minHeight: '100vh',
        }}
      >
        {/* App name label */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--color-border-soft)' }}>
          <p
            className="text-[11px] font-medium uppercase"
            style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.08em' }}
          >
            Domain Seller Engine
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon, exact }) => {
            const active = exact
              ? location.pathname === to
              : location.pathname === to || location.pathname.startsWith(`${to}/`)

            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-2.5 rounded-lg px-3 text-[14px] transition-colors',
                  'h-9 focus-visible:outline-2 focus-visible:outline-offset-2',
                  !active && 'text-[#1d1d1f] hover:bg-[#f5f5f7]',
                )}
                style={
                  active
                    ? { backgroundColor: 'var(--color-accent)', color: '#ffffff', outlineColor: 'var(--color-accent)' }
                    : { outlineColor: 'var(--color-accent)' }
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header
          className="flex items-center px-6"
          style={{
            height: '52px',
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          <h1
            className="text-[17px] font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6" style={{ backgroundColor: 'var(--color-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
