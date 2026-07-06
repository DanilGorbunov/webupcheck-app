import { useState, useMemo, useCallback, useRef, memo, useDeferredValue, useEffect } from 'react'
import { useQuery, useMutation, useAction } from 'convex/react'
import { makeFunctionReference } from 'convex/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSite = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbAlert = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConvexId = any

const listAlertsFn          = makeFunctionReference<'query',    { dismissed?: boolean; limit?: number }, DbAlert[]>('sites:listAlerts')
const listByColumnFn        = makeFunctionReference<'query',    { workflowStatus: string; limit?: number }, DbAlert[]>('sites:listAlertsByColumn')
const countAlertsFn         = makeFunctionReference<'query',    { dismissed?: boolean }, number>('sites:countAlerts')
const alertStatsFn          = makeFunctionReference<'action',   Record<string, never>, { total: number; dead: number; critical: number; warning: number; http0: number; http404: number; http403: number; http429: number; http5xx: number; redirect: number; parked: number }>('sites:alertStats')
const dismissAllFn          = makeFunctionReference<'mutation', Record<string, never>, number>('sites:dismissAllAlerts')
const reverifyAlertsFn      = makeFunctionReference<'action',   Record<string, never>, { dismissed: number; stillDead: number; total: number }>('checker:reverifyAlerts')
const updateWorkflowFn      = makeFunctionReference<'mutation', { alertId: ConvexId; workflowStatus: string }, void>('sites:updateAlertWorkflow')
const dismissAlertFn        = makeFunctionReference<'mutation', { alertId: ConvexId }, void>('sites:dismissAlert')
const markBotBlockedDownFn  = makeFunctionReference<'mutation', { alertId: ConvexId }, void>('sites:markBotBlockedAsDown')

interface Props { onViewSite: (s: DbSite) => void }

type WorkflowCol = 'new' | 'urgent' | 'in_progress' | 'done'

const COLUMNS: { id: WorkflowCol; label: string; color: string; bg: string; sub?: string }[] = [
  { id: 'new',         label: 'New',              color: '#64748B', bg: '#F8FAFC' },
  { id: 'urgent',      label: 'Urgent',           color: '#DC2626', bg: '#FFF5F5', sub: 'Dead / Critical' },
  { id: 'in_progress', label: 'In Progress',      color: '#D97706', bg: '#FFFBEB' },
  { id: 'done',        label: 'Fixed & Ignored',  color: '#16A34A', bg: '#F0FDF4' },
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
  const dead = (a.message ?? '').toLowerCase().includes('http 0') || (a.message ?? '').toLowerCase().includes('consecutive')
  if (dead) return { label: 'DEAD', color: '#DC2626', bg: '#FEE2E2', border: '#DC2626' }
  if (a.severity === 'critical') return { label: 'CRITICAL', color: '#DC2626', bg: '#FEE2E2', border: '#DC2626' }
  if (a.severity === 'warning') return { label: 'WARNING', color: '#92400E', bg: '#FEF3C7', border: '#D97706' }
  return { label: 'INFO', color: '#1D4ED8', bg: '#DBEAFE', border: '#2563EB' }
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

const KanbanCard = memo(function KanbanCard({ alert, onDragStart, onViewSite, col, isOverBefore, isOverAfter, onCardDragOver, onCardDragLeave, onDismiss, onMarkDown }: {
  alert: DbAlert
  onDragStart: (id: string) => void
  onViewSite: (s: DbSite) => void
  col?: WorkflowCol
  isOverBefore: boolean
  isOverAfter: boolean
  onDismiss: (id: string) => void
  onMarkDown: (id: string) => void
  onCardDragOver: (id: string, pos: 'before' | 'after') => void
  onCardDragLeave: () => void
}) {
  const st = getSeverityStyle(alert)
  const httpCode = getHttpCode(alert.message ?? '')
  const doneTag = col === 'done'
    ? (alert.workflowStatus === 'ignored' ? 'Ignored' : 'Fixed')
    : null

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
        style={{
          background: 'white',
          border: `1px solid #E2E8F0`,
          borderLeft: `3px solid ${st.border}`,
          borderRadius: 6,
          padding: '10px 12px',
          marginBottom: 6,
          cursor: 'grab',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
          <a
            href={`https://${alert.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', textDecoration: 'none', lineHeight: 1.3 }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            onClick={e => e.stopPropagation()}
          >
            {alert.domain}
          </a>
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
        </div>
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
                onClick={e => e.stopPropagation()}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatRelTime(alert.createdAt)}</span>
          <button
            onClick={() => onViewSite({ _id: alert.siteId, domain: alert.domain })}
            style={{ fontSize: 10, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            View →
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
  { key: null,       label: 'All' },
  { key: 'http 403', label: 'HTTP 403' },
  { key: 'http 404', label: 'HTTP 404' },
  { key: 'http 5',   label: 'HTTP 5xx' },
  { key: 'redirect', label: 'Redirect' },
  { key: 'park',     label: 'Parked' },
]

const URGENT_COL_TABS = [
  { key: null,       label: 'All' },
  { key: 'dead',     label: 'DEAD' },
  { key: 'critical', label: 'CRITICAL' },
]

function KanbanColumn({ col, alerts, visibleCount, onShowMore, onDrop, onViewSite, isDragOver, onDragOver, onDragLeave, onDragStart, dragOverCard, onCardDragOver, onCardDragLeave, onDismiss, onMarkDown }: {
  col: typeof COLUMNS[0]
  alerts: DbAlert[]
  visibleCount: number
  onShowMore: () => void
  onDrop: (colId: WorkflowCol) => void
  onViewSite: (s: DbSite) => void
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDragStart: (id: string) => void
  dragOverCard: DragOverCard | null
  onCardDragOver: (id: string, pos: 'before' | 'after') => void
  onCardDragLeave: () => void
  onDismiss: (id: string) => void
  onMarkDown: (id: string) => void
}) {
  const [subTab, setSubTab] = useState<string | null>(null)

  const tabs = col.id === 'new' ? NEW_COL_TABS : col.id === 'urgent' ? URGENT_COL_TABS : null

  const filteredAlerts = useMemo(() => {
    if (!subTab) return alerts
    return alerts.filter(a => {
      const m = (a.message ?? '').toLowerCase()
      const sev = getSeverityStyle(a).label.toLowerCase()
      if (subTab === 'dead') return sev === 'dead'
      if (subTab === 'critical') return sev === 'critical'
      return m.includes(subTab)
    })
  }, [alerts, subTab])

  const tabCounts = useMemo(() => {
    if (!tabs) return {}
    const counts: Record<string, number> = {}
    for (const a of alerts) {
      const m = (a.message ?? '').toLowerCase()
      const sev = getSeverityStyle(a).label.toLowerCase()
      for (const t of tabs) {
        if (!t.key) continue
        const match = t.key === 'dead' ? sev === 'dead'
          : t.key === 'critical' ? sev === 'critical'
          : m.includes(t.key)
        if (match) counts[t.key] = (counts[t.key] ?? 0) + 1
      }
    }
    return counts
  }, [alerts, tabs])

  const visible = filteredAlerts.slice(0, visibleCount)
  const remaining = filteredAlerts.length - visibleCount

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: tabs ? 8 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{col.label}</span>
          <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>{filteredAlerts.length}{subTab ? ` / ${alerts.length}` : ''}</span>
        </div>
        {col.sub && <div style={{ fontSize: 10, color: col.color, opacity: 0.7, paddingLeft: 14, marginTop: 2 }}>{col.sub}</div>}
        {tabs && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
            {tabs.filter(t => t.key === null || (tabCounts[t.key] ?? 0) > 0).map(t => (
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
          </div>
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.map(a => (
          <KanbanCard
            key={a._id}
            alert={a}
            col={col.id}
            onDragStart={onDragStart}
            onViewSite={onViewSite}
            isOverBefore={dragOverCard?.id === a._id && dragOverCard?.pos === 'before'}
            isOverAfter={dragOverCard?.id === a._id && dragOverCard?.pos === 'after'}
            onCardDragOver={onCardDragOver}
            onCardDragLeave={onCardDragLeave}
            onDismiss={onDismiss}
            onMarkDown={onMarkDown}
          />
        ))}
        {remaining > 0 && (
          <button
            onClick={onShowMore}
            style={{ width: '100%', padding: '8px 0', marginTop: 4, background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Show {Math.min(remaining, COL_PAGE)} more · {remaining} left
          </button>
        )}
        {filteredAlerts.length === 0 && (
          <div style={{ textAlign: 'center', color: '#CBD5E1', fontSize: 12, paddingTop: 40 }}>Drop here</div>
        )}
      </div>
    </div>
  )
}

export function AlertsPage({ onViewSite }: Props) {
  const [httpFilter, setHttpFilter] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)
  const [severityOpen, setSeverityOpen] = useState(false)
  const [search, setSearch] = useState('')

  const [reverifying, setReverifying] = useState(false)
  const [reverifyResult, setReverifyResult] = useState<{ dismissed: number; stillDead: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<WorkflowCol | null>(null)
  const [dragOverCard, setDragOverCard] = useState<DragOverCard | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<WorkflowCol, string[]> | null>(null)
  const [colLimits, setColLimits] = useState<Record<WorkflowCol, number>>({ new: COL_PAGE, urgent: COL_PAGE, in_progress: COL_PAGE, done: COL_PAGE })
  const rafRef = useRef<number | null>(null)

  const totalAlertCount = useQuery(countAlertsFn, { dismissed: false }) ?? null
  const runAlertStats = useAction(alertStatsFn)
  const [backendStats, setBackendStats] = useState<{ total: number; dead: number; critical: number; warning: number; http0: number; http404: number; http403: number; http429: number; http5xx: number; redirect: number; parked: number } | null>(null)

  // Load each column independently — no shared limit
  const newAlertsLive       = useQuery(listByColumnFn, { workflowStatus: 'new',         limit: 16384 }) ?? []
  const urgentAlertsLive    = useQuery(listByColumnFn, { workflowStatus: 'urgent',       limit: 16384 }) ?? []
  const inProgressAlertsLive = useQuery(listByColumnFn, { workflowStatus: 'in_progress', limit: 16384 }) ?? []
  const doneAlertsLive      = useQuery(listByColumnFn, { workflowStatus: 'done',         limit: 16384 }) ?? []

  const newAlerts       = useDeferredValue(newAlertsLive)
  const urgentAlerts    = useDeferredValue(urgentAlertsLive)
  const inProgressAlerts = useDeferredValue(inProgressAlertsLive)
  const doneAlerts      = useDeferredValue(doneAlertsLive)

  const alertsLive = useQuery(listAlertsFn, { dismissed: false, limit: 500 }) ?? []
  const alerts = useDeferredValue(alertsLive)

  function showMoreInCol(colId: WorkflowCol) {
    setColLimits(prev => ({ ...prev, [colId]: prev[colId] + COL_PAGE }))
  }
  const resetColLimits = useCallback(() => {
    setColLimits({ new: COL_PAGE, urgent: COL_PAGE, in_progress: COL_PAGE, done: COL_PAGE })
  }, [])

  useEffect(() => {
    runAlertStats({}).then(setBackendStats).catch(() => {})
  }, [])

  const dismissAll = useMutation(dismissAllFn)
  const reverifyAlerts = useAction(reverifyAlertsFn)
  const updateWorkflow = useMutation(updateWorkflowFn)
  const dismissAlert = useMutation(dismissAlertFn)
  const markBotBlockedDown = useMutation(markBotBlockedDownFn)

  const handleDismissOne = useCallback((id: string) => {
    dismissAlert({ alertId: id as ConvexId })
  }, [dismissAlert])

  const handleMarkDown = useCallback((id: string) => {
    markBotBlockedDown({ alertId: id as ConvexId })
  }, [markBotBlockedDown])

  async function handleReverify() {
    setReverifying(true)
    setReverifyResult(null)
    try {
      const r = await reverifyAlerts({})
      setReverifyResult(r)
    } catch { /* ignore */ }
    setReverifying(false)
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

  // Count by HTTP code for header filters
  const { codeCounts, deadCount, criticalCount, warningCount } = useMemo(() => {
    if (backendStats) {
      const codeCounts: Record<string, number> = {
        'http 0':   backendStats.http0,
        'http 403': backendStats.http403,
        'http 404': backendStats.http404,
        'http 429': backendStats.http429,
        'http 5':   backendStats.http5xx,
        'redirect': backendStats.redirect,
        'park':     backendStats.parked,
      }
      return { codeCounts, deadCount: backendStats.dead, criticalCount: backendStats.critical, warningCount: backendStats.warning }
    }
    const codeCounts: Record<string, number> = {}
    let dead = 0, critical = 0, warning = 0
    for (const a of alerts) {
      const msg = (a.message ?? '').toLowerCase()
      const filter = HTTP_FILTERS.find(f => msg.includes(f.code))
      if (filter) codeCounts[filter.code] = (codeCounts[filter.code] ?? 0) + 1
      const lbl = getSeverityStyle(a).label
      if (lbl === 'DEAD') dead++
      else if (lbl === 'CRITICAL') critical++
      else if (lbl === 'WARNING') warning++
    }
    return { codeCounts, deadCount: dead, criticalCount: critical, warningCount: warning }
  }, [alerts, backendStats])

  // Filter function applied per column
  function applyFilters(list: DbAlert[]) {
    return list.filter(a => {
      const msg = (a.message ?? '').toLowerCase()
      if (httpFilter && !msg.includes(httpFilter)) return false
      if (severityFilter) {
        const label = getSeverityStyle(a).label
        if (severityFilter === 'dead' && label !== 'DEAD') return false
        if (severityFilter === 'critical' && label !== 'CRITICAL') return false
        if (severityFilter === 'warning' && label !== 'WARNING') return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!a.domain?.toLowerCase().includes(q) && !msg.includes(q)) return false
      }
      return true
    })
  }

  const byCol = useMemo(() => ({
    new:         applyFilters(newAlerts),
    urgent:      applyFilters(urgentAlerts),
    in_progress: applyFilters(inProgressAlerts),
    done:        applyFilters(doneAlerts),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [newAlerts, urgentAlerts, inProgressAlerts, doneAlerts, httpFilter, severityFilter, search])

  // Apply local ordering on top of server grouping
  const displayCols = useMemo(() => {
    const cols: Record<WorkflowCol, DbAlert[]> = { new: [], urgent: [], in_progress: [], done: [] }
    for (const colId of COLUMNS.map(c => c.id)) {
      if (!localOrder) {
        cols[colId] = byCol[colId]
      } else {
        const alertMap = new Map(byCol[colId].map((a: DbAlert) => [a._id, a]))
        const ordered = localOrder[colId].filter(id => alertMap.has(id)).map(id => alertMap.get(id)!)
        const newOnes = byCol[colId].filter((a: DbAlert) => !localOrder[colId].includes(a._id))
        cols[colId] = [...ordered, ...newOnes]
      }
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
      new:         displayCols.new.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
      urgent:      displayCols.urgent.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
      in_progress: displayCols.in_progress.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
      done:        displayCols.done.map((a: DbAlert) => a._id).filter((id: string) => id !== dragId),
    }
    newLocalOrder[targetCol] = targetList
    setLocalOrder(newLocalOrder)
    setDragOverCard(null)

    // Persist column change to DB
    if (sourceCol !== targetCol) {
      await updateWorkflow({ alertId: dragId as ConvexId, workflowStatus: targetCol })
    }

    setDragId(null)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header — sticky */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', background: 'white', borderBottom: '1px solid #E2E8F0', flexShrink: 0, flexWrap: 'wrap' as const }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', letterSpacing: -0.3, flexShrink: 0 }}>
          Alerts <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 400 }}>({totalAlertCount ?? alerts.length})</span>
        </h1>

        {/* Severity dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setSeverityOpen(o => !o)}
            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #E2E8F0', background: severityFilter ? '#FEE2E2' : 'white', color: severityFilter ? '#DC2626' : '#374151', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {severityFilter === 'dead' ? `DEAD (${deadCount})` : severityFilter === 'critical' ? `CRITICAL (${criticalCount})` : severityFilter === 'warning' ? `WARNING (${warningCount})` : 'Severity'} ▾
          </button>
          {severityOpen && (
            <div
              style={{ position: 'absolute', top: '110%', left: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}
              onMouseLeave={() => setSeverityOpen(false)}
            >
              {[
                { key: null,       label: 'All severities', count: alerts.length,  color: '#374151' },
                { key: 'dead',     label: 'DEAD',           count: deadCount,      color: '#DC2626' },
                { key: 'critical', label: 'CRITICAL',       count: criticalCount,  color: '#DC2626' },
                { key: 'warning',  label: 'WARNING',        count: warningCount,   color: '#92400E' },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => { setSeverityFilter(opt.key); setSeverityOpen(false); resetColLimits() }}
                  style={{ width: '100%', padding: '8px 14px', background: severityFilter === opt.key ? '#F8FAFC' : 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: opt.color, textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>{opt.label}</span>
                  <span style={{ color: '#94A3B8', fontWeight: 400 }}>{opt.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* HTTP code filters */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
          <button
            onClick={() => { setHttpFilter(null); resetColLimits() }}
            style={{ padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: !httpFilter ? '#2563EB' : '#E2E8F0', background: !httpFilter ? '#EFF6FF' : 'white', color: !httpFilter ? '#2563EB' : '#6B7280', fontFamily: 'inherit' }}
          >
            All codes
          </button>
          {HTTP_FILTERS.filter(f => (codeCounts[f.code] ?? 0) > 0).map(f => (
            <button
              key={f.code}
              onClick={() => { setHttpFilter(httpFilter === f.code ? null : f.code); resetColLimits() }}
              style={{ padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: httpFilter === f.code ? '#DC2626' : '#E2E8F0', background: httpFilter === f.code ? '#FEE2E2' : 'white', color: httpFilter === f.code ? '#DC2626' : '#374151', fontFamily: 'inherit' }}
            >
              {f.label} · {codeCounts[f.code] ?? 0}
            </button>
          ))}
        </div>

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
              ✓ {reverifyResult.dismissed} removed
            </span>
          )}
          <button
            onClick={handleReverify}
            disabled={reverifying}
            style={{ padding: '5px 12px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: reverifying ? 'default' : 'pointer', opacity: reverifying ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {reverifying ? 'Checking…' : '🔄 Re-verify'}
          </button>
          <button
            onClick={() => confirm(`Dismiss all ${alerts.length} alerts?`) && dismissAll({})}
            style={{ padding: '5px 12px', background: 'white', color: '#6B7280', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Dismiss All ({alerts.length})
          </button>
        </div>
      </div>

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
            onViewSite={onViewSite}
            isDragOver={dragOver === col.id}
            onDragOver={() => setDragOver(col.id)}
            onDragLeave={() => setDragOver(null)}
            onDragStart={setDragId}
            dragOverCard={dragOverCard}
            onCardDragOver={handleCardDragOver}
            onCardDragLeave={handleCardDragLeave}
            onDismiss={handleDismissOne}
            onMarkDown={handleMarkDown}
          />
        ))}
      </div>
    </div>
  )
}
