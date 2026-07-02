import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { Page } from '../App'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSite = any

const statsFn = makeFunctionReference<'query', Record<string, never>, {
  total: number; active: number; warning: number; unreachable: number; parked: number
  blacklisted: number; needsReview: number; issues: number; unknown: number; checked: number
  withDr50: number; avgPrice: number; languages: number; lastChecked: number
}>('sites:stats')

const listFn = makeFunctionReference<'query', { status?: string; limit?: number }, DbSite[]>('sites:list')

interface Props {
  totalItems: number
  syncing: boolean
  syncProgress: number
  syncTotal: number
  onNav: (page: Page) => void
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
interface DonutSlice { value: number; color: string; label: string }

function DonutChart({ slices, size = 140 }: { slices: DonutSlice[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 8} fill="none" stroke="#E2E8F0" strokeWidth={18} />
    </svg>
  )

  const cx = size / 2, cy = size / 2, r = size / 2 - 10
  const circ = 2 * Math.PI * r

  let cumulative = 0
  const paths = slices.map((sl, i) => {
    const pct = sl.value / total
    const dash = pct * circ
    const gap = circ - dash
    const offset = circ * (1 - cumulative) - circ * 0.25 // start from top
    cumulative += pct
    return (
      <circle
        key={i}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={sl.color}
        strokeWidth={18}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    )
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={18} />
      {paths}
    </svg>
  )
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────
interface BarRow { label: string; value: number; color: string; icon: string }

function HorizontalBars({ rows, max }: { rows: BarRow[]; max: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(row => (
        <div key={row.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{row.icon}</span>{row.label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{row.value.toLocaleString()}</span>
          </div>
          <div style={{ background: '#F1F5F9', borderRadius: 4, height: 7, overflow: 'hidden' }}>
            <div style={{
              background: row.color, height: '100%', borderRadius: 4,
              width: max > 0 ? `${Math.max(1, (row.value / max) * 100)}%` : '0%',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Mini sparkline (fake historical trend) ───────────────────────────────────
function Sparkline({ color, up }: { color: string; up: boolean }) {
  const pts = up
    ? [0, 5, 3, 8, 6, 12, 10, 16, 14, 20]
    : [20, 16, 18, 12, 15, 8, 10, 5, 7, 2]
  const w = 60, h = 24
  const max = Math.max(...pts), min = Math.min(...pts)
  const scale = (v: number) => h - ((v - min) / (max - min + 0.01)) * (h - 4) - 2
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * w} ${scale(v)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, subColor, icon, iconBg, trend }: {
  label: string; value: string; sub: string; subColor: string
  icon: React.ReactNode; iconBg: string; trend?: 'up' | 'down'
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: -1, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11.5, color: subColor, marginTop: 5, fontWeight: 500 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ width: 34, height: 34, background: iconBg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
          {trend && <Sparkline color={trend === 'up' ? '#16A34A' : '#DC2626'} up={trend === 'up'} />}
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function DashboardPage({ totalItems, syncing, syncProgress, syncTotal, onNav }: Props) {
  const stats = useQuery(statsFn, {})
  const topSites = useQuery(listFn, { limit: 50 })

  const active = stats?.active ?? 0
  const warning = stats?.warning ?? 0
  const unreachable = stats?.unreachable ?? 0
  const parked = stats?.parked ?? 0
  const blacklisted = stats?.blacklisted ?? 0
  const needsReview = stats?.needsReview ?? 0
  const issues = stats?.issues ?? 0
  const unknown = stats?.unknown ?? 0
  const total = stats?.total || totalItems
  const checked = stats?.checked ?? 0

  const syncPct = syncTotal > 0 ? Math.round((syncProgress / syncTotal) * 100) : 100

  // Donut slices
  const donutSlices: DonutSlice[] = [
    { value: active,      color: '#16A34A', label: 'Active' },
    { value: warning,     color: '#D97706', label: 'Warning' },
    { value: unreachable, color: '#DC2626', label: 'Unreachable' },
    { value: parked,      color: '#94A3B8', label: 'Parked' },
    { value: needsReview, color: '#A855F7', label: 'Needs Review' },
    { value: blacklisted, color: '#7C3AED', label: 'Blacklisted' },
    { value: unknown,     color: '#E2E8F0', label: 'Unknown' },
  ].filter(s => s.value > 0)

  // Issue breakdown bars
  const issueMax = Math.max(unreachable, parked, warning, blacklisted, needsReview, 1)
  const issueRows: BarRow[] = [
    { label: 'Unreachable', value: unreachable, color: '#DC2626', icon: '🔴' },
    { label: 'Warning',     value: warning,     color: '#D97706', icon: '⚠️' },
    { label: 'Parked',      value: parked,      color: '#94A3B8', icon: '🅿️' },
    { label: 'Needs Review',value: needsReview, color: '#A855F7', icon: '🔍' },
    { label: 'Blacklisted', value: blacklisted, color: '#7C3AED', icon: '🚫' },
  ]

  const sortedTopSites = [...(topSites ?? [])]
    .filter((s: DbSite) => s.dr != null)
    .sort((a: DbSite, b: DbSite) => (b.dr ?? 0) - (a.dr ?? 0))
    .slice(0, 6)

  const checkPct = total > 0 ? Math.round((checked / total) * 100) : 0

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: -0.4 }}>Dashboard</h1>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
            {syncing
              ? `Syncing Medialister… ${syncProgress.toLocaleString()} / ${syncTotal.toLocaleString()} (${syncPct}%)`
              : `Monitoring ${total.toLocaleString()} publisher domains · ${checked.toLocaleString()} checked (${checkPct}%)`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onNav('checker')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Quick Check
          </button>
          <button onClick={() => onNav('sites')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            View All Sites
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard
          label="Total Sites" value={total.toLocaleString()}
          sub={syncing ? `Syncing ${syncPct}%…` : `${totalItems.toLocaleString()} in Medialister`}
          subColor={syncing ? '#2563EB' : '#16A34A'} iconBg="#EFF6FF" trend="up"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
        />
        <StatCard
          label="Active" value={active.toLocaleString()}
          sub={checked > 0 ? `${Math.round((active / checked) * 100)}% of checked` : 'Awaiting checks'}
          subColor="#16A34A" iconBg="#F0FDF4" trend="up"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        />
        <StatCard
          label="Issues" value={issues.toLocaleString()}
          sub={issues > 0 ? `${unreachable} unreachable · ${warning} warning` : 'No issues detected'}
          subColor={issues > 0 ? '#DC2626' : '#16A34A'} iconBg="#FEF2F2" trend={issues > 0 ? 'down' : 'up'}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        />
        <StatCard
          label="Checked" value={`${checkPct}%`}
          sub={`${checked.toLocaleString()} of ${total.toLocaleString()} sites`}
          subColor="#6B7280" iconBg="#F0F9FF" trend="up"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Status Distribution — donut */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', marginBottom: 16 }}>Status Distribution</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <DonutChart slices={donutSlices} size={140} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{checked > 0 ? `${Math.round((active / checked) * 100)}%` : '—'}</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>healthy</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
              {donutSlices.map(sl => (
                <div key={sl.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sl.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#374151' }}>{sl.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{sl.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sites with Issues — bar chart */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Sites with Issues</div>
            <button onClick={() => onNav('alerts')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>See alerts →</button>
          </div>
          {issues === 0 && warning === 0 && needsReview === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 13 }}>🎉 All sites are healthy</div>
          ) : (
            <HorizontalBars rows={issueRows} max={issueMax} />
          )}
          {(issues > 0 || warning > 0) && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#DC2626' }}>{unreachable}</div>
                <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Dead</div>
              </div>
              <div style={{ width: 1, background: '#F1F5F9' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#D97706' }}>{warning}</div>
                <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Warning</div>
              </div>
              <div style={{ width: 1, background: '#F1F5F9' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#94A3B8' }}>{parked}</div>
                <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Parked</div>
              </div>
              <div style={{ width: 1, background: '#F1F5F9' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#A855F7' }}>{needsReview}</div>
                <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Review</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Check coverage bar */}
      {total > 0 && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Check Coverage</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{checked.toLocaleString()} / {total.toLocaleString()} sites checked</div>
          </div>
          <div style={{ background: '#F1F5F9', borderRadius: 6, height: 10, overflow: 'hidden', display: 'flex' }}>
            {checked > 0 && (
              <>
                <div title="Active" style={{ background: '#16A34A', width: `${(active / total) * 100}%`, transition: 'width 0.6s ease' }} />
                <div title="Warning" style={{ background: '#D97706', width: `${(warning / total) * 100}%`, transition: 'width 0.6s ease' }} />
                <div title="Unreachable" style={{ background: '#DC2626', width: `${(unreachable / total) * 100}%`, transition: 'width 0.6s ease' }} />
                <div title="Parked" style={{ background: '#94A3B8', width: `${(parked / total) * 100}%`, transition: 'width 0.6s ease' }} />
                <div title="Needs Review" style={{ background: '#A855F7', width: `${(needsReview / total) * 100}%`, transition: 'width 0.6s ease' }} />
                <div title="Blacklisted" style={{ background: '#7C3AED', width: `${(blacklisted / total) * 100}%`, transition: 'width 0.6s ease' }} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' as const }}>
            {[
              { label: 'Active', color: '#16A34A', v: active },
              { label: 'Warning', color: '#D97706', v: warning },
              { label: 'Unreachable', color: '#DC2626', v: unreachable },
              { label: 'Parked', color: '#94A3B8', v: parked },
              { label: 'Needs Review', color: '#A855F7', v: needsReview },
              { label: 'Unknown', color: '#CBD5E1', v: unknown },
            ].map(x => (
              <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color, flexShrink: 0 }} />
                {x.label} <strong style={{ color: '#374151' }}>{x.v.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top sites by DR */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Top Sites by Domain Rating</div>
          <button onClick={() => onNav('sites')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all sites →</button>
        </div>
        {sortedTopSites.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading sites data…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Domain', 'DR', 'Traffic', 'Price', 'Status'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', textAlign: 'left' as const, fontSize: 10.5, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTopSites.map((site: DbSite) => {
                const traffic = site.organicTraffic
                const trafficStr = !traffic ? '—' : traffic >= 1_000_000 ? `${(traffic / 1_000_000).toFixed(1)}M` : traffic >= 1_000 ? `${(traffic / 1_000).toFixed(0)}K` : String(traffic)
                const statusColors: Record<string, { bg: string; color: string }> = {
                  Active: { bg: '#dcfce7', color: '#15803d' },
                  Warning: { bg: '#fef9c3', color: '#92400e' },
                  Unreachable: { bg: '#fee2e2', color: '#b91c1c' },
                  Parked: { bg: '#f1f5f9', color: '#475569' },
                  NeedsReview: { bg: '#fdf4ff', color: '#7e22ce' },
                  Unknown: { bg: '#f1f5f9', color: '#6B7280' },
                }
                const sc = statusColors[site.status] ?? statusColors['Unknown']
                return (
                  <tr key={site._id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 20, height: 20, background: '#EFF6FF', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{site.domain}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{site.dr ?? '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12.5, color: '#374151', fontWeight: 500 }}>{trafficStr}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12.5, color: '#374151' }}>{site.price ? `$${site.price.toFixed(0)}` : '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.color }}>{site.status ?? 'Unknown'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
