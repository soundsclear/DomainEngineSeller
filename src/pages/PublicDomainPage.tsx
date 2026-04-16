import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Link, useLoaderData } from 'react-router-dom'
import { submitInquiry } from '@/lib/api'
import { resolveDomainPageContent } from '@/lib/domain-page-content'
import { formatCurrency } from '@/lib/formatters'
import { usePageMeta } from '@/lib/page-meta'
import type { PublicDomainRecord } from '@/types/domain'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

export function PublicDomainPage() {
  const publicDomain = useLoaderData() as PublicDomainRecord
  const domain = publicDomain.domain
  const content = resolveDomainPageContent(domain, publicDomain.content)
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)
  const [turnstileReady, setTurnstileReady] = useState(false)
  const [form, setForm] = useState({
    senderName: '',
    senderEmail: '',
    offerAmount: '',
    message: '',
    cfTurnstileToken: '',
  })
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  usePageMeta(content.seoTitle, content.metaDescription)

  useEffect(() => {
    let active = true

    fetch('/api/public/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load public config.')
        return (await response.json()) as { turnstileSiteKey: string | null }
      })
      .then((data) => {
        if (active) setTurnstileSiteKey(data.turnstileSiteKey)
      })
      .catch(() => {
        if (active) setTurnstileSiteKey(null)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!turnstileSiteKey) return
    const resolvedSiteKey = turnstileSiteKey

    const scriptId = 'cf-turnstile-script'

    function renderWidget() {
      if (!turnstileContainerRef.current || !window.turnstile || turnstileWidgetId.current) return

      turnstileWidgetId.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: resolvedSiteKey,
        callback: (token) => {
          setForm((current) => ({ ...current, cfTurnstileToken: token }))
          setTurnstileReady(true)
        },
        'expired-callback': () => {
          setForm((current) => ({ ...current, cfTurnstileToken: '' }))
          setTurnstileReady(false)
        },
        'error-callback': () => {
          setForm((current) => ({ ...current, cfTurnstileToken: '' }))
          setTurnstileReady(false)
        },
      })
    }

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!existing) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.addEventListener('load', renderWidget)
      document.head.appendChild(script)
    } else if (window.turnstile) {
      renderWidget()
    } else {
      existing.addEventListener('load', renderWidget)
    }

    return () => {
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.remove(turnstileWidgetId.current)
        turnstileWidgetId.current = null
      }
    }
  }, [turnstileSiteKey])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitState('submitting')
    setSubmitMessage(null)

    try {
      const response = await submitInquiry({
        domainId: domain.id,
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        offerAmount: form.offerAmount ? Number(form.offerAmount) : undefined,
        message: form.message,
        cfTurnstileToken: form.cfTurnstileToken || undefined,
      })

      setSubmitState('success')
      setSubmitMessage(`${response.message} Je aanvraag is direct aan de verkoopflow gekoppeld.`)
      setForm({
        senderName: '',
        senderEmail: '',
        offerAmount: '',
        message: '',
        cfTurnstileToken: '',
      })
      setTurnstileReady(false)

      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current)
      }
    } catch (error) {
      setSubmitState('error')
      setSubmitMessage(error instanceof Error ? error.message : 'Kon je aanvraag niet versturen.')
    }
  }

  return (
    <div className="space-y-8">
      <Link
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px]"
        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              to="/"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar portfolio
      </Link>

      <section
        className="overflow-hidden rounded-[32px] p-6 md:p-8"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.94), rgba(255,255,255,0.72))',
          border: '1px solid var(--color-border-soft)',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div className="grid gap-8 xl:grid-cols-[1.18fr_0.82fr] xl:items-center">
          <div>
            <div
              className="inline-flex rounded-full px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em]"
              style={{
                backgroundColor: 'var(--color-accent-light)',
                color: 'var(--color-accent-text)',
              }}
            >
              Dit domein is te koop
            </div>
            <p
              className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {domain.category}
            </p>
            <h1
              className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl"
              style={{ color: 'var(--color-text)', lineHeight: 1.03 }}
            >
              {content.heroHeadline}
            </h1>
            <p className="mt-5 max-w-3xl text-[18px] leading-8" style={{ color: 'var(--color-text-secondary)' }}>
              {content.heroSubheadline}
            </p>
          </div>

          <div
            className="rounded-[28px] p-5"
            style={{
              backgroundColor: 'rgba(245,245,247,0.78)',
              border: '1px solid var(--color-border-soft)',
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>
              Vraagprijs
            </p>
            <p className="mt-3 text-[40px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {formatCurrency(domain.targetPrice)}
            </p>
            <p className="mt-3 text-[14px] leading-6" style={{ color: 'var(--color-text-secondary)' }}>
              Indicatieve vraagprijs voor directe overname of serieuze onderhandeling.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Status" value="Beschikbaar" compact />
              <MetricCard label="Afhandeling" value="Direct contact" compact />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <section
          className="rounded-[28px] p-6"
          style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            border: '1px solid var(--color-border-soft)',
            boxShadow: '0 14px 42px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div className="space-y-5 text-[16px] leading-8" style={{ color: 'var(--color-text-secondary)' }}>
            {content.bodyContent.split(/\n\n+/).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <InfoCard label="Domeinnaam" value={domain.domainName} />
            <InfoCard label="Taal" value={domain.language} />
            <InfoCard label="Categorie" value={domain.category} />
            <InfoCard label="Verkooproute" value={domain.sellMode.replaceAll('_', ' ')} />
          </div>
        </section>

        <aside
          className="rounded-[28px] p-6"
          style={{
            backgroundColor: 'rgba(255,255,255,0.92)',
            border: '1px solid var(--color-border-soft)',
            boxShadow: '0 14px 42px rgba(15, 23, 42, 0.06)',
          }}
        >
          <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            Vraag informatie aan of doe een bod
          </h2>
          <p className="mt-3 text-[14px] leading-7" style={{ color: 'var(--color-text-secondary)' }}>
            Deel je gebruiksscenario, planning en indicatieve bieding. Je aanvraag komt direct in de inquiry-flow terecht
            voor snelle opvolging.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Field label="Naam">
              <input
                className="w-full rounded-2xl px-4 py-3"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                placeholder="Je naam"
                required
                value={form.senderName}
                onChange={(event) => setForm((current) => ({ ...current, senderName: event.target.value }))}
              />
            </Field>

            <Field label="E-mail">
              <input
                className="w-full rounded-2xl px-4 py-3"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                placeholder="jij@bedrijf.nl"
                required
                type="email"
                value={form.senderEmail}
                onChange={(event) => setForm((current) => ({ ...current, senderEmail: event.target.value }))}
              />
            </Field>

            <Field label="Indicatief bod">
              <input
                className="w-full rounded-2xl px-4 py-3"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                inputMode="numeric"
                placeholder="Bijvoorbeeld 5000"
                value={form.offerAmount}
                onChange={(event) => setForm((current) => ({ ...current, offerAmount: event.target.value }))}
              />
            </Field>

            <Field label="Bericht">
              <textarea
                className="min-h-36 w-full rounded-2xl px-4 py-3"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                placeholder="Vertel waarvoor je het domein wilt inzetten en wanneer je wilt schakelen."
                required
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              />
            </Field>

            <div
              className="rounded-[24px] p-4"
              style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border-soft)' }}
            >
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5" style={{ color: 'var(--color-accent)' }} />
                <div>
                  <p className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                    Turnstile / CAPTCHA
                  </p>
                  <p className="mt-1 text-[13px] leading-6" style={{ color: 'var(--color-text-secondary)' }}>
                    Anti-spam bescherming voor publieke aanvragen. Zonder geldige verificatie wordt het formulier niet verwerkt.
                  </p>
                </div>
              </div>

              {turnstileSiteKey ? (
                <div
                  className="mt-4 rounded-2xl px-4 py-3"
                  style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                  <div ref={turnstileContainerRef} />
                  <p className="mt-2 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {turnstileReady ? 'Verificatie ontvangen.' : 'Voltooi de verificatie om je aanvraag te versturen.'}
                  </p>
                </div>
              ) : (
                <div
                  className="mt-4 rounded-2xl px-4 py-3"
                  style={{ border: '1px dashed var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                  <p className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                    CAPTCHA nog niet geconfigureerd
                  </p>
                  <p className="mt-1 text-[12px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                    Voeg een `TURNSTILE_SITE_KEY` toe in settings om de widget op publieke domeinpagina&apos;s te tonen.
                  </p>
                </div>
              )}
            </div>

            {submitMessage ? (
              <p style={{ color: submitState === 'success' ? 'var(--color-accent-text)' : 'var(--color-destructive)' }}>
                {submitMessage}
              </p>
            ) : null}

            <button
              className="w-full rounded-full px-5 py-3 text-[14px] text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-text)', color: '#ffffff' }}
              disabled={submitState === 'submitting' || (turnstileSiteKey !== null && !turnstileReady)}
              type="submit"
            >
              {submitState === 'submitting' ? 'Versturen...' : 'Verstuur aanvraag'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function MetricCard({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div
      className={compact ? 'rounded-[22px] p-4' : 'rounded-[24px] p-4'}
      style={{
        backgroundColor: compact ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.82)',
        border: '1px solid var(--color-border-soft)',
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </p>
      <p
        className="mt-2 font-semibold"
        style={{ color: 'var(--color-text)', fontSize: compact ? '18px' : '22px' }}
      >
        {value}
      </p>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[24px] p-4"
      style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border-soft)' }}
    >
      <dt className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </dt>
      <dd className="mt-2 text-[18px] font-medium" style={{ color: 'var(--color-text)' }}>
        {value}
      </dd>
    </div>
  )
}
