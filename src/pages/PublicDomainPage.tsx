import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLoaderData } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
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
        if (!response.ok) {
          throw new Error('Could not load public config.')
        }

        return (await response.json()) as { turnstileSiteKey: string | null }
      })
      .then((data) => {
        if (active) {
          setTurnstileSiteKey(data.turnstileSiteKey)
        }
      })
      .catch(() => {
        if (active) {
          setTurnstileSiteKey(null)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const siteKey = turnstileSiteKey

    if (!siteKey) {
      return
    }

    const resolvedSiteKey: string = siteKey

    const scriptId = 'cf-turnstile-script'

    function renderWidget() {
      if (!turnstileContainerRef.current || !window.turnstile || turnstileWidgetId.current) {
        return
      }

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
      setSubmitMessage(`${response.message} Je bericht is direct aan het verkoopoverzicht gekoppeld.`)
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
    <div className="space-y-10">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link className="hover:text-slate-900" to="/portfolio">
          Portfolio
        </Link>
        <span>/</span>
        <span className="text-slate-700">{domain.domainName}</span>
      </div>

      <section className="grid gap-8 border-b border-slate-200 pb-8 md:grid-cols-[1.1fr_0.9fr] md:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-700">{domain.category}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{content.heroHeadline}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">{content.heroSubheadline}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Quick sale" value={formatCurrency(domain.quickSalePrice)} />
          <Metric label="Target" value={formatCurrency(domain.targetPrice)} />
          <Metric label="Aspirational" value={formatCurrency(domain.aspirationalPrice)} />
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-8">
          <article className="space-y-4 text-base leading-8 text-slate-700">
            {content.bodyContent.split(/\n\n+/).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>

          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Domeinnaam" value={domain.domainName} />
            <InfoRow label="Taal" value={domain.language} />
            <InfoRow label="Categorie" value={domain.category} />
            <InfoRow label="Verkooproute" value={domain.sellMode.replaceAll('_', ' ')} />
          </dl>
        </section>

        <aside className="border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Vraag informatie aan of doe een bod</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Deel je gebruiksscenario, planning en eventuele bieding. Je aanvraag komt direct in de bestaande inquiry-flow
            terecht en wordt per mail gemeld.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Naam</span>
              <input
                className="w-full rounded-md border border-slate-300 px-4 py-3"
                placeholder="Je naam"
                required
                value={form.senderName}
                onChange={(event) => setForm((current) => ({ ...current, senderName: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">E-mail</span>
              <input
                className="w-full rounded-md border border-slate-300 px-4 py-3"
                placeholder="jij@bedrijf.nl"
                required
                type="email"
                value={form.senderEmail}
                onChange={(event) => setForm((current) => ({ ...current, senderEmail: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Indicatief bod</span>
              <input
                className="w-full rounded-md border border-slate-300 px-4 py-3"
                inputMode="numeric"
                placeholder="Bijvoorbeeld 5000"
                value={form.offerAmount}
                onChange={(event) => setForm((current) => ({ ...current, offerAmount: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Bericht</span>
              <textarea
                className="min-h-36 w-full rounded-md border border-slate-300 px-4 py-3"
                placeholder="Vertel waarvoor je het domein wilt inzetten en wanneer je wilt schakelen."
                required
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Turnstile / CAPTCHA</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Anti-spam bescherming voor publieke inquiries. Zonder geldige verificatie wordt het formulier niet
                    verwerkt.
                  </p>
                </div>
              </div>
              {turnstileSiteKey ? (
                <div className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-3">
                  <div ref={turnstileContainerRef} />
                  <p className="mt-2 text-xs text-slate-500">
                    {turnstileReady
                      ? 'Verificatie ontvangen.'
                      : 'Voltooi de verificatie om je aanvraag te versturen.'}
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">CAPTCHA nog niet geconfigureerd</p>
                  <p className="text-xs leading-5 text-slate-500">
                    Voeg een `TURNSTILE_SITE_KEY` toe in settings om de widget op publieke domeinpagina&apos;s te tonen.
                  </p>
                </div>
              )}
            </div>
            {submitMessage ? (
              <p className={submitState === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-700'}>
                {submitMessage}
              </p>
            ) : null}
            <button
              className="w-full rounded-md bg-emerald-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 text-lg font-medium text-slate-950">{value}</dd>
    </div>
  )
}
