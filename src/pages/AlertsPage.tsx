import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSite = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbAlert = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConvexId = any

const listAlertsFn   = makeFunctionReference<'query',    { dismissed?: boolean; limit?: number }, DbAlert[]>('sites:listAlerts')
const dismissAlertFn = makeFunctionReference<'mutation', { alertId: ConvexId }, void>('sites:dismissAlert')
const dismissAllFn   = makeFunctionReference<'mutation', Record<string, never>, number>('sites:dismissAllAlerts')

interface Props { onViewSite: (s: DbSite) => void }

type Tab = 'all' | 'critical' | 'dead' | 'warning' | 'dismissed'

// HTTP error codes with descriptions shown in filter bar
const HTTP_FILTERS: { code: string; label: string; color: string; desc: string }[] = [
  { code: 'http 0',  label: 'HTTP 0',  color: '#DC2626', desc: 'No response — server unreachable or DNS failed' },
  { code: 'http 502', label: 'HTTP 502', color: '#DC2626', desc: 'Bad Gateway — upstream server down' },
  { code: 'http 503', label: 'HTTP 503', color: '#DC2626', desc: 'Service Unavailable — server overloaded or down' },
  { code: 'http 504', label: 'HTTP 504', color: '#DC2626', desc: 'Gateway Timeout — no upstream response' },
  { code: 'http 403', label: 'HTTP 403', color: '#D97706', desc: 'Forbidden — bot protection (site is alive)' },
  { code: 'http 429', label: 'HTTP 429', color: '#D97706', desc: 'Rate Limited — too many requests (site is alive)' },
  { code: 'http 406', label: 'HTTP 406', color: '#D97706', desc: 'Not Acceptable — header mismatch (site is alive)' },
  { code: 'http 404', label: 'HTTP 404', color: '#D97706', desc: 'Not Found — page missing, server alive' },
  { code: 'redirects', label: 'Redirect', color: '#6B7280', desc: 'HTTP 301/302 redirect detected' },
  { code: 'parking page', label: 'Parked', color: '#94A3B8', desc: 'Domain for sale / empty parking page' },
  { code: 'consecutive checks failed', label: 'Repeated fail', color: '#7C3AED', desc: '3+ checks failed in a row — confirmed down' },
]

const SEVERITY_STYLES = {
  critical: { border: '#DC2626', bg: '#FFF5F5', dot: '#DC2626', label: 'CRITICAL', labelColor: '#DC2626', labelBg: '#FEE2E2' },
  warning:  { border: '#D97706', bg: '#FFFBEB', dot: '#D97706', label: 'WARNING',  labelColor: '#92400E', labelBg: '#FEF3C7' },
  info:     { border: '#2563EB', bg: '#EFF6FF', dot: '#2563EB', label: 'INFO',     labelColor: '#1D4ED8', labelBg: '#DBEAFE' },
}
const ICONS = { critical: '🔴', warning: '⚠️', info: 'ℹ️' }

function formatRelTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function isDead(a: DbAlert): boolean {
  const msg = (a.message ?? '').toLowerCase()
  if (msg.includes('(http 0)') || msg.includes('http 0)')) return true
  if (msg.includes('parking page detected')) return true
  if (/\d+ consecutive checks failed/.test(msg)) return true
  return false
}

export function AlertsPage({ onViewSite }: Props) {
  const [tab, setTab]           = useState<Tab>('all')
  const [httpFilter, setHttpFilter] = useState<string | null>(null)
  const [activeLimit, setActiveLimit]       = useState(500)
  const [dismissedLimit, setDismissedLimit] = useState(500)

  const activeAlerts    = useQuery(listAlertsFn, { dismissed: false, limit: activeLimit }) ?? []
  const dismissedAlerts = useQuery(listAlertsFn, { dismissed: true,  limit: dismissedLimit }) ?? []
  const undismissedCount = activeAlerts.length
  const dismissAlert    = useMutation(dismissAlertFn)
  const dismissAll      = useMutation(dismissAllFn)

  const baseAlerts: DbAlert[] = tab === 'dismissed' ? dismissedAlerts : activeAlerts

  const filtered = baseAlerts.filter((a: DbAlert) => {
    const msg = (a.message ?? '').toLowerCase()
    // Tab filter
    if (tab === 'critical') { if (!isDead(a)) return false }
    if (tab === 'dead')     { if (!isDead(a)) return false }
    if (tab === 'warning')  { if (a.severity !== 'warning') return false }
    // HTTP code filter
    if (httpFilter) { if (!msg.includes(httpFilter)) return false }
    return true
  })

  const deadCount    = activeAlerts.filter(isDead).length
  const warningCount = activeAlerts.filter((a: DbAlert) => a.severity === 'warning').length

  const TAB_STYLE = (t: Tab) => ({
    padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: tab === t ? 600 : 400,
    color: tab === t ? '#0F172A' : '#6B7280',
    borderBottom: `2px solid ${tab === t ? '#2563EB' : 'transparent'}`,
    fontFamily: 'inherit', marginBottom: -1,
    display: 'flex', alignItems: 'center', gap: 5,
  })

  const badge = (n: number, color = '#FEE2E2', text = '#DC2626') => n > 0 ? (
    <span style={{ background: color, color: text, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{n}</span>
  ) : null

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: -0.4 }}>Alerts</h1>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
            {undismissedCount > 0 ? `${undismissedCount} active alerts across your network` : 'No active alerts'}
          </p>
        </div>
        {undismissedCount > 0 && tab !== 'dismissed' && (
          <button
            onClick={() => dismissAll({})}
            style={{ padding: '7px 14px', background: 'white', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Dismiss All ({undismissedCount})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 14 }}>
        <button style={TAB_STYLE('all')} onClick={() => setTab('all')}>
          All {badge(undismissedCount)}
        </button>
        <button style={TAB_STYLE('dead')} onClick={() => setTab('dead')}>
          Dead {badge(deadCount)}
        </button>
        <button style={TAB_STYLE('critical')} onClick={() => setTab('critical')}>
          Critical {badge(activeAlerts.filter((a: DbAlert) => a.severity === 'critical').length)}
        </button>
        <button style={TAB_STYLE('warning')} onClick={() => setTab('warning')}>
          Warning {badge(warningCount, '#FEF3C7', '#92400E')}
        </button>
        <button style={TAB_STYLE('dismissed')} onClick={() => setTab('dismissed')}>
          Dismissed
        </button>
      </div>

      {/* HTTP Error Code Filters */}
      <div style={{ marginBottom: 16, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Filter by error code
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          <button
            onClick={() => setHttpFilter(null)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${httpFilter === null ? '#2563EB' : '#E2E8F0'}`,
              background: httpFilter === null ? '#EFF6FF' : 'white',
              color: httpFilter === null ? '#2563EB' : '#6B7280',
              fontFamily: 'inherit',
            }}
          >
            All codes
          </button>
          {HTTP_FILTERS.map(f => {
            const count = activeAlerts.filter((a: DbAlert) => (a.message ?? '').toLowerCase().includes(f.code)).length
            if (count === 0 && tab !== 'dismissed') return null
            const active = httpFilter === f.code
            return (
              <button
                key={f.code}
                onClick={() => setHttpFilter(active ? null : f.code)}
                title={f.desc}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${active ? f.color : '#E2E8F0'}`,
                  background: active ? `${f.color}15` : 'white',
                  color: active ? f.color : '#374151',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                {f.label}
                <span style={{ fontSize: 10, fontWeight: 700, color: f.color }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Description of selected filter */}
        {httpFilter && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9', fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {HTTP_FILTERS.find(f => f.code === httpFilter)?.desc}
          </div>
        )}
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>
        Showing {filtered.length.toLocaleString()} of {(tab === 'dismissed' ? dismissedAlerts : activeAlerts).length.toLocaleString()} alerts
      </div>

      {/* Alert list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>
            {tab === 'dismissed' ? 'No dismissed alerts' : httpFilter ? 'No alerts match this filter' : 'No active alerts'}
          </div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            {tab === 'dismissed' ? 'Dismissed alerts will appear here' : 'Everything looks good across your network'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((alert: DbAlert) => {
            const sev = (alert.severity ?? 'info') as keyof typeof SEVERITY_STYLES
            const st  = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.info
            const dead = isDead(alert)
            return (
              <div
                key={alert._id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px',
                  borderLeft: `3px solid ${dead ? '#DC2626' : st.border}`,
                  background: st.bg,
                  borderRadius: '0 8px 8px 0',
                  opacity: alert.dismissed ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>
                  {dead ? '💀' : ICONS[sev] ?? 'ℹ️'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{alert.domain}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: st.labelBg, color: st.labelColor }}>
                      {dead ? 'DEAD' : st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#374151' }}>{alert.message}</div>
                  {alert.subdomains && alert.subdomains.length > 0 && (
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>
                      ↳ Subdomains: {(alert.subdomains as string[]).join(', ')}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {formatRelTime(alert.createdAt)}
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onViewSite({ _id: alert.siteId, domain: alert.domain })}
                    style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#374151', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}
                  >
                    View
                  </button>
                  <a
                    href={`https://${alert.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '5px 10px', fontSize: 12, color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 5, background: '#EFF6FF', textDecoration: 'none', fontWeight: 500 }}
                  >
                    Open →
                  </a>
                  {!alert.dismissed && (
                    <button
                      onClick={() => dismissAlert({ alertId: alert._id })}
                      style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {(() => {
        const currentList = tab === 'dismissed' ? dismissedAlerts : activeAlerts
        const currentLimit = tab === 'dismissed' ? dismissedLimit : activeLimit
        const setLimit = tab === 'dismissed' ? setDismissedLimit : setActiveLimit
        if (currentList.length < currentLimit) return null
        return (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => setLimit(l => l + 500)}
              style={{ padding: '8px 24px', background: 'white', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
            >
              Load more ({currentList.length} shown)
            </button>
          </div>
        )
      })()}
    </div>
  )
}
