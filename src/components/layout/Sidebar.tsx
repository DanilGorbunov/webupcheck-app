import type { ReactNode } from 'react'
import type { Page } from '../../App'

interface Props {
  current: Page
  onNav: (p: Page) => void
  stats?: { active: number; warning: number; issues: number }
  syncing?: boolean
  syncProgress?: number
  syncTotal?: number
  alertCount?: number
}

const navItems: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  },
  {
    id: 'sites',
    label: 'Sites',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  },
  {
    id: 'checker',
    label: 'Pre-Purchase Check',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  },
]

export function Sidebar({ current, onNav, stats, syncing, syncProgress = 0, syncTotal = 0, alertCount = 0 }: Props) {
  const syncPct = syncTotal ? Math.round((syncProgress / syncTotal) * 100) : 0

  return (
    <div style={{ width: 240, minWidth: 240, background: '#0F172A', display: 'flex', flexDirection: 'column', height: '100vh', zIndex: 10 }}>
      {/* Logo */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => onNav('dashboard')}>
        <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.01em' }}>WebUpCheck</span>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {navItems.map(item => {
          const active = current === item.id
          const badge = item.id === 'alerts' && alertCount > 0 ? alertCount : null
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: active ? 'rgba(37,99,235,0.2)' : 'transparent',
                color: active ? '#93C5FD' : '#64748B',
                transition: 'background 0.12s, color 0.12s',
                textAlign: 'left',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#CBD5E1' } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#64748B' } }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{item.label}</span>
              {badge !== null && (
                <span style={{
                  marginLeft: 'auto',
                  background: '#DC2626', color: '#fff',
                  fontSize: 10, fontWeight: 700, lineHeight: 1,
                  padding: '2px 5px', borderRadius: 5, minWidth: 18, textAlign: 'center',
                }}>
                  {badge > 9999 ? '9k+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Sync progress */}
      {syncing && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#64748B' }}>Syncing…</span>
            <span style={{ fontSize: 11, color: '#64748B' }}>{syncPct}%</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 3, overflow: 'hidden' }}>
            <div style={{ background: '#3B82F6', height: '100%', width: `${syncPct}%`, borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Network stats */}
      {!syncing && stats && (
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', flexShrink: 0, boxShadow: '0 0 5px rgba(22,163,74,0.5)' }} />
            <span style={{ fontSize: 10, color: '#475569' }}>{stats.active.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#475569' }}>{stats.warning.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#475569' }}>{stats.issues.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
