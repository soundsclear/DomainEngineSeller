import type { PropsWithChildren } from 'react'

interface SectionCardProps extends PropsWithChildren {
  title: string
  subtitle?: string
}

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}
