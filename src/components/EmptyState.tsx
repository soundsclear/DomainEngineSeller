import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <Icon
        className="h-12 w-12 mb-4"
        style={{ color: 'var(--color-border)' }}
        aria-hidden="true"
      />
      <h3 className="text-[17px] font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      <p className="text-[15px] max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
