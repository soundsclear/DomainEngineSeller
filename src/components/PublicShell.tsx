import type { PropsWithChildren } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import './public-storefront.css'

export function PublicShell({ children }: PropsWithChildren) {
  return (
    <div className="storefront">
      <a className="store-skip" href="#store-main">Naar inhoud</a>
      <header className="store-header">
        <div className="store-frame store-header-inner">
          <Link className="store-brand" to="/portfolio">Domain Lane<span>.</span></Link>
          <nav aria-label="Hoofdnavigatie">
            <Link className="store-nav-link" to="/portfolio">Domeinen <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>
      <main id="store-main" tabIndex={-1}>{children}</main>
      <footer className="store-footer">
        <div className="store-frame store-footer-inner">
          <Link className="store-brand" to="/portfolio">Domain Lane<span>.</span></Link>
          <Link className="store-nav-link" to="/admin">Beheer</Link>
        </div>
      </footer>
    </div>
  )
}
