import { useState } from 'react'

interface Campaign {
  id: number
  name: string
  sites: number
  active: number
  issues: number
  created: string
  status: 'Active' | 'Paused' | 'Completed'
}

const MOCK: Campaign[] = [
  { id: 1, name: 'Tech Media Q3 2026',     sites: 48, active: 46, issues: 2, created: 'Jun 15, 2026', status: 'Active' },
  { id: 2, name: 'Finance Blogs EU',       sites: 31, active: 28, issues: 3, created: 'May 22, 2026', status: 'Active' },
  { id: 3, name: 'Sports Outlets Spring',  sites: 22, active: 22, issues: 0, created: 'Apr 10, 2026', status: 'Completed' },
  { id: 4, name: 'News Publishers DE',     sites: 15, active: 13, issues: 2, created: 'Mar 5, 2026',  status: 'Paused' },
  { id: 5, name: 'Lifestyle Blogs US',     sites: 60, active: 58, issues: 2, created: 'Jun 28, 2026', status: 'Active' },
]

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Active:    { bg: '#DCFCE7', color: '#15803D' },
  Paused:    { bg: '#FEF3C7', color: '#92400E' },
  Completed: { bg: '#F1F5F9', color: '#475569' },
}

export function CampaignsPage() {
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [campaigns, setCampaigns] = useState(MOCK)

  function addCampaign() {
    if (!name.trim()) return
    setCampaigns(prev => [...prev, { id: Date.now(), name: name.trim(), sites: 0, active: 0, issues: 0, created: 'Jul 2, 2026', status: 'Active' }])
    setName('')
    setShowModal(false)
  }

  const totalSites  = campaigns.reduce((s, c) => s + c.sites, 0)
  const totalIssues = campaigns.reduce((s, c) => s + c.issues, 0)
  const activeCamps = campaigns.filter(c => c.status === 'Active').length

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: -0.4 }}>Campaigns</h1>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>Group your placements into campaigns and monitor them together</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Campaign
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Campaigns', value: campaigns.length, sub: `${activeCamps} active`, subColor: '#16A34A' },
          { label: 'Sites Tracked',   value: totalSites,       sub: 'across all campaigns', subColor: '#6B7280' },
          { label: 'Open Issues',     value: totalIssues,      sub: totalIssues > 0 ? 'Needs attention' : 'All clear', subColor: totalIssues > 0 ? '#DC2626' : '#16A34A' },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: -1, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 11.5, color: c.subColor, marginTop: 5, fontWeight: 500 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Campaign', 'Sites', 'Active', 'Issues', 'Created', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: 10.5, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => {
              const st = STATUS_STYLES[c.status]
              const healthPct = c.sites > 0 ? Math.round((c.active / c.sites) * 100) : 100
              return (
                <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.name}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151', fontWeight: 500 }}>{c.sites}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 50, background: '#E2E8F0', height: 4, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ background: '#16A34A', height: '100%', width: `${healthPct}%` }} />
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: healthPct === 100 ? '#16A34A' : '#D97706' }}>{c.active}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {c.issues > 0
                      ? <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>{c.issues}</span>
                      : <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 500 }}>✓ None</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: '#6B7280' }}>{c.created}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' as const }}>
                    <button style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                      View →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* New Campaign Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'white', borderRadius: 12, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>New Campaign</div>
              <button onClick={() => setShowModal(false)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: '#F1F5F9', borderRadius: 6, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}>✕</button>
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Campaign name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCampaign()}
              type="text"
              placeholder="e.g. Tech Media Q4 2026"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 14, outline: 'none', fontFamily: 'inherit', color: '#1E293B', marginBottom: 20 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addCampaign} style={{ padding: '8px 20px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Create Campaign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
