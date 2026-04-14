import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const variantConfig: Record<ToastVariant, { icon: typeof CheckCircle; iconColor: string }> = {
  success: { icon: CheckCircle, iconColor: '#34c759' },
  error: { icon: AlertCircle, iconColor: '#ff3b30' },
  info: { icon: Info, iconColor: '#0071e3' },
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const { icon: Icon, iconColor } = variantConfig[toast.variant]

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-soft)',
        minWidth: '280px',
        maxWidth: '400px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} aria-hidden="true" />
      <p className="flex-1 text-[14px]" style={{ color: 'var(--color-text)' }}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-1 transition-colors hover:bg-[#f5f5f7]"
        aria-label="Dismiss notification"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
