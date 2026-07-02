import { useState } from 'react'
import type { Site } from '../types'

interface Alert {
  id: string
  domain: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  time: string
  dismissed: boolean
}

interface Props {
  sites: Site[]
  onViewSite: (s: Site) => void
}

const SEVERITY_STYLES = {
  critical: { border: '#DC2626', bg: '#FFF5F5', dot: '#DC2626', label: 'CRITICAL', labelColor: '#DC2626', labelBg: '#FEE2E2' },
  warning:  { border: '#D97706', bg: '#FFFBEB', dot: '#D97706', label: 'WARNING',  labelColor: '#92400E', labelBg: '#FEF3C7' },
  info:     { border: '#2563EB', bg: '#EFF6FF', dot: '#2563EB', label: 'INFO',     labelColor: '#1D4ED8', labelBg: '#DBEAFE' },
}

const ICONS = { critical: '🔴', warning: '⚠️', info: 'ℹ️' }

export function AlertsPage({ sites, onViewSite }: Props) {
  const [tab, setTab] = useState<'all' | 'unresolved' | 'critical' | 'dismissed'>('all')
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const generated: Alert[] = sites
    .filter(s => s.status && !['Active', 'Unknown'].includes(s.status))
    .slice(0, 50)
    .map(s => {
      const sev: Alert['severity'] =
        s.status === 'Unreachable' || s.status === 'Blacklisted' ? 'critical'
        : s.status === 'Warning' ? 'warning' : 'info'
      const msgs: Record<string, string> = {
        Unreachable: 'Site returned no response for 2+ consecutive checks',
        Blacklisted: 'Domain added to spam/malware blocklist',
        Parked: 'Parking page detected — content has been removed',
        Suspended: 'Domain registrar account flagged or suspended',
        Warning: 'Site health degraded — check required',
      }
      return {
        id: String(s.id),
        domain: s.domain,
        severity: sev,
        message: msgs[s.status ?? ''] ?? 'Status changed',
        time: '2h ago',
        dismissed: dismissedIds.has(String(s.id)),
      }
    })

  const filtered = generated.filter(a => {
    if (tab === 'dismissed') return a.dismissed
    if (a.dismissed) return false
    if (tab === 'critical') return a.severity === 'critical'
    if (tab === 'unresolved') return !a.dismissed
    return true
  })

  const undismissedCount = generated.filter(a => !a.dismissed).length

  function dismiss(id: string) {
    setDismissedIds(prev => new Set([...prev, id]))
  }

  function dismissAll() {
    setDismissedIds(new Set(generated.map(a => a.id)))
  }

  const TAB_STYLE = (t: typeof tab) => ({
    padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#0F172A' : '#6B7280',
    borderBottom: `2px solid ${tab === t ? '#2563EB' : 'transparent'}`,
    fontFamily: 'inherit', marginBottom: -1,
  })

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: -0.4 }}>Alerts</h1>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
            {undismissedCount > 0 ? `${undismissedCount} active alerts across your network` : 'No active alerts'}
          </p>
        </div>
        {undismissedCount > 0 && (
          <button onClick={dismissAll} style={{ padding: '7px 14px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Mark all read
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 18 }}>
        {(['all', 'unresolved', 'critical', 'dismissed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'all' && undismissedCount > 0 && (
              <span style={{ marginLeft: 6, background: '#FEE2E2', color: '#DC2626', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{undismissedCount}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>
            {tab === 'dismissed' ? 'No dismissed alerts' : 'No active alerts'}
          </div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            {tab === 'dismissed' ? 'Dismissed alerts will appear here' : 'Everything looks good across your network'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(alert => {
            const st = SEVERITY_STYLES[alert.severity]
            const site = sites.find(s => s.domain === alert.domain)
            return (
              <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderLeft: `3px solid ${st.border}`, background: st.bg, borderRadius: '0 8px 8px 0', opacity: alert.dismissed ? 0.6 : 1 }}>
                <span style={{ fontSize: 18, flexShrink: 0, width: 26, textAlign: 'center' }}>{ICONS[alert.severity]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{alert.domain}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: st.labelBg, color: st.labelColor }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#374151' }}>{alert.message}</div>
                </div>
                <span style={{ fontSize: 11.5, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>{alert.time}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {site && (
                    <button onClick={() => onViewSite(site)} style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#374151', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>
                      View Site
                    </button>
                  )}
                  {!alert.dismissed && (
                    <button onClick={() => dismiss(alert.id)} style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
