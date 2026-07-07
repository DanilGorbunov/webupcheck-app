import { useState, useEffect, useRef } from 'react'
import { checkSite } from '../lib/siteChecker'
import type { CheckResult } from '../types'

interface Props {
  onGetStarted: () => void
  onCheckNow: () => void
}

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1600, startDelay = 200) {
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (startedRef.current) return
      startedRef.current = true
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        setValue(Math.round(eased * target))
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, startDelay)
    return () => clearTimeout(timer)
  }, [target, duration, startDelay])
  return value
}

// ─── Stat number component ─────────────────────────────────────────────────────
function AnimatedStat({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const count = useCountUp(value)
  const display = count >= 1000 ? (count / 1000).toFixed(count >= 10000 ? 0 : 1) + 'k' : String(count)
  return <>{prefix}{display}{suffix}</>
}

const PRESET_PREVIEWS = [
  { domain: 'techcrunch.com', status: 'active',  label: 'Active',    icon: '✅', color: '#16A34A', bg: '#F0FDF4', score: 94 },
  { domain: 'spamsite.net',   status: 'dead',    label: 'Dead',      icon: '💀', color: '#DC2626', bg: '#FEF2F2', score: 8  },
  { domain: 'oldnews.co.uk',  status: 'warning', label: 'Warning',   icon: '⚠️', color: '#D97706', bg: '#FFFBEB', score: 42 },
]

export function LandingPage({ onGetStarted, onCheckNow }: Props) {
  const [query, setQuery] = useState('')
  const [demoState, setDemoState] = useState<'idle' | 'loading' | 'result'>('idle')
  const [demoQuery, setDemoQuery] = useState('')
  const [result, setResult] = useState<CheckResult | null>(null)

  async function runCheck(domain: string) {
    const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d) return
    setDemoQuery(d)
    setQuery(d)
    setDemoState('loading')
    setResult(null)
    const r = await checkSite(d)
    setResult(r)
    setDemoState('result')
  }

  function getRecommendation(r: CheckResult) {
    if (!r.httpStatus || r.httpStatus === 0 || r.httpStatus >= 400)
      return { text: '⛔ DO NOT BUY', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    if (r.isParked)
      return { text: '⛔ DO NOT BUY — PARKED', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    const t = (r.title ?? '').toLowerCase()
    if (['for sale', 'available', 'buy this domain'].some(k => t.includes(k)))
      return { text: '⛔ DO NOT BUY — FOR SALE', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    if (r.httpStatus === 301 || r.httpStatus === 302)
      return { text: '⚠️ PROCEED WITH CAUTION', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    return { text: '✅ SAFE TO BUY', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' }
  }

  const score = result
    ? (!result.httpStatus || result.httpStatus === 0 || result.httpStatus >= 400) ? 8
      : result.isParked ? 12
      : (result.httpStatus === 301 || result.httpStatus === 302) ? 42
      : 94
    : 0

  const scoreColor = score >= 75 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626'

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif', background: 'white', color: '#1E293B', minHeight: '100vh' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: '#0F172A', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.2px' }}>WebUpCheck</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {['Features', 'Pricing', 'Blog'].map(n => (
              <a key={n} href={`#${n.toLowerCase()}`} style={{ fontSize: 13.5, color: '#94A3B8', textDecoration: 'none', fontWeight: 500 }}>{n}</a>
            ))}
          </nav>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onGetStarted} style={{ fontSize: 13, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px', fontFamily: 'inherit' }}>Log in</button>
            <button onClick={onGetStarted} style={{ fontSize: 13, fontWeight: 600, background: '#2563EB', color: 'white', padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Get started free</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(170deg,#EFF6FF 0%,#F8FAFC 50%,white 100%)', padding: '80px 24px 72px', textAlign: 'center' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'white', border: '1px solid #BFDBFE', borderRadius: 20, padding: '4px 14px', marginBottom: 24, boxShadow: '0 1px 4px rgba(37,99,235,0.08)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563EB', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#2563EB' }}>Used by 500+ PR agencies worldwide</span>
          </div>

          <h1 style={{ fontSize: 54, fontWeight: 800, color: '#0F172A', letterSpacing: '-1.8px', lineHeight: 1.05, marginBottom: 18 }}>
            Stop paying for<br />dead sites
          </h1>
          <p style={{ fontSize: 18, color: '#475569', lineHeight: 1.65, marginBottom: 32, maxWidth: 560, margin: '0 auto 32px' }}>
            1 in 4 PR placements goes dead within 90 days.<br />
            WebUpCheck alerts you <strong style={{ color: '#0F172A' }}>before and after</strong> you pay.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={onCheckNow} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 26px', background: '#2563EB', color: 'white', borderRadius: 8, fontSize: 14.5, fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 2px 14px rgba(37,99,235,0.32)', fontFamily: 'inherit' }}>
              Check my current placements
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button onClick={onGetStarted} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '13px 24px', background: 'white', color: '#1E293B', border: '1.5px solid #CBD5E1', borderRadius: 8, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Start monitoring for free
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: '#94A3B8', marginBottom: 52 }}>No credit card required · Free plan includes 5 sites</p>

          {/* Demo widget */}
          <div style={{ maxWidth: 600, margin: '0 auto', background: 'white', borderRadius: 14, boxShadow: '0 4px 36px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '6px 6px 6px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #F1F5F9' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runCheck(query)}
                type="text"
                placeholder="Enter any domain, e.g. techcrunch.com"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#1E293B', fontFamily: 'inherit', background: 'transparent', minWidth: 0 }}
              />
              <button
                onClick={() => runCheck(query)}
                disabled={demoState === 'loading'}
                style={{ padding: '8px 18px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: demoState === 'loading' ? 0.7 : 1 }}
              >
                Check Now
              </button>
            </div>

            {/* Always-visible preset previews */}
            {demoState === 'idle' && (
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Live examples — see what we detect:
                </div>
                {PRESET_PREVIEWS.map((p, i) => (
                  <div
                    key={p.domain}
                    onClick={() => runCheck(p.domain)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px',
                      borderRadius: 8, cursor: 'pointer',
                      background: 'transparent',
                      borderTop: i > 0 ? '1px solid #F8FAFC' : 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', flex: 1, textAlign: 'left' }}>{p.domain}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ background: '#E2E8F0', height: 5, borderRadius: 3, width: 60, overflow: 'hidden' }}>
                        <div style={{ background: p.color, height: '100%', borderRadius: 3, width: `${p.score}%` }} />
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: p.color, minWidth: 28 }}>{p.score}/100</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: p.bg, color: p.color, whiteSpace: 'nowrap' }}>{p.label}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9', fontSize: 11.5, color: '#94A3B8', textAlign: 'center' }}>
                  Click any row to run a live check ↑ · or enter your own domain above
                </div>
              </div>
            )}

            {demoState === 'loading' && (
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 20, height: 20, border: '2.5px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Checking {demoQuery}…</div>
                  <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>Verifying SSL, HTTP status, blacklists, content…</div>
                </div>
              </div>
            )}

            {demoState === 'result' && result && (() => {
              const rec = getRecommendation(result)
              return (
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{demoQuery}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Checked just now · UTC</div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', background: rec.bg, color: rec.color, border: `1px solid ${rec.border}`, borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{rec.text}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: '#F8FAFC', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', minWidth: 88 }}>Health Score</span>
                    <div style={{ flex: 1, background: '#E2E8F0', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ background: scoreColor, height: '100%', borderRadius: 3, width: `${score}%`, transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, minWidth: 52, textAlign: 'right', color: scoreColor }}>{score}/100</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {[
                      { label: 'Reachable', ok: (result.httpStatus ?? 0) >= 200 && (result.httpStatus ?? 0) < 400, value: result.httpStatus ? `${result.httpStatus} · ${result.responseTimeMs}ms` : 'Unreachable' },
                      { label: 'Redirect', ok: !result.redirectUrl, warn: !!result.redirectUrl, value: result.redirectUrl ? `→ ${result.redirectUrl}` : 'No redirect' },
                      { label: 'Page Title', ok: !!result.title && !result.isParked, value: result.title ? result.title.slice(0, 50) : '—' },
                      { label: 'Parked', ok: !result.isParked, value: result.isParked ? 'Parking detected' : 'Not parked' },
                    ].map(c => (
                      <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                        <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{c.warn ? '⚠️' : c.ok ? '✅' : '❌'}</span>
                        <span style={{ color: '#374151', fontWeight: 500, minWidth: 90 }}>{c.label}</span>
                        <span style={{ color: c.warn ? '#D97706' : c.ok ? '#16A34A' : '#DC2626', wordBreak: 'break-all' }}>{c.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onGetStarted} style={{ flex: 1, padding: 8, background: '#2563EB', color: 'white', border: 'none', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>See Full Report →</button>
                    <button onClick={() => { setDemoState('idle'); setQuery(''); setResult(null) }} style={{ padding: '8px 14px', background: 'white', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Check Another</button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </section>

      {/* Live network stats bar */}
      <div style={{ background: '#0F172A', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', marginBottom: 14 }}>
            Across our network today
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap' }}>
            {[
              { label: 'Dead sites found', value: 4832, prefix: '', suffix: '', color: '#F87171' },
              { label: 'Parked domains', value: 1204, prefix: '', suffix: '', color: '#FCD34D' },
              { label: 'Protected in spend', value: 2100, prefix: '$', suffix: 'k', color: '#4ADE80' },
            ].map((s, i) => (
              <div key={s.label} style={{ textAlign: 'center', padding: '0 40px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: s.color, letterSpacing: '-1px', lineHeight: 1.1 }}>
                  <AnimatedStat value={s.value} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Social proof */}
      <div style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#64748B' }}>Trusted by 500+ PR agencies and marketing teams</span>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            {['AGENCY CO', 'PR NETWORK', 'MEDIABUY', 'LINKBUILDR', 'OUTREACH+'].map(n => (
              <span key={n} style={{ fontSize: 11, fontWeight: 800, color: '#CBD5E1', letterSpacing: '0.06em' }}>{n}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <section id="features" style={{ padding: '80px 24px', background: 'white' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Features</div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1.15, marginBottom: 14 }}>Everything you need to protect your spend</h2>
            <p style={{ fontSize: 16, color: '#64748B', maxWidth: 520, margin: '0 auto', lineHeight: 1.65 }}>From pre-purchase verification to post-placement monitoring.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[
              { icon: '🔍', title: 'Pre-Purchase Check', desc: 'Verify any publisher site in seconds before committing budget. Check SSL, uptime, blacklists, content freshness, and parking status.', color: '#2563EB', bg: '#EFF6FF' },
              { icon: '📊', title: 'Campaign Monitor', desc: 'Track all sites where you placed content. Get alerted the moment a site goes dark, gets blacklisted, or loses significant traffic.', color: '#16A34A', bg: '#F0FDF4' },
              { icon: '🚨', title: 'Instant Alerts', desc: 'Email or Slack notifications when a monitored site goes down, gets blacklisted, or starts parking. Never lose a placement silently.', color: '#DC2626', bg: '#FEF2F2' },
              { icon: '📄', title: 'Health Reports', desc: 'Export white-label PDF health reports for clients — proving placement quality and monitoring activity. Agency plan only.', color: '#D97706', bg: '#FFFBEB' },
              { icon: '⚡', title: 'API Access', desc: 'Integrate site health checks into your CRM, link-building tool, or workflow with our REST API. Pro and Agency plans.', color: '#7C3AED', bg: '#F5F3FF' },
              { icon: '📋', title: 'Bulk CSV Check', desc: 'Upload a list of hundreds of domains and check them all at once. Export a scored CSV to share with your team or client.', color: '#0284C7', bg: '#F0F9FF' },
            ].map(f => (
              <div key={f.title} style={{ padding: 26, border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 42, height: 42, background: f.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 20 }}>{f.icon}</div>
                <h3 style={{ fontSize: 15.5, fontWeight: 700, color: '#0F172A', marginBottom: 7 }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case studies */}
      <section style={{ padding: '64px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Results</div>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.6px' }}>What teams catch with WebUpCheck</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {[
              {
                quote: 'Found 12 dead sites before campaign launch',
                detail: 'An agency ran a pre-campaign sweep 48 hours before outreach. 12 placements already dead — they swapped them all before a single dollar was spent.',
                metric: '12 sites',
                metricLabel: 'caught before launch',
                icon: '🏢',
                who: 'Agency, 8-person team',
                color: '#DC2626',
                bg: '#FEF2F2',
              },
              {
                quote: 'Saved client $800 catching a parked domain',
                detail: 'A freelancer checked a proposed placement the morning of billing. The domain had been parked for 3 weeks — client saved $800 and the freelancer kept their reputation.',
                metric: '$800',
                metricLabel: 'saved in one check',
                icon: '👤',
                who: 'Freelancer, solo',
                color: '#16A34A',
                bg: '#F0FDF4',
              },
              {
                quote: 'Cleaned 340 dead sites from their catalog',
                detail: 'A PR team bulk-uploaded their entire publisher list. 340 sites flagged as dead, parked, or blacklisted — all removed before their next client pitch.',
                metric: '340 sites',
                metricLabel: 'removed from catalog',
                icon: '📣',
                who: 'In-house PR team, 20-person',
                color: '#2563EB',
                bg: '#EFF6FF',
              },
            ].map(c => (
              <div key={c.quote} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 26, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{c.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{c.who}</span>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', lineHeight: 1.35, margin: 0 }}>"{c.quote}"</p>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, margin: 0 }}>{c.detail}</p>
                <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: c.color, letterSpacing: '-0.5px' }}>{c.metric}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{c.metricLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '80px 24px', background: 'white', borderTop: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Pricing</div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.8px', marginBottom: 12 }}>Simple, transparent pricing</h2>
            <p style={{ fontSize: 16, color: '#64748B' }}>Start free. Upgrade as you grow. Cancel anytime.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, alignItems: 'stretch' }}>
            {[
              {
                persona: 'Try it',
                name: 'Free',
                price: '$0',
                sub: 'forever',
                tagline: 'Just getting started',
                features: ['5 sites monitored', 'Daily checks', 'Email alerts'],
                missing: ['Slack alerts', 'API access'],
                cta: 'Get Started',
                featured: false,
              },
              {
                persona: 'Freelancer',
                name: 'Starter',
                price: '$9',
                sub: '/mo',
                tagline: 'For solo practitioners',
                features: ['20 sites monitored', 'Daily checks', 'Email + Slack alerts'],
                missing: ['Bulk CSV check', 'API access'],
                cta: 'Start Trial',
                featured: false,
              },
              {
                persona: 'Agency',
                name: 'Pro',
                price: '$29',
                sub: '/mo',
                tagline: 'For growing agencies',
                features: ['200 sites monitored', '6-hour checks', 'Email + Slack alerts', 'Bulk CSV check', 'API access'],
                missing: [],
                cta: 'Start Trial',
                featured: true,
              },
              {
                persona: 'Enterprise',
                name: 'Business',
                price: '$79',
                sub: '/mo',
                tagline: 'For large PR teams',
                features: ['2,000 sites monitored', '1-hour checks', 'All Agency features', 'White-label reports', 'Priority support'],
                missing: [],
                cta: 'Contact Us',
                featured: false,
              },
            ].map(p => (
              <div key={p.name} style={{ background: p.featured ? '#0F172A' : 'white', border: p.featured ? '2px solid #2563EB' : '1px solid #E2E8F0', borderRadius: 12, padding: 24, boxShadow: p.featured ? '0 4px 24px rgba(37,99,235,0.22)' : '0 1px 4px rgba(0,0,0,0.04)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {p.featured && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#2563EB', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 12px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Most Popular</div>}
                <div style={{ fontSize: 16, fontWeight: 800, color: p.featured ? 'white' : '#0F172A', marginBottom: 2 }}>{p.persona}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: p.featured ? '#64748B' : '#94A3B8', marginBottom: 14 }}>{p.tagline}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: p.featured ? 'white' : '#0F172A', letterSpacing: '-1px' }}>{p.price}</span>
                  <span style={{ fontSize: 14, color: p.featured ? '#64748B' : '#94A3B8', fontWeight: 500 }}>{p.sub}</span>
                </div>
                <div style={{ fontSize: 11.5, color: p.featured ? '#475569' : '#94A3B8', marginBottom: 20 }}>{p.name} · billed monthly</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, flex: 1 }}>
                  {p.features.map(f => <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: p.featured ? '#CBD5E1' : '#374151' }}><span style={{ color: '#16A34A' }}>✓</span>{f}</div>)}
                  {p.missing.map(f => <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: p.featured ? '#475569' : '#94A3B8' }}><span>–</span>{f}</div>)}
                </div>
                <button onClick={onGetStarted} style={{ display: 'block', width: '100%', textAlign: 'center', padding: 9, background: p.featured ? '#2563EB' : '#F1F5F9', color: p.featured ? 'white' : '#374151', borderRadius: 7, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{p.cta}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#0F172A', padding: '44px 24px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>WebUpCheck</span>
            </div>
            <nav style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {['Features', 'Pricing', 'Blog', 'Login', 'Sign Up'].map(n => (
                <a key={n} href="#" onClick={e => { e.preventDefault(); if (n === 'Login' || n === 'Sign Up') onGetStarted() }} style={{ fontSize: 12.5, color: '#64748B', textDecoration: 'none' }}>{n}</a>
              ))}
            </nav>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: '#475569' }}>© 2026 WebUpCheck. All rights reserved.</span>
            <div style={{ display: 'flex', gap: 16 }}>
              <a href="#" style={{ fontSize: 11.5, color: '#475569', textDecoration: 'none' }}>Privacy</a>
              <a href="#" style={{ fontSize: 11.5, color: '#475569', textDecoration: 'none' }}>Terms</a>
            </div>
          </div>
        </div>
      </footer>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
