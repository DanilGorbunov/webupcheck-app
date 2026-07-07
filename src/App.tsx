import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { Sidebar } from './components/layout/Sidebar'
import { SitesPage } from './pages/SitesPage'
import { SiteDetailPage } from './pages/SiteDetailPage'
import { CheckerPage } from './pages/CheckerPage'
import { LandingPage } from './pages/LandingPage'
import { DashboardPage } from './pages/DashboardPage'
import { AlertsPage } from './pages/AlertsPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { SettingsPage } from './pages/SettingsPage'
import { useMedialister } from './hooks/useMedialister'
import type { Site } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listByColumnFn = makeFunctionReference<'query', { workflowStatus: string; limit?: number }, any[]>('sites:listAlertsByColumn')

function countGrouped(alerts: { domain?: string }[]): number {
  const roots = new Set<string>()
  let singles = 0
  for (const a of alerts) {
    const d = a.domain ?? ''
    const idx = d.indexOf('/')
    if (idx === -1) singles++
    else roots.add(d.slice(0, idx))
  }
  return singles + roots.size
}

export type Page = 'dashboard' | 'sites' | 'checker' | 'alerts' | 'campaigns' | 'settings'
type AppView = 'landing' | 'app'

export default function App() {
  const [view, setView] = useState<AppView>('landing')
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)

  const { syncing, syncProgress, syncTotal, totalItems } = useMedialister()

  const newAlerts    = useQuery(listByColumnFn, { workflowStatus: 'new',    limit: 16384 }) ?? []
  const urgentAlerts = useQuery(listByColumnFn, { workflowStatus: 'urgent', limit: 16384 }) ?? []
  const deadAlerts   = useQuery(listByColumnFn, { workflowStatus: 'dead',   limit: 16384 }) ?? []
  const alertCount   = useMemo(
    () => countGrouped(newAlerts) + countGrouped(urgentAlerts) + countGrouped(deadAlerts),
    [newAlerts, urgentAlerts, deadAlerts],
  )

  if (view === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => setView('app')}
        onCheckNow={() => { setView('app'); setPage('checker') }}
      />
    )
  }

  function renderContent() {
    if (selectedSite) {
      return <SiteDetailPage site={selectedSite} onBack={() => setSelectedSite(null)} />
    }
    if (page === 'sites') {
      return <SitesPage totalItems={totalItems} syncing={syncing} onViewSite={s => setSelectedSite(s)} />
    }
    if (page === 'dashboard') {
      return <DashboardPage totalItems={totalItems} syncing={syncing} syncProgress={syncProgress} syncTotal={syncTotal} onNav={p => { setPage(p); setSelectedSite(null) }} />
    }
    if (page === 'checker') {
      return <CheckerPage />
    }
    if (page === 'alerts') {
      return <AlertsPage onViewSite={s => setSelectedSite(s)} />
    }
    if (page === 'campaigns') {
      return <CampaignsPage />
    }
    if (page === 'settings') {
      return <SettingsPage />
    }
    return null
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        current={selectedSite ? 'sites' : page}
        onNav={p => { setPage(p); setSelectedSite(null) }}
        syncing={syncing}
        syncProgress={syncProgress}
        syncTotal={syncTotal}
        alertCount={alertCount}
      />

      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {renderContent()}
      </div>
    </div>
  )
}
