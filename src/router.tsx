import { createBrowserRouter } from 'react-router-dom'
import App from './App'
import PublicApp from './PublicApp'
import { DashboardPage } from './pages/DashboardPage'
import { DealsPage } from './pages/DealsPage'
import { DomainDetailPage } from './pages/DomainDetailPage'
import { DomainsPage } from './pages/DomainsPage'
import { InboxPage } from './pages/InboxPage'
import { LeadsPage } from './pages/LeadsPage'
import { LoginPage } from './pages/LoginPage'
import { PublicDomainPage } from './pages/PublicDomainPage'
import { PublicPortfolioPage } from './pages/PublicPortfolioPage'
import { publicDomainLoader, publicPortfolioLoader } from './pages/public-loaders'
import { PublicRouteErrorPage } from './pages/PublicRouteErrorPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicApp />,
    errorElement: <PublicRouteErrorPage />,
    children: [
      { path: 'portfolio', element: <PublicPortfolioPage />, loader: publicPortfolioLoader },
      { path: 'd/:domainId', element: <PublicDomainPage />, loader: publicDomainLoader },
    ],
  },
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'admin/inbox', element: <InboxPage /> },
      { path: 'admin/deals', element: <DealsPage /> },
      { path: 'admin/domains', element: <DomainsPage /> },
      { path: 'admin/domains/:domainId', element: <DomainDetailPage /> },
      { path: 'admin/leads', element: <LeadsPage /> },
    ],
  },
])
