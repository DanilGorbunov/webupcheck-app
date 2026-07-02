import { useState } from 'react'

type Tab = 'account' | 'notifications' | 'api' | 'billing'

const PLAN_FEATURES = [
  { label: 'Sites monitored', free: '5', starter: '20', pro: '200', agency: '2,000' },
  { label: 'Check frequency',  free: 'Daily', starter: 'Daily', pro: '6 hours', agency: '1 hour' },
  { label: 'Email alerts',     free: '✓', starter: '✓', pro: '✓', agency: '✓' },
  { label: 'Slack alerts',     free: '—', starter: '✓', pro: '✓', agency: '✓' },
  { label: 'API access',       free: '—', starter: '—', pro: '✓', agency: '✓' },
  { label: 'White-label PDF',  free: '—', starter: '—', pro: '—', agency: '✓' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{title}</div>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{ width: 40, height: 22, borderRadius: 11, background: on ? '#2563EB' : '#CBD5E1', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('account')
  const [notifs, setNotifs] = useState({ email: true, slack: false, siteDown: true, sslExpiry: true, parkingDetected: true, drDrop: false })
  const [apiVisible, setApiVisible] = useState(false)
  const API_KEY = 'wuc_live_••••••••••••••••••••••••••••••'
  const API_KEY_REAL = 'wuc_live_a8f3k2m9x4p1q7r5w6y0n3j8h2t5d1b'

  const TAB = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? '#0F172A' : '#6B7280', borderBottom: `2px solid ${tab === t ? '#2563EB' : 'transparent'}`, fontFamily: 'inherit', marginBottom: -1 }}>
      {label}
    </button>
  )

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: -0.4 }}>Settings</h1>
        <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>Manage your account, notifications, and billing</p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 22 }}>
        {TAB('account', 'Account')}
        {TAB('notifications', 'Notifications')}
        {TAB('api', 'API')}
        {TAB('billing', 'Billing')}
      </div>

      {tab === 'account' && (
        <>
          <Section title="Profile">
            <Field label="Full name" sub="Your display name">
              <input defaultValue="Danil Gorbunov" style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', fontFamily: 'inherit', width: 200 }} />
            </Field>
            <Field label="Email" sub="danilgorbunov@gmail.com">
              <input defaultValue="danilgorbunov@gmail.com" style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', fontFamily: 'inherit', width: 220 }} />
            </Field>
            <Field label="Company" sub="Optional">
              <input placeholder="Your company" style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', fontFamily: 'inherit', width: 200 }} />
            </Field>
            <div style={{ marginTop: 14, textAlign: 'right' as const }}>
              <button style={{ padding: '7px 16px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Save Changes</button>
            </div>
          </Section>

          <Section title="Danger Zone">
            <Field label="Delete account" sub="Permanently delete your account and all data">
              <button style={{ padding: '6px 12px', background: 'white', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Delete Account</button>
            </Field>
          </Section>
        </>
      )}

      {tab === 'notifications' && (
        <Section title="Alert Preferences">
          {[
            { key: 'email' as const,            label: 'Email alerts',         sub: 'Send alerts to danilgorbunov@gmail.com' },
            { key: 'slack' as const,            label: 'Slack alerts',         sub: 'Connect a Slack webhook to receive alerts' },
            { key: 'siteDown' as const,         label: 'Site unreachable',     sub: 'Notify when a site returns 4xx/5xx or no response' },
            { key: 'sslExpiry' as const,        label: 'SSL expiry warning',   sub: 'Notify 14 days before SSL certificate expires' },
            { key: 'parkingDetected' as const,  label: 'Parking detected',     sub: 'Notify when a site switches to a parking page' },
            { key: 'drDrop' as const,           label: 'DR drop alert',        sub: 'Notify when DR drops more than 10 points' },
          ].map(n => (
            <Field key={n.key} label={n.label} sub={n.sub}>
              <Toggle on={notifs[n.key]} onChange={() => setNotifs(p => ({ ...p, [n.key]: !p[n.key] }))} />
            </Field>
          ))}
        </Section>
      )}

      {tab === 'api' && (
        <Section title="API Key">
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>
            Use your API key to integrate WebUpCheck into your own tools. Keep it secret — treat it like a password.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              readOnly
              value={apiVisible ? API_KEY_REAL : API_KEY}
              style={{ flex: 1, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#374151', background: '#F8FAFC', fontFamily: 'ui-monospace, monospace', outline: 'none' }}
            />
            <button onClick={() => setApiVisible(v => !v)} style={{ padding: '9px 14px', background: 'white', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              {apiVisible ? 'Hide' : 'Show'}
            </button>
            <button onClick={() => navigator.clipboard?.writeText(API_KEY_REAL)} style={{ padding: '9px 14px', background: 'white', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Copy
            </button>
          </div>
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '12px 14px', border: '1px solid #E2E8F0', fontSize: 12, color: '#475569', fontFamily: 'ui-monospace, monospace' }}>
            {`curl -H "Authorization: Bearer ${apiVisible ? API_KEY_REAL : API_KEY}" \\`}<br/>
            {`     https://api.webupcheck.com/v1/sites`}
          </div>
          <div style={{ marginTop: 14 }}>
            <button style={{ padding: '7px 14px', background: 'white', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Regenerate Key
            </button>
          </div>
        </Section>
      )}

      {tab === 'billing' && (
        <>
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Free Plan</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#DBEAFE', color: '#1D4ED8' }}>CURRENT</span>
                </div>
                <div style={{ fontSize: 12.5, color: '#6B7280' }}>5 sites · Daily checks · Email alerts</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>$0<span style={{ fontSize: 13, fontWeight: 400, color: '#94A3B8' }}>/mo</span></div>
            </div>
            <button style={{ padding: '8px 18px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Upgrade Plan →
            </button>
          </div>

          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Compare Plans</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>Feature</th>
                  {['Free', 'Starter $9', 'Pro $29', 'Agency $79'].map(p => (
                    <th key={p} style={{ padding: '10px 16px', textAlign: 'center' as const, fontSize: 11, fontWeight: 600, color: p.startsWith('Pro') ? '#2563EB' : '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map(row => (
                  <tr key={row.label} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '9px 16px', fontSize: 13, color: '#374151', fontWeight: 500 }}>{row.label}</td>
                    {[row.free, row.starter, row.pro, row.agency].map((v, i) => (
                      <td key={i} style={{ padding: '9px 16px', textAlign: 'center' as const, fontSize: 13, color: v === '—' ? '#CBD5E1' : v === '✓' ? '#16A34A' : '#374151', fontWeight: v === '✓' ? 700 : 400 }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
