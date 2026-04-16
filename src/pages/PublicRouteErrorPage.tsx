import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { usePageMeta } from '@/lib/page-meta'

export function PublicRouteErrorPage() {
  const error = useRouteError()
  const title = isRouteErrorResponse(error) ? `${error.status} | Pagina niet beschikbaar` : 'Pagina niet beschikbaar'
  const message = isRouteErrorResponse(error)
    ? error.status === 404
      ? 'Dit domein is niet publiek zichtbaar of bestaat niet.'
      : 'De publieke pagina kon niet worden geladen.'
    : error instanceof Error
      ? error.message
      : 'Er ging iets mis bij het laden van deze pagina.'

  usePageMeta(title, message)

  return (
    <section className="border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-emerald-700">Publieke pagina</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{message}</p>
      <Link className="mt-6 inline-flex rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white" to="/">
        Terug naar portfolio
      </Link>
    </section>
  )
}
