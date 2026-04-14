import type { CSSProperties } from 'react'
import { clsx } from 'clsx'

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={clsx('animate-pulse rounded-md', className)}
      style={{ backgroundColor: 'var(--color-border-soft)', ...style }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }}
      aria-busy="true"
      aria-label="Loading..."
    >
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-9 w-16 mb-2" />
      <Skeleton className="h-3 w-40" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: '1px solid var(--color-border-soft)' }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}
