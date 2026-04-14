import { useEffect, useRef } from 'react'
import { prepare, layout } from '@chenglou/pretext'

interface StatCardProps {
  label: string
  value: string
  hint?: string
}

export function StatCard({ label, value, hint }: StatCardProps) {
  const valueRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = valueRef.current
    if (!el) return

    let prepared: ReturnType<typeof prepare> | null = null

    async function init() {
      await document.fonts.ready
      if (!el) return
      const font = getComputedStyle(el).font
      prepared = prepare(value, font)
      relayout()
    }

    function relayout() {
      if (!prepared || !el) return
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 42
      const { height } = layout(prepared, el.clientWidth, lineHeight)
      el.style.height = `${height}px`
    }

    const observer = new ResizeObserver(relayout)
    observer.observe(el)
    void init()

    return () => observer.disconnect()
  }, [value])

  return (
    <article
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-soft)',
      }}
    >
      <p
        className="text-[11px] font-medium uppercase"
        style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.06em' }}
      >
        {label}
      </p>
      <p
        ref={valueRef}
        className="mt-2 text-[34px] font-bold leading-tight overflow-hidden"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
          {hint}
        </p>
      )}
    </article>
  )
}
