import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        navigate('/admin')
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Login mislukt.')
      }
    } catch {
      setError('Netwerkfout. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 32, borderRadius: 24, backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }}>
        <p style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--color-accent-text)' }}>Domain Seller Engine</p>
        <h1 style={{ marginTop: 12, fontSize: 28, fontWeight: 600, color: 'var(--color-text)' }}>Inloggen</h1>
        <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }}
          />
          {error ? <p style={{ fontSize: 13, color: 'var(--color-destructive)' }}>{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '12px 16px', borderRadius: 12, backgroundColor: 'var(--color-accent)', color: '#fff', fontWeight: 500, fontSize: 14, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Bezig...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
