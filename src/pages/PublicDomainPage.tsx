import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
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
          size?: 'normal' | 'compact'
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
        size: turnstileContainerRef.current.clientWidth < 300 ? 'compact' : 'normal',
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
      setSubmitMessage(response.message)
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
    <>
      <section className="store-hero store-detail-hero">
        <div className="store-frame">
          <Link className="store-back" to="/portfolio"><ArrowLeft size={16} aria-hidden="true" /> Alle domeinen</Link>
          <div className="store-detail-intro">
            <div>
              <p className="store-kicker">{domain.category} <span aria-hidden="true">/</span> Te koop</p>
              <h1 className={domain.domainName.length > 24 ? 'store-long-name' : undefined}>{domain.domainName}</h1>
              <p className="store-detail-lead">{content.heroSubheadline}</p>
            </div>
            <div className="store-detail-price">
              <p className="store-kicker">Richtprijs</p>
              <p className="store-asking">{formatCurrency(domain.targetPrice)}</p>
              <a className="store-button store-button-gold" href="#aanvraag">
                Doe een bod <ArrowDown size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="store-frame store-detail-content">
        <section className="store-form-panel" id="aanvraag" aria-labelledby="inquiry-title">
          <h2 id="inquiry-title">Doe een bod</h2>
          <p>Je kunt ook een vraag stellen. Laat het bodveld dan leeg.</p>

          <form aria-busy={submitState === 'submitting'} onSubmit={handleSubmit}>
            <div className="store-contact-fields">
              <label>
                Naam
                <input autoComplete="name" name="name" required value={form.senderName}
                  onChange={(event) => setForm((current) => ({ ...current, senderName: event.target.value }))} />
              </label>
              <label>
                E-mailadres
                <input autoComplete="email" name="email" required type="email" value={form.senderEmail}
                  onChange={(event) => setForm((current) => ({ ...current, senderEmail: event.target.value }))} />
              </label>
            </div>

            <label>
              Je bod in euro’s <span>(optioneel)</span>
              <input inputMode="numeric" name="offer" value={form.offerAmount}
                onChange={(event) => setForm((current) => ({ ...current, offerAmount: event.target.value }))} />
            </label>

            <label>
              Bericht
              <textarea name="message" required rows={4} value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
            </label>

            {turnstileSiteKey && (
              <div className="store-verification">
                <div ref={turnstileContainerRef} />
                <p>{turnstileReady ? 'Verificatie voltooid.' : 'Voltooi de verificatie om je aanvraag te versturen.'}</p>
              </div>
            )}

            {submitMessage && (
              <p className={submitState === 'error' ? 'store-form-error' : 'store-form-success'} role={submitState === 'error' ? 'alert' : 'status'}>
                {submitMessage}
              </p>
            )}

            <button className="store-button store-button-dark"
              disabled={submitState === 'submitting' || (turnstileSiteKey !== null && !turnstileReady)}
              type="submit">
              {submitState === 'submitting' ? 'Bezig met versturen…' : 'Verstuur aanvraag'}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        </section>

        <section className="store-detail-story" aria-labelledby="domain-about">
          <h2 id="domain-about">Over dit domein</h2>
          {content.bodyContent.split(/\n\n+/).filter(Boolean).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      </div>
    </>
  )
}
