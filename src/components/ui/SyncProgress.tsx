interface Props {
  // Medialister sync
  syncProgress: number
  syncTotal: number
  syncing: boolean
  // Health check
  healthChecked: number
  healthTotal: number
  healthRunning: boolean
}

export function SyncProgress({ syncProgress, syncTotal, syncing, healthChecked, healthTotal, healthRunning }: Props) {
  const syncPct = syncTotal ? Math.round((syncProgress / syncTotal) * 100) : 0
  const healthPct = healthTotal ? Math.round((healthChecked / healthTotal) * 100) : 0

  if (!syncing && !healthRunning) return null

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#0F172A', borderRadius: 12, padding: '16px 20px', width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 999 }}>

      {syncing && (
        <div style={{ marginBottom: healthRunning ? 14 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#F1F5F9' }}>Syncing Medialister</span>
            <span style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 700 }}>{syncPct}%</span>
          </div>
          <div style={{ background: '#1E293B', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 5 }}>
            <div style={{ background: '#2563EB', height: '100%', width: `${syncPct}%`, borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>Page {syncProgress} of {syncTotal} · {(syncProgress * 100).toLocaleString()} sites loaded</div>
        </div>
      )}

      {healthRunning && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block', boxShadow: '0 0 4px rgba(22,163,74,0.8)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#F1F5F9' }}>Checking availability</span>
            </div>
            <span style={{ fontSize: 12.5, color: '#16A34A', fontWeight: 700 }}>{healthPct}%</span>
          </div>
          <div style={{ background: '#1E293B', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 5 }}>
            <div style={{ background: '#16A34A', height: '100%', width: `${healthPct}%`, borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>{healthChecked.toLocaleString()} / {healthTotal.toLocaleString()} sites checked · 5 concurrent</div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
