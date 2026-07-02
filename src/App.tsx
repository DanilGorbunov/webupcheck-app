import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { SyncProgress } from './components/ui/SyncProgress'
import { SitesPage } from './pages/SitesPage'
import { SiteDetailPage } from './pages/SiteDetailPage'
import { CheckerPage } from './pages/CheckerPage'
import { LandingPage } from './pages/LandingPage'
import { useMedialister } from './hooks/useMedialister'
import type { Site } from './types'

export type Page = 'dashboard' | 'sites' | 'checker' | 'alerts' | 'campaigns' | 'settings'
type AppView = 'landing' | 'app'

export default function App() {
  const [view, setView] = useState<AppView>('landing')
  const [page, setPage] = useState<Page>('sites')
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)

  const { sites, totalItems, loading, syncing, syncProgress, syncTotal, error } = useMedialister()

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
      return <SitesPage sites={sites} totalItems={totalItems} syncing={syncing} onViewSite={s => setSelectedSite(s)} />
    }
    if (page === 'checker') {
      return <CheckerPage />
    }
    return (
      <div style={{ padding: '26px 28px', color: '#94A3B8', fontSize: 14 }}>
        {page.charAt(0).toUpperCase() + page.slice(1)} — coming soon
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar current={selectedSite ? 'sites' : page} onNav={p => { setPage(p); setSelectedSite(null) }} />

      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {loading && sites.length === 0 && !error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: 14 }}>
            Loading sites…
          </div>
        )}
        {error && (
          <div style={{ padding: 28, color: '#DC2626', fontSize: 13 }}>Error: {error}</div>
        )}
        {sites.length > 0 && renderContent()}
      </div>

      {syncing && <SyncProgress progress={syncProgress} total={syncTotal} />}
    </div>
  )
}
