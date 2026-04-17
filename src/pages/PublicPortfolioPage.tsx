import { useMemo, useState } from 'react'
import { ArrowRight, Search, SlidersHorizontal } from 'lucide-react'
import { Link, useLoaderData } from 'react-router-dom'
import { buildPortfolioExcerpt } from '@/lib/domain-page-content'
import { formatCurrency } from '@/lib/formatters'
import { usePageMeta } from '@/lib/page-meta'
import type { PublicPortfolioDomainRecord } from '@/types/domain'

interface PublicPortfolioLoaderData {
  items: PublicPortfolioDomainRecord[]
}

type LanguageFilter = 'all' | 'NL' | 'EN'
type SellModeFilter = 'all' | 'afternic_lander' | 'sedo_lander' | 'portfolio_redirect'

export function PublicPortfolioPage() {
  const { items } = useLoaderData() as PublicPortfolioLoaderData
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [language, setLanguage] = useState<LanguageFilter>('all')
  const [sellMode, setSellMode] = useState<SellModeFilter>('all')

  usePageMeta(
    'Domeinnamen te koop | Premium .nl en .com domeinen',
    'Bekijk beschikbare .nl en .com domeinnamen voor directe overname. Filter op categorie, bekijk de vraagprijs en neem contact op met de eigenaar.',
  )

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(),
    [items],
  )

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      if (query && !item.domainName.toLowerCase().includes(query)) return false
      if (category !== 'all' && item.category !== category) return false
      if (language !== 'all' && item.language !== language) return false
      if (sellMode !== 'all' && item.sellMode !== sellMode) return false
      return true
    })
  }, [items, search, category, language, sellMode])

  const averageTargetPrice =
    filteredItems.length > 0
      ? formatCurrency(
          Math.round(filteredItems.reduce((sum, item) => sum + item.targetPrice, 0) / filteredItems.length),
        )
      : 'n.v.t.'

  const filtersActive =
    search.trim().length > 0 || category !== 'all' || language !== 'all' || sellMode !== 'all'

  function resetFilters() {
    setSearch('')
    setCategory('all')
    setLanguage('all')
    setSellMode('all')
  }

  return (
    <div className="space-y-8">
      <section
        className="overflow-hidden rounded-[32px] p-6 md:p-8"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.94), rgba(255,255,255,0.72))',
          border: '1px solid var(--color-border-soft)',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Beschikbaar portfolio
            </p>
            <h1
              className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl"
              style={{ color: 'var(--color-text)' }}
            >
              Domeinnamen met directe commerciële helderheid, gepresenteerd voor serieuze kopers.
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-7" style={{ color: 'var(--color-text-secondary)' }}>
              Bekijk de publiek zichtbare namen, filter op categorie of taal en open per domein een eigen landingspagina
              met prijsrichting en aanvraagformulier.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Publiek zichtbaar" value={String(filteredItems.length)} />
            <MetricCard label="Gemiddelde richtprijs" value={averageTargetPrice} />
            <MetricCard label="Afhandeling" value="Direct contact" />
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyPanel message="Er staan nog geen publiek zichtbare domeinen klaar. Zet een domein op listed of inbound_only met portfolio_redirect om het hier te tonen." />
      ) : (
        <>
          <section
            className="rounded-[28px] p-5 md:p-6"
            style={{
              backgroundColor: 'rgba(255,255,255,0.88)',
              border: '1px solid var(--color-border-soft)',
              boxShadow: '0 12px 40px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div className="mb-5 flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>
              <SlidersHorizontal className="h-4 w-4" />
              Filter en verken publieke domeinen
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="block text-[12px] uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-secondary)' }}>
                  Zoek domein
                </span>
                <div
                  className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                  <Search className="h-4 w-4" style={{ color: 'var(--color-text-secondary)' }} />
                  <input
                    className="w-full bg-transparent outline-none"
                    placeholder="Bijv. greenbatteryhub.com"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </label>

              <FilterSelect label="Categorie" value={category} onChange={setCategory}>
                <option value="all">Alle categorieen</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect label="Taal" value={language} onChange={(value) => setLanguage(value as LanguageFilter)}>
                <option value="all">Alle talen</option>
                <option value="NL">NL</option>
                <option value="EN">EN</option>
              </FilterSelect>

              <FilterSelect
                label="Verkooproute"
                value={sellMode}
                onChange={(value) => setSellMode(value as SellModeFilter)}
              >
                <option value="all">Alle routes</option>
                <option value="portfolio_redirect">Portfolio redirect</option>
                <option value="afternic_lander">Afternic lander</option>
                <option value="sedo_lander">Sedo lander</option>
              </FilterSelect>
            </div>

            <div
              className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
              style={{ borderColor: 'var(--color-border-soft)' }}
            >
              <p className="text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                {filteredItems.length} van {items.length} domeinen zichtbaar
              </p>
              {filtersActive ? (
                <button
                  className="rounded-full px-4 py-2 text-[14px]"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  type="button"
                  onClick={resetFilters}
                >
                  Filters wissen
                </button>
              ) : null}
            </div>
          </section>

          {filteredItems.length === 0 ? (
            <EmptyPanel message="Geen domeinen gevonden met deze filters. Wis de filters of probeer een andere zoekterm." />
          ) : (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((domain) => (
                <article
                  key={domain.id}
                  className="flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-[28px] p-5"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    border: '1px solid var(--color-border-soft)',
                    boxShadow: '0 14px 42px rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {domain.category}
                        </p>
                        <h2
                          className="mt-3 break-words text-[30px] font-semibold tracking-tight"
                          style={{ color: 'var(--color-text)', overflowWrap: 'anywhere' }}
                        >
                          {domain.domainName}
                        </h2>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-[11px] font-medium uppercase"
                        style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent-text)' }}
                      >
                        {domain.language}
                      </span>
                    </div>

                    <p className="mt-4 text-[14px] leading-6" style={{ color: 'var(--color-text-secondary)' }}>
                      {buildPortfolioExcerpt(
                        domain,
                        domain.heroSubheadline ? { heroSubheadline: domain.heroSubheadline } : null,
                      )}
                    </p>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div
                      className="rounded-2xl p-4"
                      style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border-soft)' }}
                    >
                      <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-secondary)' }}>
                        Richtprijs
                      </p>
                      <p className="mt-2 text-[28px] font-semibold" style={{ color: 'var(--color-text)' }}>
                        {formatCurrency(domain.targetPrice)}
                      </p>
                      <p className="mt-2 text-[12px] leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                        Indicatieve vraagprijs voor directe overname of serieuze onderhandeling.
                      </p>
                    </div>

                    <Link
                      className="flex items-center justify-between rounded-full px-4 py-3 text-[14px] text-white"
                      style={{ backgroundColor: 'var(--color-text)', color: '#ffffff' }}
                      to={`/d/${domain.slug}`}
                    >
                      <span>Bekijk domein</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[24px] p-4"
      style={{ backgroundColor: 'rgba(255,255,255,0.82)', border: '1px solid var(--color-border-soft)' }}
    >
      <dt className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </dt>
      <dd className="mt-2 text-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>
        {value}
      </dd>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="space-y-2">
      <span className="block text-[12px] uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <select
        className="w-full rounded-2xl px-4 py-3"
        style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <section
      className="rounded-[28px] px-6 py-8 text-[15px]"
      style={{
        border: '1px dashed var(--color-border)',
        backgroundColor: 'rgba(255,255,255,0.72)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {message}
    </section>
  )
}
