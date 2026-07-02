interface Props {
  progress: number
  total: number
}

export function SyncProgress({ progress, total }: Props) {
  const pct = total ? Math.round((progress / total) * 100) : 0
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#0F172A', borderRadius: 12, padding: '16px 20px', width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 999 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>Syncing Medialister</span>
        <span style={{ fontSize: 13, color: '#2563EB', fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ background: '#1E293B', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ background: '#2563EB', height: '100%', width: `${pct}%`, borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: 11.5, color: '#475569' }}>Page {progress} of {total} · {(progress * 100).toLocaleString()} sites loaded</div>
    </div>
  )
}
