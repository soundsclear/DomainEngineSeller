import type { PropsWithChildren, ReactNode } from 'react'

interface SectionCardProps extends PropsWithChildren {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function SectionCard({ title, subtitle, action, children }: SectionCardProps) {
  return (
    <section
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-soft)',
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[17px] font-semibold" style={{ color: 'var(--color-text)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
