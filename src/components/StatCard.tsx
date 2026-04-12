interface StatCardProps {
  label: string
  value: string
  hint: string
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <article className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </article>
  )
}
