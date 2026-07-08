import { useState, useMemo, useCallback, useRef, memo, useDeferredValue, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { makeFunctionReference } from 'convex/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSite = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbAlert = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConvexId = any

const listByColumnFn        = makeFunctionReference<'query',    { workflowStatus: string; limit?: number }, DbAlert[]>('sites:listAlertsByColumn')
const getByDomainFn         = makeFunctionReference<'query',    { domain: string }, DbSite | null>('sites:getByDomain')
const siteHistoryFn         = makeFunctionReference<'query',    { siteId: ConvexId }, any[]>('sites:siteHistory')
const getLastReverifyLogFn  = makeFunctionReference<'query',    Record<string, never>, any>('sites:getLastReverifyLog')
const startReverifyAllFn          = makeFunctionReference<'action', Record<string, never>, { started: boolean; message: string }>('checker:startReverifyAll')
const checkDomainFromCountryFn    = makeFunctionReference<'action', { domain: string; country: string }, { httpStatus: number; responseTimeMs?: number; isParked: boolean; pageTitle?: string }>('checker:checkDomainFromCountry')
const bulkUpdateFn          = makeFunctionReference<'mutation',  { updates: { domain: string; action: string }[] }, { working: number; dead: number; inProgress: number; ignored: number; notFound: number }>('sites:bulkUpdateAlertsByDomain')
const bulkPrefixFn          = makeFunctionReference<'mutation',  { prefix: string; action: string }, { count: number; prefix: string }>('sites:bulkDismissByDomainPrefix')
const updateWorkflowFn      = makeFunctionReference<'mutation', { alertId: ConvexId; workflowStatus: string }, void>('sites:updateAlertWorkflow')
const dismissAlertFn        = makeFunctionReference<'mutation', { alertId: ConvexId }, void>('sites:dismissAlert')
const markBotBlockedDownFn  = makeFunctionReference<'mutation', { alertId: ConvexId }, void>('sites:markBotBlockedAsDown')
const migrateDeadAlertsFn      = makeFunctionReference<'action', Record<string, never>, { total: number }>('sites:migrateDeadAlerts')
const revertBlockedFromDeadFn   = makeFunctionReference<'action', Record<string, never>, { total: number }>('sites:revertBlockedFromDead')
const revertCriticalFromDeadFn  = makeFunctionReference<'action', Record<string, never>, { total: number }>('sites:revertCriticalFromDead')
const deduplicateAlertsFn      = makeFunctionReference<'action', Record<string, never>, { dismissed: number }>('sites:deduplicateAlerts')

interface Props { onViewSite: (s: DbSite) => void }

type WorkflowCol = 'new' | 'urgent' | 'dead' | 'done'

const COLUMNS: { id: WorkflowCol; label: string; color: string; bg: string; sub?: string }[] = [
  { id: 'new',    label: 'New',             color: '#64748B', bg: '#F8FAFC' },
  { id: 'urgent', label: 'Urgent',          color: '#DC2626', bg: '#FFF5F5' },
  { id: 'dead',   label: 'Dead',            color: '#64748B', bg: '#F1F5F9' },
  { id: 'done',   label: 'In Process',      color: '#16A34A', bg: '#F0FDF4' },
]

// legacy values from old schema map to new columns

const HTTP_FILTERS = [
  { code: 'http 0',    label: 'HTTP 0',    statsKey: 'http0'    },
  { code: 'http 403',  label: 'HTTP 403',  statsKey: 'http403'  },
  { code: 'http 404',  label: 'HTTP 404',  statsKey: 'http404'  },
  { code: 'http 429',  label: 'HTTP 429',  statsKey: 'http429'  },
  { code: 'http 5',    label: 'HTTP 5xx',  statsKey: 'http5xx'  },
  { code: 'redirect',  label: 'Redirect',  statsKey: 'redirect' },
  { code: 'park',      label: 'Parked',    statsKey: 'parked'   },
]

const TLD_FLAG: Record<string, string> = {
  fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹', es: '🇪🇸', nl: '🇳🇱', pl: '🇵🇱', se: '🇸🇪', no: '🇳🇴',
  fi: '🇫🇮', dk: '🇩🇰', be: '🇧🇪', ch: '🇨🇭', at: '🇦🇹', pt: '🇵🇹', gr: '🇬🇷', cz: '🇨🇿',
  hu: '🇭🇺', ro: '🇷🇴', ua: '🇺🇦', ru: '🇷🇺', uk: '🇬🇧', ie: '🇮🇪', us: '🇺🇸', ca: '🇨🇦',
  mx: '🇲🇽', br: '🇧🇷', ar: '🇦🇷', au: '🇦🇺', nz: '🇳🇿', jp: '🇯🇵', kr: '🇰🇷', cn: '🇨🇳',
  in: '🇮🇳', sg: '🇸🇬', my: '🇲🇾', th: '🇹🇭', id: '🇮🇩', ph: '🇵🇭', vn: '🇻🇳', tw: '🇹🇼',
  hk: '🇭🇰', tr: '🇹🇷', il: '🇮🇱', ae: '🇦🇪', sa: '🇸🇦', za: '🇿🇦',
}

function getDomainTLD(domain: string): string {
  const host = domain.split('/')[0].replace(/^www\./, '').toLowerCase()
  const parts = host.split('.')
  return parts[parts.length - 1]
}

// --- Domain grouping for path-based publishers (patch.com/..., dailyvoice.com/...) ---

type AlertItem =
  | { kind: 'single'; alert: DbAlert }
  | { kind: 'group'; root: string; alerts: DbAlert[]; worstLabel: string }

function getGroupRoot(domain: string): string | null {
  const idx = (domain ?? '').indexOf('/')
  return idx === -1 ? null : domain.slice(0, idx)
}

function groupAlerts(alerts: DbAlert[]): AlertItem[] {
  const groupMap = new Map<string, DbAlert[]>()
  const orderKeys: string[] = []
  for (const a of alerts) {
    const root = getGroupRoot(a.domain ?? '')
    if (root) {
      const key = `g:${root}`
      if (!groupMap.has(root)) { groupMap.set(root, []); orderKeys.push(key) }
      groupMap.get(root)!.push(a)
    } else {
      orderKeys.push(`s:${a._id}`)
    }
  }
  const byId = new Map(alerts.map(a => [a._id, a]))
  const seen = new Set<string>()
  const result: AlertItem[] = []
  for (const key of orderKeys) {
    if (seen.has(key)) continue
    seen.add(key)
    if (key.startsWith('s:')) {
      const a = byId.get(key.slice(2)); if (a) result.push({ kind: 'single', alert: a })
    } else {
      const root = key.slice(2)
      const grp = groupMap.get(root)!
      if (grp.length === 1) {
        result.push({ kind: 'single', alert: grp[0] })
      } else {
        const labels = grp.map(a => getSeverityStyle(a).label)
        const worstLabel = labels.includes('DEAD') ? 'DEAD' : labels.includes('CRITICAL') ? 'CRITICAL' : labels[0] ?? 'WARNING'
        result.push({ kind: 'group', root, alerts: grp, worstLabel })
      }
    }
  }
  return result
}

function getHttpCode(msg: string): string | null {
  const m = msg.toLowerCase()
  if (m.includes('http 0')) return 'HTTP 0'
  if (m.includes('http 404')) return 'HTTP 404'
  if (m.includes('redirect')) return 'Redirect'
  if (m.includes('parking') || m.includes('parked')) return 'Parked'
  const match = m.match(/http (\d+)/)
  if (match) return `HTTP ${match[1]}`
  return null
}

function getSeverityStyle(a: DbAlert) {
  const msg = (a.message ?? '').toLowerCase()
  const dead = msg.includes('http 0') || msg.includes('consecutive') || msg.includes('park')
  if (dead) return { label: 'DEAD', color: '#DC2626', bg: '#FEE2E2', border: '#DC2626' }
  if (a.severity === 'critical') return { label: 'CRITICAL', color: '#DC2626', bg: '#FEE2E2', border: '#DC2626' }
  if (a.severity === 'warning') {
    let label = 'WARNING'
    if (msg.includes('http 403')) label = 'BLOCKED'
    else if (msg.includes('http 404')) label = 'NOT FOUND'
    else if (msg.includes('http 429')) label = 'RATE LIMITED'
    else if (msg.includes('http 5')) label = 'SERVER ERROR'
    else if (msg.includes('server down') || msg.includes('unreachable')) label = 'UNREACHABLE'
    else if (msg.includes('redirect')) label = 'REDIRECT'
    else if (msg.includes('park')) label = 'PARKED'
    else if (msg.includes('status changed')) label = 'DEGRADED'
    return { label, color: '#92400E', bg: '#FEF3C7', border: '#D97706' }
  }
  return { label: 'INFO', color: '#1D4ED8', bg: '#DBEAFE', border: '#2563EB' }
}

function getFixTip(label: string): { title: string; steps: string[] } {
  switch (label) {
    case 'BLOCKED':      return { title: 'Checker was blocked', steps: ['Open the site manually to verify it works', 'Cloudflare or bot-protection may be active', 'If working — mark as Working'] }
    case 'NOT FOUND':    return { title: 'Page not found (404)', steps: ['Check if the domain is still active', 'Site may have moved or been deleted', 'Verify DNS records are intact'] }
    case 'RATE LIMITED': return { title: 'Too many requests (429)', steps: ['Site is rate-limiting our checker', 'Check manually in a few hours', 'Likely working fine for real users'] }
    case 'SERVER ERROR': return { title: 'Server error (5xx)', steps: ['Server-side issue on their end', 'Check hosting / status page', 'Usually recovers automatically'] }
    case 'UNREACHABLE':  return { title: 'Server not responding', steps: ['Check if hosting is active', 'Verify DNS records', 'Server may be temporarily down'] }
    case 'REDIRECT':     return { title: 'Redirect detected', steps: ['Check where the domain redirects to', 'Verify if redirect is intentional', 'May affect article delivery'] }
    case 'PARKED':       return { title: 'Domain appears parked', steps: ['Domain may have been sold or expired', 'Check WHOIS for ownership changes', 'Site is likely inactive'] }
    case 'DEGRADED':     return { title: 'Status degraded', steps: ['Site status changed recently', 'Monitor for recovery', 'Check if issues are intermittent'] }
    case 'DEAD':         return { title: 'Site unreachable (HTTP 0)', steps: ['No response from server at all', 'Check if domain is expired', 'Hosting may be terminated'] }
    case 'CRITICAL':     return { title: 'Critical issue', steps: ['Needs immediate attention', 'Open site to verify manually', 'May be affecting content delivery'] }
    default:             return { title: 'Check manually', steps: ['Open the site to verify current status'] }
  }
}

function formatRelTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type DragOverCard = { id: string; pos: 'before' | 'after' }

function useOgImage(domain: string) {
  const [ogImage, setOgImage] = useState<string | null>(null)
  useEffect(() => {
    const key = `og:${domain}`
    const cached = sessionStorage.getItem(key)
    if (cached !== null) { setOgImage(cached || null); return }
    let cancelled = false
    fetch(`/api/og?url=${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const img = d.image ?? ''
        sessionStorage.setItem(key, img)
        setOgImage(img || null)
      })
      .catch(() => sessionStorage.setItem(key, ''))
    return () => { cancelled = true }
  }, [domain])
  return ogImage
}

const GroupCard = memo(function GroupCard({ root, alerts, worstLabel, onDismissAll, onSelect }: {
  root: string
  alerts: DbAlert[]
  worstLabel: string
  onDismissAll: () => void
  onSelect: () => void
}) {
  const isDead = worstLabel === 'DEAD' || worstLabel === 'CRITICAL'
  const color = isDead ? '#DC2626' : '#92400E'
  const bg    = isDead ? '#FEE2E2' : '#FEF3C7'

  const paths = alerts.map(a => {
    const idx = (a.domain ?? '').indexOf('/')
    return idx !== -1 ? a.domain.slice(idx) : a.domain
  })
  const SHOW = 3
  const preview = paths.slice(0, SHOW)
  const hidden  = paths.length - SHOW

  return (
    <div
      onClick={onSelect}
      style={{ background: 'white', border: '1px solid #E2E8F0', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color, flexShrink: 0 }}>
            {(root[0] ?? '?').toUpperCase()}
          </div>
          <a
            href={`https://${root}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={e => e.stopPropagation()}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            {root}
          </a>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: '#F1F5F9', color: '#64748B' }}>{alerts.length} paths</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: bg, color }}>{worstLabel}</span>
        </div>
      </div>

      <div style={{ marginBottom: 7, padding: '4px 6px', background: '#F8FAFC', borderRadius: 4 }}>
        {preview.map((p, i) => (
          <div key={i} style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', lineHeight: 1.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</div>
        ))}
        {hidden > 0 && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>+ {hidden} more…</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={e => { e.stopPropagation(); onDismissAll() }}
          style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 4, color: '#065F46', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ✓ Dismiss All
        </button>
        <span style={{ fontSize: 10, color: '#94A3B8' }}>View all →</span>
      </div>
    </div>
  )
})

const KanbanCard = memo(function KanbanCard({ alert, onDragStart, col, isOverBefore, isOverAfter, onCardDragOver, onCardDragLeave, onDismiss, onMarkDown, onSelect, onScreenshot, isSelected }: {
  alert: DbAlert
  onDragStart: (id: string) => void
  col?: WorkflowCol
  isOverBefore: boolean
  isOverAfter: boolean
  onDismiss: (id: string) => void
  onMarkDown: (id: string) => void
  onCardDragOver: (id: string, pos: 'before' | 'after') => void
  onCardDragLeave: () => void
  onSelect: (a: DbAlert) => void
  onScreenshot: (domain: string) => void
  isSelected?: boolean
}) {
  const st = getSeverityStyle(alert)
  const httpCode = getHttpCode(alert.message ?? '')
  const doneTag = col === 'done'
    ? (alert.workflowStatus === 'ignored' ? 'Ignored' : 'Fixed')
    : null
  const ogImage = useOgImage(alert.domain)

  return (
    <div
      onDragOver={e => {
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        onCardDragOver(alert._id, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      }}
      onDragLeave={e => {
        e.stopPropagation()
        onCardDragLeave()
      }}
    >
      {isOverBefore && (
        <div style={{ height: 2, background: '#2563EB', borderRadius: 1, margin: '0 2px 4px' }} />
      )}
      <div
        draggable
        onDragStart={() => onDragStart(alert._id)}
        onClick={() => onSelect(alert)}
        style={{
          background: isSelected ? '#EFF6FF' : 'white',
          border: `1px solid ${isSelected ? '#93C5FD' : '#E2E8F0'}`,
          borderLeft: `3px solid ${st.border}`,
          borderRadius: 6,
          padding: '10px 12px',
          marginBottom: 6,
          cursor: 'pointer',
          boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.25), 0 1px 3px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <div style={{ width: 14, height: 14, borderRadius: 2, background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color: st.color, flexShrink: 0, lineHeight: 1 }}>
              {(alert.domain?.[0] ?? '?').toUpperCase()}
            </div>
            <a
              href={`https://${alert.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', textDecoration: 'none', lineHeight: 1.3 }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
              onClick={e => { e.stopPropagation(); onSelect(alert) }}
            >
              {alert.domain}
            </a>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: st.bg, color: st.color, flexShrink: 0 }}>
            {st.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: httpCode || doneTag ? 4 : 0 }}>
          {httpCode && (
            <span style={{ fontSize: 10, color: '#6B7280', background: '#F1F5F9', padding: '1px 5px', borderRadius: 3 }}>
              {httpCode}
            </span>
          )}
          {doneTag && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: doneTag === 'Fixed' ? '#D1FAE5' : '#F1F5F9', color: doneTag === 'Fixed' ? '#065F46' : '#64748B' }}>
              {doneTag}
            </span>
          )}
          {alert.dr != null && alert.dr === 0 && (!alert.organicTraffic || alert.organicTraffic === 0) && (
            <span style={{ fontSize: 10, color: '#94A3B8', background: '#F8FAFC', padding: '1px 5px', borderRadius: 3, border: '1px solid #E2E8F0' }}>
              No SEO
            </span>
          )}
        </div>
        {ogImage && (
          <div style={{ margin: '6px 0 4px', borderRadius: 5, overflow: 'hidden', height: 80, background: '#F1F5F9' }}>
            <img
              src={ogImage}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }}
            />
          </div>
        )}
        <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.4 }}>{alert.message}</div>
        {alert.subdomains && alert.subdomains.length > 0 && (
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>↳ {(alert.subdomains as string[]).join(', ')}</div>
        )}
        {alert.aiCategory !== 'bot_blocked' && (alert.aiCategory || alert.aiReason) && (
          <div style={{ marginTop: 6, padding: '5px 7px', background: '#F8FAFC', borderRadius: 4, borderLeft: '2px solid #6366F1' }}>
            {alert.aiCategory && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: alert.aiReason ? 2 : 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {alert.aiCategory.replace(/_/g, ' ')}
                </span>
                {alert.aiPriority != null && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                    background: alert.aiPriority >= 70 ? '#FEE2E2' : alert.aiPriority >= 40 ? '#FEF3C7' : '#F0FDF4',
                    color:      alert.aiPriority >= 70 ? '#DC2626' : alert.aiPriority >= 40 ? '#92400E' : '#16A34A',
                  }}>
                    P{alert.aiPriority}
                  </span>
                )}
              </div>
            )}
            {alert.aiReason && (
              <div style={{ fontSize: 10, color: '#64748B', lineHeight: 1.4 }}>{alert.aiReason}</div>
            )}
          </div>
        )}
        {alert.aiCategory === 'bot_blocked' && (
          <div style={{ marginTop: 7, padding: '6px 8px', background: '#FFFBEB', borderRadius: 4, border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 10, color: '#92400E', marginBottom: 6, fontWeight: 500 }}>
              Our checker was blocked. Open the site and check if it works normally.
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <a
                href={`https://${alert.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { e.stopPropagation(); onSelect(alert) }}
                style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600, padding: '4px 6px', background: 'white', border: '1px solid #D1D5DB', borderRadius: 4, color: '#374151', textDecoration: 'none', cursor: 'pointer' }}
              >
                Open Site →
              </a>
              <button
                onClick={e => { e.stopPropagation(); onDismiss(alert._id) }}
                style={{ flex: 1, fontSize: 10, fontWeight: 600, padding: '4px 6px', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 4, color: '#065F46', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ✓ Working
              </button>
              <button
                onClick={e => { e.stopPropagation(); onMarkDown(alert._id) }}
                style={{ flex: 1, fontSize: 10, fontWeight: 600, padding: '4px 6px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 4, color: '#991B1B', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ✗ Down
              </button>
            </div>
          </div>
        )}
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatRelTime(alert.createdAt)}</span>
          <button
            onClick={e => { e.stopPropagation(); onScreenshot(alert.domain) }}
            title="Take screenshot"
            style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 4, cursor: 'pointer', color: '#94A3B8', fontFamily: 'inherit', lineHeight: 1 }}
          >
            📸
          </button>
        </div>
      </div>
      {isOverAfter && (
        <div style={{ height: 2, background: '#2563EB', borderRadius: 1, margin: '0 2px 4px' }} />
      )}
    </div>
  )
})

const COL_PAGE = 30


const NEW_COL_TABS = [
  { key: null,          label: 'All',          dropdown: false },
  { key: 'BLOCKED',     label: 'BLOCKED',      dropdown: false },
  { key: 'UNREACHABLE', label: 'UNREACHABLE',  dropdown: false },
  { key: 'NOT FOUND',   label: 'NOT FOUND',    dropdown: false },
  { key: 'SERVER ERROR',label: 'SERVER ERROR', dropdown: false },
  { key: 'PARKED',      label: 'PARKED',       dropdown: false },
  { key: 'RATE LIMITED',label: 'RATE LIMITED', dropdown: true  },
  { key: 'REDIRECT',    label: 'REDIRECT',     dropdown: true  },
  { key: 'DEGRADED',    label: 'DEGRADED',     dropdown: true  },
  { key: 'WARNING',     label: 'WARNING',      dropdown: true  },
]

const URGENT_COL_TABS = [
  { key: null,       label: 'All' },
  { key: 'critical', label: 'CRITICAL' },
]

const DONE_COL_TABS = [
  { key: null,      label: 'All' },
  { key: 'fixed',   label: 'Fixed' },
  { key: 'ignored', label: 'Ignored' },
]

const URGENT_PRIORITY_TABS = [
  { key: null,   label: 'All' },
  { key: 'p75',  label: 'P75+' },
  { key: 'p50',  label: 'P50–74' },
  { key: 'p0',   label: 'P<50' },
]

function matchesPriority(a: DbAlert, key: string): boolean {
  const p = a.aiPriority ?? 0
  if (key === 'p75') return p >= 75
  if (key === 'p50') return p >= 50 && p < 75
  if (key === 'p0')  return p < 50
  return true
}

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function exportToCsv(alerts: DbAlert[], colLabel: string, subTab: string | null, priorityTab: string | null) {
  const header = ['domain','type','severity','ai_priority','ai_reason','message','created_at'].join(',')
  const rows = alerts.map(a => {
    const { label } = getSeverityStyle(a)
    const date = new Date(a.createdAt).toISOString().slice(0, 10)
    return [
      csvEscape(a.domain),
      csvEscape(label),
      csvEscape(a.severity),
      csvEscape(a.aiPriority),
      csvEscape(a.aiReason),
      csvEscape(a.message),
      csvEscape(date),
    ].join(',')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  const tag = [colLabel, subTab, priorityTab].filter(Boolean).join('_').toLowerCase().replace(/\s+/g, '_')
  el.download = `alerts_${tag}_${new Date().toISOString().slice(0,10)}.csv`
  el.click()
  URL.revokeObjectURL(url)
}

function KanbanColumn({ col, alerts, visibleCount, onShowMore, onDrop, isDragOver, onDragOver, onDragLeave, onDragStart, dragOverCard, onCardDragOver, onCardDragLeave, onDismiss, onMarkDown, onSelect, onDismissAll, onScreenshot, onSelectGroup, onDismissGroup, selectedAlertId }: {
  col: typeof COLUMNS[0]
  alerts: DbAlert[]
  visibleCount: number
  onShowMore: () => void
  onDrop: (colId: WorkflowCol) => void
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDragStart: (id: string) => void
  dragOverCard: DragOverCard | null
  onCardDragOver: (id: string, pos: 'before' | 'after') => void
  onCardDragLeave: () => void
  onDismiss: (id: string) => void
  onMarkDown: (id: string) => void
  onSelect: (a: DbAlert) => void
  onDismissAll?: () => void
  onScreenshot: (domain: string) => void
  onSelectGroup: (root: string, alerts: DbAlert[]) => void
  onDismissGroup: (alerts: DbAlert[]) => void
  selectedAlertId?: string
}) {
  const [subTab, setSubTab] = useState<string | null>(null)
  const [priorityTab, setPriorityTab] = useState<string | null>(null)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const tabs = col.id === 'new' ? NEW_COL_TABS : col.id === 'urgent' ? URGENT_COL_TABS : col.id === 'done' ? DONE_COL_TABS : null
  const priorityTabs = col.id === 'urgent' ? URGENT_PRIORITY_TABS : null

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const sev = getSeverityStyle(a).label
      if (subTab) {
        if (subTab === 'fixed')   return a.workflowStatus !== 'ignored'
        if (subTab === 'ignored') return a.workflowStatus === 'ignored'
        if (subTab === 'critical' && sev !== 'CRITICAL') return false
        if (subTab !== 'critical' && sev !== subTab) return false
      }
      if (priorityTab && !matchesPriority(a, priorityTab)) return false
      return true
    })
  }, [alerts, subTab, priorityTab])

  const tabCounts = useMemo(() => {
    if (!tabs) return {}
    const counts: Record<string, number> = {}
    for (const a of alerts) {
      const sev = getSeverityStyle(a).label
      for (const t of tabs) {
        if (!t.key) continue
        const match = t.key === 'fixed'   ? a.workflowStatus !== 'ignored'
          : t.key === 'ignored' ? a.workflowStatus === 'ignored'
          : t.key === 'critical' ? sev === 'CRITICAL'
          : sev === t.key
        if (match) counts[t.key] = (counts[t.key] ?? 0) + 1
      }
    }
    return counts
  }, [alerts, tabs])

  const priorityCounts = useMemo(() => {
    if (!priorityTabs) return {}
    const counts: Record<string, number> = {}
    for (const a of alerts) {
      for (const t of priorityTabs) {
        if (!t.key) continue
        if (matchesPriority(a, t.key)) counts[t.key] = (counts[t.key] ?? 0) + 1
      }
    }
    return counts
  }, [alerts, priorityTabs])

  const groupedItems    = useMemo(() => groupAlerts(filteredAlerts), [filteredAlerts])
  const allGroupedItems = useMemo(() => groupAlerts(alerts), [alerts])
  const visible   = groupedItems.slice(0, visibleCount)
  const remaining = groupedItems.length - visibleCount

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(col.id) }}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: isDragOver ? col.bg : '#F8FAFC',
        border: `2px dashed ${isDragOver ? col.color : '#E2E8F0'}`,
        borderRadius: 8,
        padding: '12px 10px',
        transition: 'background 0.15s, border-color 0.15s',
        minHeight: 0,
      }}
    >
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: tabs ? 6 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{col.label}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{groupedItems.length}{(subTab || priorityTab) ? ` / ${allGroupedItems.length}` : ''}</span>
            {onDismissAll && filteredAlerts.length > 0 && (
              <button
                onClick={onDismissAll}
                title="Dismiss all confirmed dead sites"
                style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #E2E8F0', background: '#FEF2F2', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: '#DC2626', fontFamily: 'inherit' }}
              >
                Dismiss All
              </button>
            )}
            {filteredAlerts.length > 0 && (
              <button
                onClick={() => exportToCsv(filteredAlerts, col.label, subTab, priorityTab)}
                title="Export to CSV"
                style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 10, color: '#64748B', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                CSV
              </button>
            )}
          </div>
        </div>
        {col.sub && <div style={{ fontSize: 10, color: col.color, opacity: 0.7, paddingLeft: 14, marginTop: 2 }}>{col.sub}</div>}
        {tabs && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {tabs.filter(t => !('dropdown' in t && t.dropdown) && (t.key === null || (tabCounts[t.key] ?? 0) > 0)).map(t => (
              <button
                key={String(t.key)}
                onClick={() => setSubTab(subTab === t.key ? null : t.key)}
                style={{
                  padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                  borderColor: subTab === t.key ? col.color : '#E2E8F0',
                  background: subTab === t.key ? col.bg : 'white',
                  color: subTab === t.key ? col.color : '#6B7280',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}{t.key ? ` · ${tabCounts[t.key] ?? 0}` : ''}
              </button>
            ))}
            {col.id === 'new' && tabs.some(t => 'dropdown' in t && t.dropdown && (tabCounts[t.key!] ?? 0) > 0) && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setMoreOpen(o => !o)}
                  style={{
                    padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                    borderColor: (tabs.find(t => 'dropdown' in t && t.dropdown && t.key === subTab)) ? col.color : '#E2E8F0',
                    background: (tabs.find(t => 'dropdown' in t && t.dropdown && t.key === subTab)) ? col.bg : 'white',
                    color: (tabs.find(t => 'dropdown' in t && t.dropdown && t.key === subTab)) ? col.color : '#6B7280',
                    fontFamily: 'inherit',
                  }}
                >
                  {tabs.find(t => 'dropdown' in t && t.dropdown && t.key === subTab)?.label ?? 'More'} ▾
                </button>
                {moreOpen && (
                  <div
                    style={{ position: 'absolute', top: '110%', left: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 150, overflow: 'hidden' }}
                    onMouseLeave={() => setMoreOpen(false)}
                  >
                    <button onClick={() => { setSubTab(null); setMoreOpen(false) }}
                      style={{ width: '100%', padding: '7px 12px', background: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' }}>
                      Clear
                    </button>
                    {tabs.filter(t => 'dropdown' in t && t.dropdown && (tabCounts[t.key!] ?? 0) > 0).map(t => (
                      <button key={t.key} onClick={() => { setSubTab(t.key); setMoreOpen(false) }}
                        style={{ width: '100%', padding: '7px 12px', background: subTab === t.key ? col.bg : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: subTab === t.key ? col.color : '#374151', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t.label}</span>
                        <span style={{ color: '#94A3B8', fontWeight: 400 }}>{tabCounts[t.key!] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {priorityTabs && (
              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <button
                  onClick={() => setPriorityOpen(o => !o)}
                  style={{
                    padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                    borderColor: priorityTab ? '#7C3AED' : '#E2E8F0',
                    background: priorityTab ? '#EDE9FE' : 'white',
                    color: priorityTab ? '#7C3AED' : '#6B7280',
                    fontFamily: 'inherit',
                  }}
                >
                  {priorityTab ? URGENT_PRIORITY_TABS.find(t => t.key === priorityTab)?.label : 'Priority'} ▾
                </button>
                {priorityOpen && (
                  <div
                    style={{ position: 'absolute', top: '110%', right: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 140, overflow: 'hidden' }}
                    onMouseLeave={() => setPriorityOpen(false)}
                  >
                    <button onClick={() => { setPriorityTab(null); setPriorityOpen(false) }}
                      style={{ width: '100%', padding: '7px 12px', background: !priorityTab ? '#F8FAFC' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'left' }}>
                      All priorities
                    </button>
                    {priorityTabs.filter(t => t.key).map(t => (
                      <button key={t.key} onClick={() => { setPriorityTab(t.key); setPriorityOpen(false) }}
                        style={{ width: '100%', padding: '7px 12px', background: priorityTab === t.key ? '#EDE9FE' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: priorityTab === t.key ? '#7C3AED' : '#374151', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t.label}</span>
                        <span style={{ color: '#94A3B8', fontWeight: 400 }}>{priorityCounts[t.key!] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.map(item =>
          item.kind === 'group' ? (
            <GroupCard
              key={`group:${item.root}`}
              root={item.root}
              alerts={item.alerts}
              worstLabel={item.worstLabel}
              onDismissAll={() => onDismissGroup(item.alerts)}
              onSelect={() => onSelectGroup(item.root, item.alerts)}
            />
          ) : (
            <KanbanCard
              key={item.alert._id}
              alert={item.alert}
              col={col.id}
              onDragStart={onDragStart}
              isOverBefore={dragOverCard?.id === item.alert._id && dragOverCard?.pos === 'before'}
              isOverAfter={dragOverCard?.id === item.alert._id && dragOverCard?.pos === 'after'}
              onCardDragOver={onCardDragOver}
              onCardDragLeave={onCardDragLeave}
              onDismiss={onDismiss}
              onMarkDown={onMarkDown}
              onSelect={onSelect}
              onScreenshot={onScreenshot}
              isSelected={selectedAlertId === item.alert._id}
            />
          )
        )}
        {remaining > 0 && (
          <button
            onClick={onShowMore}
            style={{ width: '100%', padding: '8px 0', marginTop: 4, background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Show {Math.min(remaining, COL_PAGE)} more · {remaining} items left
          </button>
        )}
        {filteredAlerts.length === 0 && (
          <div style={{ textAlign: 'center', color: '#CBD5E1', fontSize: 12, paddingTop: 40 }}>Drop here</div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{children}</div>
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #F8FAFC' }}>
      <span style={{ fontSize: 11, color: '#94A3B8' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{value ?? '—'}</span>
    </div>
  )
}

const COUNTRY_CHECKS = [
  { code: 'us', flag: '🇺🇸', label: 'USA' },
  { code: 'gb', flag: '🇬🇧', label: 'UK' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'au', flag: '🇦🇺', label: 'AU' },
  { code: 'jp', flag: '🇯🇵', label: 'JP' },
  { code: 'br', flag: '🇧🇷', label: 'BR' },
  { code: 'ca', flag: '🇨🇦', label: 'CA' },
  { code: 'sg', flag: '🇸🇬', label: 'SG' },
  { code: 'ua', flag: '🇺🇦', label: 'UA' },
]

function AlertDrawer({ alert, onClose, onDismiss, onMarkDown }: {
  alert: DbAlert
  onClose: () => void
  onDismiss: (id: string) => void
  onMarkDown: (id: string) => void
}) {
  const st = getSeverityStyle(alert)
  const tip = getFixTip(st.label)
  const httpCode = getHttpCode(alert.message ?? '')
  const site = useQuery(getByDomainFn, { domain: alert.domain })
  const history = useQuery(siteHistoryFn, { siteId: alert.siteId })
  const lastReverify = useQuery(getLastReverifyLogFn, {})

  const checkFromCountry = useAction(checkDomainFromCountryFn)
  const [countryResults, setCountryResults] = useState<Record<string, { status: number; ms?: number } | 'loading' | 'error'>>({})

  async function handleCountryCheck(code: string) {
    setCountryResults(r => ({ ...r, [code]: 'loading' }))
    try {
      const res = await checkFromCountry({ domain: alert.domain, country: code })
      setCountryResults(r => ({ ...r, [code]: { status: res.httpStatus, ms: res.responseTimeMs } }))
    } catch {
      setCountryResults(r => ({ ...r, [code]: 'error' }))
    }
  }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: 400, height: '100vh', background: 'white', borderLeft: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 200, boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexShrink: 0, position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
        <div>
          <a href={`https://${alert.domain}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >{alert.domain} ↗</a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: st.bg, color: st.color }}>{st.label}</span>
            {httpCode && <span style={{ fontSize: 10, color: '#6B7280', background: '#F1F5F9', padding: '2px 6px', borderRadius: 3 }}>{httpCode}</span>}
            {site?.status && <span style={{ fontSize: 10, color: '#6B7280', background: '#F1F5F9', padding: '2px 6px', borderRadius: 3 }}>{site.status}</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0 }}>✕</button>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { onDismiss(alert._id); onClose() }}
            style={{ flex: 1, padding: '6px 0', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#065F46', cursor: 'pointer', fontFamily: 'inherit' }}>
            ✓ Working
          </button>
          <button onClick={() => { onMarkDown(alert._id); onClose() }}
            style={{ flex: 1, padding: '6px 0', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#991B1B', cursor: 'pointer', fontFamily: 'inherit' }}>
            ✗ Down
          </button>
        </div>

        {/* Alert message */}
        <div>
          <SectionLabel>Alert</SectionLabel>
          <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{alert.message}</div>
          {alert.subdomains && alert.subdomains.length > 0 && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>↳ {(alert.subdomains as string[]).join(', ')}</div>
          )}
          <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 3 }}>Created {formatRelTime(alert.createdAt)}</div>
        </div>

        {/* Availability — only rows with real values */}
        <div>
          <SectionLabel>Availability</SectionLabel>
          {site?.httpStatus != null && <MetaRow label="HTTP Status" value={site.httpStatus} />}
          {site?.responseTimeMs != null && <MetaRow label="Response Time" value={`${site.responseTimeMs}ms`} />}
          {site?.lastCheckedAt != null && <MetaRow label="Last Checked" value={formatRelTime(site.lastCheckedAt)} />}
          {site?.viaProxy != null && (
            <MetaRow
              label="Check Method"
              value={
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  background: site.viaProxy ? '#EDE9FE' : '#F0FDF4',
                  color: site.viaProxy ? '#6D28D9' : '#15803D' }}>
                  {site.viaProxy ? 'Via Bright Data Proxy' : 'Direct'}
                </span>
              }
            />
          )}
          {site?.redirectUrl && <MetaRow label="Redirects to" value={
            <span style={{ fontSize: 11, color: '#6366F1', wordBreak: 'break-all' }}>{site.redirectUrl}</span>
          } />}
          {site?.pageTitle && <MetaRow label="Page Title" value={
            <span style={{ fontSize: 11, color: '#374151', fontStyle: 'italic' }}>{site.pageTitle}</span>
          } />}
          {site?.isParked && <MetaRow label="Parked" value={
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#FEF3C7', color: '#92400E' }}>Yes</span>
          } />}
          {(site?.consecutiveFailures ?? 0) > 0 && <MetaRow label="Consecutive Failures" value={site.consecutiveFailures} />}
        </div>

        {/* SEO — only rows with real values */}
        {site && (site.dr || site.organicTraffic || site.audience || site.bounceRate || site.timeOnSite || site.mai || site.price) && (
          <div>
            <SectionLabel>SEO & Traffic</SectionLabel>
            {site.dr != null && <MetaRow label="Domain Rating" value={site.dr} />}
            {site.organicTraffic != null && <MetaRow label="Organic Traffic" value={site.organicTraffic.toLocaleString()} />}
            {site.audience != null && <MetaRow label="Audience" value={site.audience.toLocaleString()} />}
            {site.bounceRate != null && <MetaRow label="Bounce Rate" value={`${site.bounceRate}%`} />}
            {site.timeOnSite != null && <MetaRow label="Time on Site" value={`${site.timeOnSite}s`} />}
            {site.mai != null && <MetaRow label="MAI Score" value={site.mai} />}
            {site.price != null && <MetaRow label="Price" value={`$${site.price}`} />}
          </div>
        )}

        {/* AI analysis */}
        {(alert.aiCategory || alert.aiReason) && (
          <div>
            <SectionLabel>AI Analysis</SectionLabel>
            <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, borderLeft: '2px solid #6366F1' }}>
              {alert.aiCategory && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: alert.aiReason ? 4 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 }}>{alert.aiCategory.replace(/_/g, ' ')}</span>
                  {alert.aiPriority != null && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                      background: alert.aiPriority >= 70 ? '#FEE2E2' : alert.aiPriority >= 40 ? '#FEF3C7' : '#F0FDF4',
                      color:      alert.aiPriority >= 70 ? '#DC2626' : alert.aiPriority >= 40 ? '#92400E' : '#16A34A' }}>
                      P{alert.aiPriority}
                    </span>
                  )}
                </div>
              )}
              {alert.aiReason && <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>{alert.aiReason}</div>}
            </div>
          </div>
        )}

        {/* What to do */}
        <div>
          <SectionLabel>What to do</SectionLabel>
          <div style={{ padding: '8px 10px', background: '#FFFBEB', borderRadius: 6, border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 6 }}>{tip.title}</div>
            {tip.steps.map((s, i) => (
              <div key={i} style={{ fontSize: 11, color: '#78350F', lineHeight: 1.5, display: 'flex', gap: 6 }}>
                <span style={{ flexShrink: 0, color: '#D97706' }}>{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Check history */}
        {history && history.length > 0 && (
          <div>
            <SectionLabel>Recent Checks</SectionLabel>
            {history.slice(0, 5).map((h: any) => (
              <div key={h._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ fontSize: 11, color: h.statusAfter === 'Active' ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{h.statusAfter}</span>
                <span style={{ fontSize: 10, color: '#94A3B8' }}>{h.httpStatus ? `HTTP ${h.httpStatus}` : '—'}</span>
                <span style={{ fontSize: 10, color: '#CBD5E1' }}>{formatRelTime(h.checkedAt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Country IP checker */}
        <div>
          <SectionLabel>Check from Country</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {COUNTRY_CHECKS.map(({ code, flag, label }) => {
              const res = countryResults[code]
              const loading = res === 'loading'
              const ok = typeof res === 'object' && res.status >= 200 && res.status < 400
              const fail = res === 'error' || (typeof res === 'object' && (res.status === 0 || res.status >= 400))
              return (
                <button
                  key={code}
                  onClick={() => handleCountryCheck(code)}
                  disabled={loading}
                  title={typeof res === 'object' ? `HTTP ${res.status}${res.ms ? ` · ${res.ms}ms` : ''}` : ''}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: loading ? 'default' : 'pointer',
                    border: '1px solid',
                    background: loading ? '#F8FAFC' : ok ? '#D1FAE5' : fail ? '#FEE2E2' : '#F8FAFC',
                    borderColor: loading ? '#E2E8F0' : ok ? '#6EE7B7' : fail ? '#FECACA' : '#E2E8F0',
                    color: loading ? '#94A3B8' : ok ? '#065F46' : fail ? '#991B1B' : '#374151',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{flag}</span>
                  <span>{label}</span>
                  {loading && <span style={{ fontSize: 9 }}>…</span>}
                  {typeof res === 'object' && <span style={{ fontSize: 9, opacity: 0.7 }}>{res.status === 0 ? '✗' : res.status}</span>}
                </button>
              )
            })}
          </div>
          {Object.entries(countryResults).some(([, v]) => typeof v === 'object') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {COUNTRY_CHECKS.filter(c => typeof countryResults[c.code] === 'object').map(({ code, flag, label }) => {
                const res = countryResults[code] as { status: number; ms?: number }
                const ok = res.status >= 200 && res.status < 400
                return (
                  <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderRadius: 5, background: ok ? '#F0FDF4' : '#FFF5F5' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: ok ? '#16A34A' : '#DC2626' }}>{flag} {label}</span>
                    <span style={{ fontSize: 10, color: '#6B7280' }}>HTTP {res.status === 0 ? 'timeout' : res.status}{res.ms ? ` · ${res.ms}ms` : ''}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Last auto-reverify run */}
        {lastReverify && (
          <div>
            <SectionLabel>Last Reverify</SectionLabel>
            <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Auto-reverify run</span>
                <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatRelTime(lastReverify.startedAt)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {lastReverify.message?.match(/dismissed (\d+)/)?.[1] && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>
                    ✓ {lastReverify.message.match(/dismissed (\d+)/)[1]} dismissed
                  </span>
                )}
                {lastReverify.message?.match(/still dead (\d+)/)?.[1] && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>
                    ✗ {lastReverify.message.match(/still dead (\d+)/)[1]} still dead
                  </span>
                )}
              </div>
              {lastReverify.completedAt && (
                <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 5 }}>
                  Duration: {Math.round((lastReverify.completedAt - lastReverify.startedAt) / 60000)}m
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function GroupDrawer({ root, alerts, onClose, onDismissOne, onDismissAll }: {
  root: string
  alerts: DbAlert[]
  onClose: () => void
  onDismissOne: (id: string) => void
  onDismissAll: () => void
}) {
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: 420, height: '100vh', background: 'white', borderLeft: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', zIndex: 200, boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexShrink: 0, position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
        <div>
          <a href={`https://${root}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >{root} ↗</a>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{alerts.length} publisher paths affected</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0 }}>✕</button>
      </div>

      {/* Dismiss all */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <button
          onClick={() => { onDismissAll(); onClose() }}
          style={{ width: '100%', padding: '7px 0', background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#065F46', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ✓ Dismiss All {alerts.length} paths
        </button>
      </div>

      {/* Path list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {alerts.map(a => {
          const st = getSeverityStyle(a)
          const domain = a.domain ?? ''
          const pathPart = domain.slice(domain.indexOf('/'))
          return (
            <div key={a._id} style={{ padding: '9px 14px', borderBottom: '1px solid #F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', textDecoration: 'none', fontFamily: 'monospace', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                >{pathPart}</a>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{formatRelTime(a.createdAt)}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
              <button
                onClick={() => onDismissOne(a._id)}
                title="Dismiss this path"
                style={{ fontSize: 10, padding: '3px 8px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              >
                ✓
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AlertsPage({ onViewSite: _onViewSite }: Props) {
  const [httpFilter, setHttpFilter] = useState<string | null>(null)
  const [httpOpen, setHttpOpen] = useState(false)
  const [countryFilter, setCountryFilter] = useState<string | null>(null)
  const [countryOpen, setCountryOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedAlert, setSelectedAlert] = useState<DbAlert | null>(null)
  const [screenshotDomain, setScreenshotDomain] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<{ root: string; alerts: DbAlert[] } | null>(null)

  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{ total: number } | null>(null)
  const [reverting, setReverting] = useState(false)
  const [revertResult, setRevertResult] = useState<{ total: number } | null>(null)
  const [revertingCritical, setRevertingCritical] = useState(false)
  const [revertCriticalResult, setRevertCriticalResult] = useState<{ total: number } | null>(null)
  const [reverifying, setReverifying] = useState(false)
  const [reverifyResult, setReverifyResult] = useState<{ dismissed: number; stillDead: number } | null>(null)
  const [deduplicating, setDeduplicating] = useState(false)
  const [deduplicateResult, setDeduplicateResult] = useState<{ dismissed: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ working: number; dead: number; inProgress: number; ignored: number; notFound: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [prefixModal, setPrefixModal] = useState(false)
  const [prefixInput, setPrefixInput] = useState('')
  const [prefixAction, setPrefixAction] = useState<'working' | 'dead' | 'urgent'>('working')
  const [prefixResult, setPrefixResult] = useState<{ count: number; prefix: string } | null>(null)
  const [prefixLoading, setPrefixLoading] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<WorkflowCol | null>(null)
  const [dragOverCard, setDragOverCard] = useState<DragOverCard | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<WorkflowCol, string[]> | null>(null)
  const [colLimits, setColLimits] = useState<Record<WorkflowCol, number>>({ new: COL_PAGE, urgent: COL_PAGE, dead: COL_PAGE, done: COL_PAGE })
  const rafRef = useRef<number | null>(null)


  // Load each column independently — no shared limit
  const newAlertsLive        = useQuery(listByColumnFn, { workflowStatus: 'new',         limit: 16384 }) ?? []
  const urgentAlertsLive     = useQuery(listByColumnFn, { workflowStatus: 'urgent',       limit: 16384 }) ?? []
  const inProgressAlertsLive = useQuery(listByColumnFn, { workflowStatus: 'in_progress', limit: 16384 }) ?? []
  const doneAlertsLive       = useQuery(listByColumnFn, { workflowStatus: 'done',         limit: 16384 }) ?? []
  const ignoredAlertsLive    = useQuery(listByColumnFn, { workflowStatus: 'ignored',      limit: 16384 }) ?? []
  const deadAlertsLive       = useQuery(listByColumnFn, { workflowStatus: 'dead',         limit: 16384 }) ?? []

  const newAlerts        = useDeferredValue(newAlertsLive)
  const urgentAlerts     = useDeferredValue(urgentAlertsLive)
  const inProgressAlerts = useDeferredValue(inProgressAlertsLive)  // merged into urgent below
  const doneAlerts       = useDeferredValue(useMemo(() => [...doneAlertsLive, ...ignoredAlertsLive], [doneAlertsLive, ignoredAlertsLive]))
  const deadAlerts       = useDeferredValue(deadAlertsLive)


  function showMoreInCol(colId: WorkflowCol) {
    setColLimits(prev => ({ ...prev, [colId]: prev[colId] + COL_PAGE }))
  }
  const resetColLimits = useCallback(() => {
    setColLimits({ new: COL_PAGE, urgent: COL_PAGE, dead: COL_PAGE, done: COL_PAGE })
  }, [])


  const migrateDeadAlerts = useAction(migrateDeadAlertsFn)
  const revertBlockedFromDead  = useAction(revertBlockedFromDeadFn)
  const revertCriticalFromDead = useAction(revertCriticalFromDeadFn)
  const startReverifyAll = useAction(startReverifyAllFn)
  const deduplicateAlerts = useAction(deduplicateAlertsFn)
  const bulkUpdate = useMutation(bulkUpdateFn)
  const bulkPrefix = useMutation(bulkPrefixFn)
  const updateWorkflow = useMutation(updateWorkflowFn)
  const dismissAlert = useMutation(dismissAlertFn)
  const markBotBlockedDown = useMutation(markBotBlockedDownFn)

  async function handleMigrateDead() {
    setMigrating(true)
    setMigrateResult(null)
    try {
      const r = await migrateDeadAlerts({})
      setMigrateResult(r)
    } catch { /* ignore */ }
    setMigrating(false)
  }

  async function handleRevertCritical() {
    setRevertingCritical(true)
    setRevertCriticalResult(null)
    try {
      const r = await revertCriticalFromDead({})
      setRevertCriticalResult(r)
    } finally {
      setRevertingCritical(false)
    }
  }

  async function handleRevertBlocked() {
    setReverting(true)
    setRevertResult(null)
    try {
      const r = await revertBlockedFromDead({})
      setRevertResult(r)
    } catch { /* ignore */ }
    setReverting(false)
  }

  const handleDismissOne = useCallback((id: string) => {
    dismissAlert({ alertId: id as ConvexId })
  }, [dismissAlert])

  const handleDismissAllDead = useCallback(async () => {
    const ids = deadAlertsLive.map((a: DbAlert) => a._id)
    for (let i = 0; i < ids.length; i += 20) {
      await Promise.all(ids.slice(i, i + 20).map((id: string) => dismissAlert({ alertId: id as ConvexId })))
    }
  }, [deadAlertsLive, dismissAlert])

  const handleMarkDown = useCallback((id: string) => {
    markBotBlockedDown({ alertId: id as ConvexId })
  }, [markBotBlockedDown])

  const handleDismissGroup = useCallback((alerts: DbAlert[]) => {
    for (const a of alerts) dismissAlert({ alertId: a._id as ConvexId })
    setSelectedGroup(null)
  }, [dismissAlert])

  async function handleReverify() {
    setReverifying(true)
    setReverifyResult(null)
    try {
      await startReverifyAll({})
      setReverifyResult({ dismissed: -1, stillDead: 0 }) // -1 = "started" sentinel
    } catch { /* ignore */ }
    setReverifying(false)
  }

  async function handleDeduplicate() {
    setDeduplicating(true)
    setDeduplicateResult(null)
    try {
      const r = await deduplicateAlerts({})
      setDeduplicateResult(r)
    } catch { /* ignore */ }
    setDeduplicating(false)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setImporting(true)
    setImportResult(null)

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) { setImporting(false); return }

    // Detect column indices from header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"(.*)"$/, '$1'))
    const domainIdx  = header.findIndex(h => h === 'domain')
    const actionIdx  = header.findIndex(h => h === 'action')
    if (domainIdx === -1 || actionIdx === -1) { setImporting(false); alert('CSV must have "domain" and "action" columns'); return }

    const updates: { domain: string; action: string }[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      const domain = cols[domainIdx]
      const action = cols[actionIdx]
      if (domain && action) updates.push({ domain, action })
    }

    const BATCH = 200
    const totals = { working: 0, dead: 0, inProgress: 0, ignored: 0, notFound: 0 }
    for (let i = 0; i < updates.length; i += BATCH) {
      try {
        const r = await bulkUpdate({ updates: updates.slice(i, i + BATCH) })
        totals.working    += r.working
        totals.dead       += r.dead
        totals.inProgress += r.inProgress
        totals.ignored    += r.ignored
        totals.notFound   += r.notFound
      } catch { /* continue */ }
    }

    setImportResult(totals)
    setImporting(false)
  }

  async function handlePrefixBulk() {
    if (!prefixInput.trim()) return
    setPrefixLoading(true)
    setPrefixResult(null)
    try {
      const r = await bulkPrefix({ prefix: prefixInput.trim().toLowerCase(), action: prefixAction })
      setPrefixResult(r)
      setPrefixModal(false)
      setPrefixInput('')
    } catch { /* ignore */ }
    setPrefixLoading(false)
  }

  // Throttled drag-over to avoid re-rendering 500 cards on every mouse pixel
  const handleCardDragOver = useCallback((id: string, pos: 'before' | 'after') => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      setDragOverCard(prev => prev?.id === id && prev?.pos === pos ? prev : { id, pos })
    })
  }, [])
  const handleCardDragLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setDragOverCard(null)
  }, [])


  // Filter function applied per column
  function applyFilters(list: DbAlert[]) {
    return list.filter(a => {
      const msg = (a.message ?? '').toLowerCase()
      if (httpFilter && !msg.includes(httpFilter)) return false
      if (countryFilter && getDomainTLD(a.domain ?? '') !== countryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!a.domain?.toLowerCase().includes(q) && !msg.includes(q)) return false
      }
      return true
    })
  }

  const byCol = useMemo(() => ({
    new:    applyFilters(newAlerts),
    urgent: applyFilters([...urgentAlerts, ...inProgressAlerts]),
    dead:   applyFilters(deadAlerts),
    done:   applyFilters(doneAlerts),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [newAlerts, urgentAlerts, inProgressAlerts, doneAlerts, deadAlerts, httpFilter, countryFilter, search])

  // Apply local ordering on top of server grouping
  const displayCols = useMemo(() => {
    if (!localOrder) {
      return { new: byCol.new, urgent: byCol.urgent, dead: byCol.dead, done: byCol.done }
    }
    const allAlerts = new Map<string, DbAlert>()
    for (const c of COLUMNS.map(c => c.id)) {
      for (const a of byCol[c]) allAlerts.set(a._id, a)
    }
    const placedIds = new Set(Object.values(localOrder).flat())
    const cols: Record<WorkflowCol, DbAlert[]> = { new: [], urgent: [], dead: [], done: [] }
    for (const colId of COLUMNS.map(c => c.id)) {
      const ordered = localOrder[colId].filter(id => allAlerts.has(id)).map(id => allAlerts.get(id)!)
      const overflow = byCol[colId].filter((a: DbAlert) => !placedIds.has(a._id))
      cols[colId] = [...ordered, ...overflow]
    }
    return cols
  }, [byCol, localOrder])

  async function handleDrop(targetCol: WorkflowCol) {
    if (!dragId) return
    setDragOver(null)

    // Find source column
    const sourceCol = COLUMNS.map(c => c.id).find(col =>
      displayCols[col].some((a: DbAlert) => a._id === dragId)
    ) ?? 'new'

    // Compute insert position in target column
    const targetList = displayCols[targetCol].filter((a: DbAlert) => a._id !== dragId).map((a: DbAlert) => a._id)
    if (dragOverCard) {
      const idx = displayCols[targetCol].findIndex((a: DbAlert) => a._id === dragOverCard.id)
      const insertAt = dragOverCard.pos === 'after' ? idx + 1 : idx
      // adjust for removed dragId
      const dragIdxInTarget = displayCols[targetCol].findIndex((a: DbAlert) => a._id === dragId)
      const adj = dragIdxInTarget !== -1 && dragIdxInTarget < insertAt ? insertAt - 1 : insertAt
      targetList.splice(Math.max(0, adj), 0, dragId)
    } else {
      targetList.unshift(dragId)
    }

    // Build new local order (remove dragId from all, set target)
    const newLocalOrder: Record<WorkflowCol, string[]> = {
      new:    displayCols.new.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
      urgent: displayCols.urgent.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
      dead:   displayCols.dead.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
      done:   displayCols.done.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
    }
    newLocalOrder[targetCol] = targetList
    setLocalOrder(newLocalOrder)
    setDragOverCard(null)
    setDragId(null)

    // Persist column change to DB
    if (sourceCol !== targetCol) {
      await updateWorkflow({ alertId: dragId as ConvexId, workflowStatus: targetCol })
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header — sticky */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', background: 'white', borderBottom: '1px solid #E2E8F0', flexShrink: 0, flexWrap: 'wrap' as const }}>
        {/* HTTP code filter dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setHttpOpen(o => !o)}
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: httpFilter ? '#DC2626' : '#E2E8F0', background: httpFilter ? '#FEE2E2' : 'white', color: httpFilter ? '#DC2626' : '#374151', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {httpFilter ? HTTP_FILTERS.find(f => f.code === httpFilter)?.label ?? 'HTTP Code' : 'HTTP Code'} ▾
          </button>
          {httpOpen && (
            <div
              style={{ position: 'absolute', top: '110%', left: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 150, overflow: 'hidden' }}
              onMouseLeave={() => setHttpOpen(false)}
            >
              <button
                onClick={() => { setHttpFilter(null); setHttpOpen(false); resetColLimits() }}
                style={{ width: '100%', padding: '8px 14px', background: !httpFilter ? '#F8FAFC' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'left' }}
              >
                All codes
              </button>
              {HTTP_FILTERS.map(f => (
                <button
                  key={f.code}
                  onClick={() => { setHttpFilter(f.code); setHttpOpen(false); resetColLimits() }}
                  style={{ width: '100%', padding: '8px 14px', background: httpFilter === f.code ? '#FEE2E2' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: httpFilter === f.code ? '#DC2626' : '#374151', textAlign: 'left' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Country (TLD) filter */}
        {(() => {
          const allDomains = [...newAlertsLive, ...urgentAlertsLive, ...deadAlertsLive, ...doneAlertsLive, ...ignoredAlertsLive]
          const tldCounts: Record<string, number> = {}
          for (const a of allDomains) {
            const tld = getDomainTLD(a.domain ?? '')
            if (tld && TLD_FLAG[tld]) tldCounts[tld] = (tldCounts[tld] ?? 0) + 1
          }
          const tlds = Object.entries(tldCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)
          if (tlds.length === 0) return null
          const activeFlag = countryFilter ? TLD_FLAG[countryFilter] : null
          return (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setCountryOpen(o => !o)}
                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: countryFilter ? '#2563EB' : '#E2E8F0', background: countryFilter ? '#EFF6FF' : 'white', color: countryFilter ? '#2563EB' : '#374151', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {activeFlag ? `${activeFlag} .${countryFilter}` : 'Country'} ▾
              </button>
              {countryOpen && (
                <div
                  style={{ position: 'absolute', top: '110%', left: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 150, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}
                  onMouseLeave={() => setCountryOpen(false)}
                >
                  <button
                    onClick={() => { setCountryFilter(null); setCountryOpen(false); resetColLimits() }}
                    style={{ width: '100%', padding: '8px 14px', background: !countryFilter ? '#F8FAFC' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'left' }}
                  >
                    All countries
                  </button>
                  {tlds.map(([tld, count]) => (
                    <button
                      key={tld}
                      onClick={() => { setCountryFilter(tld); setCountryOpen(false); resetColLimits() }}
                      style={{ width: '100%', padding: '8px 14px', background: countryFilter === tld ? '#EFF6FF' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: countryFilter === tld ? '#2563EB' : '#374151', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span>{TLD_FLAG[tld]} .{tld}</span>
                      <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400 }}>{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* Search */}
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); resetColLimits() }}
          placeholder="Search domain…"
          style={{ flex: 1, minWidth: 120, maxWidth: 220, padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 16, fontSize: 12, outline: 'none', fontFamily: 'inherit', background: 'white' }}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {reverifyResult && (
            <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 500 }}>
              {reverifyResult.dismissed === -1 ? '🔄 Reverify started in background…' : `✓ ${reverifyResult.dismissed} removed`}
            </span>
          )}
          {deduplicateResult && (
            <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 500 }}>
              ✓ {deduplicateResult.dismissed} dupes dismissed
            </span>
          )}
          {importResult && (
            <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>
              ↑ {importResult.working}w · {importResult.dead}d · {importResult.inProgress}ip · {importResult.ignored}ign · {importResult.notFound} miss
            </span>
          )}
          {migrateResult && (
            <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>
              ✓ {migrateResult.total.toLocaleString()} → Dead
            </span>
          )}
          {revertResult && (
            <span style={{ fontSize: 11, color: '#D97706', fontWeight: 500 }}>
              ↩ {revertResult.total.toLocaleString()} → Urgent
            </span>
          )}
          {revertCriticalResult && (
            <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 500 }}>
              ↩ {revertCriticalResult.total.toLocaleString()} Critical → Urgent
            </span>
          )}
          <button
            onClick={handleMigrateDead}
            disabled={migrating || reverting || revertingCritical}
            style={{ padding: '5px 12px', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: migrating ? 'default' : 'pointer', opacity: migrating ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {migrating ? 'Moving…' : '💀 Move Dead'}
          </button>
          <button
            onClick={handleRevertBlocked}
            disabled={reverting || migrating || revertingCritical}
            style={{ padding: '5px 12px', background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: reverting ? 'default' : 'pointer', opacity: reverting ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {reverting ? 'Reverting…' : '↩ Fix Blocked'}
          </button>
          <button
            onClick={handleRevertCritical}
            disabled={revertingCritical || migrating || reverting}
            style={{ padding: '5px 12px', background: '#FFF1F2', color: '#BE123C', border: '1px solid #FECDD3', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: revertingCritical ? 'default' : 'pointer', opacity: revertingCritical ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {revertingCritical ? 'Moving…' : '🚨 Fix Critical'}
          </button>
          <button
            onClick={handleReverify}
            disabled={reverifying}
            style={{ padding: '5px 12px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: reverifying ? 'default' : 'pointer', opacity: reverifying ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {reverifying ? 'Starting…' : '🔄 Re-verify All'}
          </button>
          <button
            onClick={handleDeduplicate}
            disabled={deduplicating}
            style={{ padding: '5px 12px', background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: deduplicating ? 'default' : 'pointer', opacity: deduplicating ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {deduplicating ? 'Deduping…' : '🔁 Dedup'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{ padding: '5px 12px', background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {importing ? 'Importing…' : '↑ Import CSV'}
          </button>
          {prefixResult && (
            <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 500 }}>
              ✓ {prefixResult.count} updated ({prefixResult.prefix}*)
            </span>
          )}
          <button
            onClick={() => setPrefixModal(true)}
            style={{ padding: '5px 12px', background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ⚡ Bulk by Domain
          </button>
        </div>
      </div>

      {/* Bulk by prefix modal */}
      {prefixModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'white', borderRadius: 12, width: 440, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Bulk Update by Domain Prefix</div>
              <button onClick={() => setPrefixModal(false)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: '#F1F5F9', borderRadius: 6, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}>✕</button>
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Domain prefix</label>
            <input
              value={prefixInput}
              onChange={e => setPrefixInput(e.target.value)}
              placeholder="e.g. patch.com"
              autoFocus
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#1E293B', marginBottom: 14, boxSizing: 'border-box' as const }}
            />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Action</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {(['working', 'dead', 'urgent'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => setPrefixAction(a)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `2px solid ${prefixAction === a ? '#7C3AED' : '#E2E8F0'}`, background: prefixAction === a ? '#F5F3FF' : 'white', color: prefixAction === a ? '#7C3AED' : '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {a === 'working' ? '✓ Working' : a === 'dead' ? '✗ Dead' : '⚠ Urgent'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#6B7280', marginBottom: 16 }}>
              Оновить всі алерти де домен починається з "{prefixInput || '...'}"
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPrefixModal(false)} style={{ padding: '8px 16px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                onClick={handlePrefixBulk}
                disabled={prefixLoading || !prefixInput.trim()}
                style={{ padding: '8px 20px', background: '#7C3AED', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: prefixLoading || !prefixInput.trim() ? 'default' : 'pointer', opacity: prefixLoading || !prefixInput.trim() ? 0.7 : 1, fontFamily: 'inherit' }}
              >
                {prefixLoading ? 'Updating…' : 'Update All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'stretch', padding: '16px 24px', overflow: 'hidden' }}>
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.id}
            col={col}
            alerts={displayCols[col.id]}
            visibleCount={colLimits[col.id]}
            onShowMore={() => showMoreInCol(col.id)}
            onDrop={handleDrop}
            isDragOver={dragOver === col.id}
            onDragOver={() => setDragOver(col.id)}
            onDragLeave={() => setDragOver(null)}
            onDragStart={setDragId}
            dragOverCard={dragOverCard}
            onCardDragOver={handleCardDragOver}
            onCardDragLeave={handleCardDragLeave}
            onDismiss={handleDismissOne}
            onMarkDown={handleMarkDown}
            onSelect={setSelectedAlert}
            onDismissAll={col.id === 'dead' ? handleDismissAllDead : undefined}
            onScreenshot={setScreenshotDomain}
            onSelectGroup={(root, grpAlerts) => setSelectedGroup({ root, alerts: grpAlerts })}
            onDismissGroup={handleDismissGroup}
            selectedAlertId={selectedAlert?._id}
          />
        ))}
      </div>

      {/* Overlay drawer */}
      {selectedAlert && (
        <AlertDrawer
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onDismiss={handleDismissOne}
          onMarkDown={handleMarkDown}
        />
      )}

      {/* Group drawer */}
      {selectedGroup && (
        <GroupDrawer
          root={selectedGroup.root}
          alerts={selectedGroup.alerts}
          onClose={() => setSelectedGroup(null)}
          onDismissOne={handleDismissOne}
          onDismissAll={() => handleDismissGroup(selectedGroup.alerts)}
        />
      )}

      {/* Screenshot modal */}
      {screenshotDomain && (
        <ScreenshotModal domain={screenshotDomain} onClose={() => setScreenshotDomain(null)} />
      )}
    </div>
  )
}

function ScreenshotModal({ domain, onClose }: { domain: string; onClose: () => void }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    setImgUrl(null)
    fetch(`/api/screenshot?url=${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then(d => {
        if (d.url) { setImgUrl(d.url) }
        else { setError(true) }
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [domain])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, width: '80vw', maxWidth: 1000, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>📸 {domain}</span>
            <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6366F1', textDecoration: 'none' }}>↗ Open</a>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 18, lineHeight: 1, padding: 2 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, padding: 16 }}>
          {loading && <div style={{ fontSize: 13, color: '#94A3B8' }}>Taking screenshot…</div>}
          {error && <div style={{ fontSize: 13, color: '#DC2626' }}>Screenshot failed. The site may be blocking automated access.</div>}
          {imgUrl && (
            <img
              src={imgUrl}
              alt={`Screenshot of ${domain}`}
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', display: 'block' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
