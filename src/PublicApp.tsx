import { Outlet } from 'react-router-dom'
import { PublicShell } from './components/PublicShell'

export default function PublicApp() {
  return (
    <PublicShell>
      <Outlet />
    </PublicShell>
  )
}
