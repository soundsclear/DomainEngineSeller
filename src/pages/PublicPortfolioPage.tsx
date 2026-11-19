import { useState } from 'react'
import { ArrowDown, ArrowUpRight, Search } from 'lucide-react'
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
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [language, setLanguage] = useState('')

  usePageMeta(
    'Domeinnamen te koop | Domain Lane',
    'Ontdek beschikbare domeinnamen bij Domain Lane. Bekijk de richtprijs en doe een bod voor directe overname.',
  )

  const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort()
  const languages = Array.from(new Set(items.map((item) => item.language.toUpperCase()).filter(Boolean))).sort()
  const query = search.trim().toLowerCase()
  const filteredItems = items.filter((item) =>
    item.domainName.toLowerCase().includes(query) &&
    (!category || item.category === category) &&
    (!language || item.language.toUpperCase() === language),
  )

  function resetFilters() {
    setSearch('')
    setCategory('')
    setLanguage('')
  }

  return (
    <>
      <section className="store-hero">
        <div className="store-frame store-hero-inner">
          <div className="store-hero-copy">
            <p className="store-kicker">Domeinnamen te koop</p>
            <h1>Een sterke naam.<br /><em>Een eigen adres.</em></h1>
            <p>Vind een domeinnaam voor je bedrijf, merk of volgende project. Bekijk de richtprijs en doe rechtstreeks een bod.</p>
            <a className="store-button store-button-gold" href="#domeinen">
              Bekijk de collectie <ArrowDown size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="store-orbit" aria-hidden="true"><span /><i /><b /></div>
        </div>
      </section>

      <section className="store-frame store-collection" id="domeinen" aria-labelledby="collection-title">
        <div className="store-collection-heading">
          <h2 id="collection-title">De collectie</h2>
          <p aria-live="polite">{filteredItems.length} {filteredItems.length === 1 ? 'domein' : 'domeinen'}</p>
        </div>

        {items.length > 0 && (
          <div className="store-filters">
            <label className="store-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" aria-label="Zoek een domeinnaam" placeholder="Zoek een domeinnaam" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            {categories.length > 1 && (
              <select aria-label="Categorie" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Alle categorieën</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
            {languages.length > 1 && (
              <select aria-label="Taal" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="">Alle talen</option>
                {languages.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
            {(search || category || language) && <button type="button" onClick={resetFilters}>Wis filters</button>}
          </div>
        )}

        {filteredItems.length > 0 ? (
          <div className="store-grid">
            {filteredItems.map((domain) => (
              <article className="store-domain-card" key={domain.id}>
                <Link className="store-domain-link" to={`/d/${domain.slug}`} aria-label={`Bekijk ${domain.domainName}, richtprijs ${formatCurrency(domain.targetPrice)}`}>
                  <div className="store-card-top">
                    <p className="store-kicker">{domain.category}</p>
                    <span className="store-card-arrow"><ArrowUpRight size={20} aria-hidden="true" /></span>
                  </div>
                  <h3 className={domain.domainName.length > 24 ? 'store-long-name' : undefined}>{domain.domainName}</h3>
                  <p className="store-excerpt">{buildPortfolioExcerpt(domain, domain.heroSubheadline ? { heroSubheadline: domain.heroSubheadline } : null)}</p>
                  <div className="store-card-price">
                    <span>Richtprijs</span>
                    <strong>{formatCurrency(domain.targetPrice)}</strong>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="store-empty">
            {items.length === 0 ? 'Er staan momenteel geen domeinen te koop.' : 'Geen domeinen gevonden. Pas je zoekopdracht of filters aan.'}
          </p>
        )}
      </section>
    </>
  )
}
