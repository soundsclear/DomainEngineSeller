import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from './App'
import PublicApp from './PublicApp'
import { DashboardPage } from './pages/DashboardPage'
import { DealsPage } from './pages/DealsPage'
import { DomainDetailPage } from './pages/DomainDetailPage'
import { DomainsPage } from './pages/DomainsPage'
import { InboxPage } from './pages/InboxPage'
import { InquiryThreadPage } from './pages/InquiryThreadPage'
import { LeadsPage } from './pages/LeadsPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
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
      { index: true, element: <PublicPortfolioPage />, loader: publicPortfolioLoader },
      { path: 'portfolio', element: <PublicPortfolioPage />, loader: publicPortfolioLoader },
      { path: 'd/:domainId', element: <PublicDomainPage />, loader: publicDomainLoader },
    ],
  },
  {
    path: '/admin',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'inbox/:inquiryId', element: <InquiryThreadPage /> },
      { path: 'deals', element: <DealsPage /> },
      { path: 'domains', element: <DomainsPage /> },
      { path: 'domains/:domainId', element: <DomainDetailPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/admin/login',
    element: <Navigate to="/login" replace />,
  },
])
