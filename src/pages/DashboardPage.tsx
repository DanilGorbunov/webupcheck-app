import type { Site } from '../types'

interface Props {
  sites: Site[]
  totalItems: number
  syncing: boolean
  syncProgress: number
  syncTotal: number
  onNav: (page: 'sites' | 'checker' | 'alerts') => void
}

function StatCard({ label, value, sub, subColor, icon, iconBg }: { label: string; value: string; sub: string; subColor: string; icon: React.ReactNode; iconBg: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: -1, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11.5, color: subColor, marginTop: 5, fontWeight: 500 }}>{sub}</div>
        </div>
        <div style={{ width: 34, height: 34, background: iconBg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      </div>
    </div>
  )
}

export function DashboardPage({ sites, totalItems, syncing, syncProgress, syncTotal, onNav }: Props) {
  const active = sites.filter(s => s.status === 'Active').length
  const issues = sites.filter(s => ['Unreachable', 'Blacklisted', 'Suspended', 'Parked'].includes(s.status ?? '')).length
  const warnings = sites.filter(s => s.status === 'Warning').length
  const parked = sites.filter(s => s.status === 'Parked').length
  const blacklisted = sites.filter(s => s.status === 'Blacklisted').length
  const unreachable = sites.filter(s => s.status === 'Unreachable').length
  const total = sites.length || totalItems

  const activeRate = total > 0 ? ((active / total) * 100).toFixed(1) : '—'

  const recentIssues = sites
    .filter(s => s.status && !['Active', 'Unknown'].includes(s.status))
    .slice(0, 6)

  const topSites = [...sites]
    .filter(s => s.dr != null)
    .sort((a, b) => (b.dr ?? 0) - (a.dr ?? 0))
    .slice(0, 6)

  const statusIssueRows = [
    { label: 'Unreachable', count: unreachable, color: '#DC2626', bg: '#FEF2F2', icon: '🔴' },
    { label: 'Parked', count: parked, color: '#94A3B8', bg: '#F1F5F9', icon: '🅿️' },
    { label: 'Warning', count: warnings, color: '#D97706', bg: '#FFFBEB', icon: '⚠️' },
    { label: 'Blacklisted', count: blacklisted, color: '#7C3AED', bg: '#F5F3FF', icon: '🚫' },
  ]

  const syncPct = syncTotal > 0 ? Math.round((syncProgress / syncTotal) * 100) : 100

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: -0.4 }}>Dashboard</h1>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
            {syncing
              ? `Syncing Medialister data… ${syncProgress.toLocaleString()} / ${syncTotal.toLocaleString()} (${syncPct}%)`
              : `Monitoring ${total.toLocaleString()} publisher domains across 80+ countries`}
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
          label="Total Sites"
          value={(sites.length || totalItems).toLocaleString()}
          sub={syncing ? `Syncing ${syncPct}%…` : `${totalItems.toLocaleString()} in Medialister`}
          subColor={syncing ? '#2563EB' : '#16A34A'}
          iconBg="#EFF6FF"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
        />
        <StatCard
          label="Active"
          value={active.toLocaleString()}
          sub={sites.length > 0 ? `${activeRate}% of checked` : 'Awaiting checks'}
          subColor="#16A34A"
          iconBg="#F0FDF4"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
        />
        <StatCard
          label="Issues"
          value={issues.toLocaleString()}
          sub={issues > 0 ? `${warnings} warnings, ${unreachable} unreachable` : 'No issues detected'}
          subColor={issues > 0 ? '#DC2626' : '#16A34A'}
          iconBg="#FEF2F2"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        />
        <StatCard
          label="Daily Check Capacity"
          value="10,000"
          sub="Free tier · Cron at 02:00 UTC"
          subColor="#6B7280"
          iconBg="#F0F9FF"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Issue breakdown */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Issue Breakdown</div>
            <button onClick={() => onNav('sites')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>
          </div>
          {statusIssueRows.map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{row.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 500 }}>{row.label}</span>
              <div style={{ width: 80, background: '#F1F5F9', height: 5, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ background: row.color, height: '100%', borderRadius: 3, width: issues > 0 ? `${Math.min(100, (row.count / Math.max(1, issues)) * 100)}%` : '0%' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: row.color, minWidth: 32, textAlign: 'right' as const }}>{row.count}</span>
            </div>
          ))}
          {issues === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>
              🎉 No issues detected
            </div>
          )}
        </div>

        {/* Recent issues */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Sites with Issues</div>
            <button onClick={() => onNav('alerts')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>See alerts →</button>
          </div>
          {recentIssues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>
              🎉 All sites are healthy
            </div>
          ) : (
            recentIssues.map(site => {
              const statusColors: Record<string, { bg: string; color: string }> = {
                Warning: { bg: '#FFFBEB', color: '#D97706' },
                Unreachable: { bg: '#FEF2F2', color: '#DC2626' },
                Blacklisted: { bg: '#F5F3FF', color: '#7C3AED' },
                Parked: { bg: '#F1F5F9', color: '#475569' },
                Suspended: { bg: '#FFF7ED', color: '#EA580C' },
              }
              const sc = statusColors[site.status ?? ''] ?? { bg: '#F1F5F9', color: '#94A3B8' }
              return (
                <div key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{site.domain}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.color, flexShrink: 0 }}>{site.status}</span>
                </div>
              )
            })
          )}
        </div>

      </div>

      {/* Top sites by DR */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Top Sites by Domain Rating</div>
          <button onClick={() => onNav('sites')} style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all sites →</button>
        </div>
        {topSites.length === 0 ? (
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
              {topSites.map(site => {
                const traffic = site.organicTraffic
                const trafficStr = !traffic ? '—' : traffic >= 1_000_000 ? `${(traffic / 1_000_000).toFixed(1)}M` : traffic >= 1_000 ? `${(traffic / 1_000).toFixed(0)}K` : String(traffic)
                return (
                  <tr key={site.id} style={{ borderTop: '1px solid #F1F5F9' }}>
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
                    <td style={{ padding: '10px 16px', fontSize: 12.5, color: '#374151' }}>{site.price ? `$${site.price}` : '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>{site.status ?? 'Unknown'}</span>
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
