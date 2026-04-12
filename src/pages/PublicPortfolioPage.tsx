import { Link, useLoaderData } from 'react-router-dom'
import { buildPortfolioExcerpt } from '@/lib/domain-page-content'
import { formatCurrency } from '@/lib/formatters'
import { usePageMeta } from '@/lib/page-meta'
import type { PublicPortfolioDomainRecord } from '@/types/domain'

interface PublicPortfolioLoaderData {
  items: PublicPortfolioDomainRecord[]
}

export function PublicPortfolioPage() {
  const { items } = useLoaderData() as PublicPortfolioLoaderData
  usePageMeta(
    'Domeinportfolio | Domain Seller Engine',
    'Bekijk beschikbare domeinnamen, prijsrichting en directe contactmogelijkheden voor serieuze kopers.',
  )

  return (
    <div className="space-y-10">
      <section className="grid gap-6 border-b border-slate-200 pb-8 md:grid-cols-[1.1fr_0.9fr] md:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-700">Beschikbaar portfolio</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950">
            Heldere domeinnamen voor bedrijven die direct beter gevonden en onthouden willen worden.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Elk domein hieronder heeft een eigen verkoopspagina met aanvraagformulier. Interesse in een naam, campagne,
            merkuitbreiding of SEO-landingsroute? Open het domein en deel je plan.
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Metric label="Publiek zichtbaar" value={String(items.length)} />
          <Metric
            label="Gemiddelde richtprijs"
            value={items.length > 0 ? formatCurrency(Math.round(items.reduce((sum, item) => sum + item.targetPrice, 0) / items.length)) : 'n.v.t.'}
          />
          <Metric label="Aanpak" value="Direct contact" />
        </dl>
      </section>

      {items.length === 0 ? (
        <section className="border border-dashed border-slate-300 bg-white px-6 py-8 text-slate-600">
          Er staan nog geen publiek zichtbare domeinen klaar. Zet een domein op <span className="font-medium">listed</span>{' '}
          met <span className="font-medium">portfolio_redirect</span> om het hier te tonen.
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((domain) => (
            <article key={domain.id} className="flex h-full flex-col justify-between border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">{domain.category}</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{domain.domainName}</h2>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium uppercase text-slate-700">
                    {domain.language}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {buildPortfolioExcerpt(domain, domain.heroSubheadline ? { heroSubheadline: domain.heroSubheadline } : null)}
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Richtprijs</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(domain.targetPrice)}</p>
                  </div>
                  <Link className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800" to={`/d/${domain.slug}`}>
                    Bekijk domein
                  </Link>
                </div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Quick sale {formatCurrency(domain.quickSalePrice)} · Aspirational {formatCurrency(domain.aspirationalPrice)}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-xl font-semibold text-slate-950">{value}</dd>
    </div>
  )
}
