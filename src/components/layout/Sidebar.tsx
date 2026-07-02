import type { ReactNode } from 'react'
import type { Page } from '../../App'

interface Props {
  current: Page
  onNav: (p: Page) => void
  stats?: { active: number; warning: number; issues: number }
}

const navItems: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  },
  {
    id: 'sites',
    label: 'Sites',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  },
  {
    id: 'checker',
    label: 'Pre-Purchase Check',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  },
]

export function Sidebar({ current, onNav, stats }: Props) {
  return (
    <div style={{ width: 232, minWidth: 232, background: '#0F172A', display: 'flex', flexDirection: 'column', height: '100vh', zIndex: 10 }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.2px' }}>WebUpCheck</div>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 500, marginTop: 1 }}>by PRNEWS.IO</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '10px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(item => {
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500, fontFamily: 'inherit', textAlign: 'left', width: '100%',
                background: active ? 'rgba(37,99,235,0.2)' : 'transparent',
                color: active ? '#93C5FD' : '#94A3B8',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#CBD5E1' } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94A3B8' } }}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Network status */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Network Status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#94A3B8' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', flexShrink: 0, boxShadow: '0 0 5px rgba(22,163,74,0.6)' }} />
            {stats?.active?.toLocaleString() ?? '—'} Active
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#94A3B8' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
            {stats?.warning?.toLocaleString() ?? '—'} Warning
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#94A3B8' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
            {stats?.issues?.toLocaleString() ?? '—'} Issues
          </div>
        </div>
      </div>
    </div>
  )
}
