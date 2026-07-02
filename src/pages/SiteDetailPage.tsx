import { useState } from 'react'
import type { Site } from '../types'
import { StatusBadge } from '../components/ui/StatusBadge'
import { formatTraffic, formatAudience, getLeadingCountry, countryFlag } from '../lib/medialister'
import { checkSite } from '../lib/siteChecker'
import type { CheckResult } from '../types'

interface Props {
  site: Site
  onBack: () => void
}

type Tab = 'overview' | 'seo' | 'history'

export function SiteDetailPage({ site, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)

  async function handleRecheck() {
    setChecking(true)
    const r = await checkSite(site.domain)
    setCheckResult(r)
    setChecking(false)
  }

  const tabStyle = (t: Tab) => ({
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    fontSize: 13,
    fontWeight: 500,
    color: tab === t ? '#2563EB' : '#6B7280',
    borderBottom: tab === t ? '2px solid #2563EB' : '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: -1,
  })

  const country = getLeadingCountry(site.leadingCountries)
  const flag = countryFlag(country)

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>
      <button
        onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14, fontFamily: 'inherit' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563EB'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#6B7280'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to Sites
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.5px' }}>{site.domain}</h1>
            <StatusBadge status={site.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: '#6B7280' }}>
            <span>{flag} {country}</span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span>{(site.languages ?? []).map((l: string) => l.toUpperCase()).join(', ')}</span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span>{site.formatType}</span>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span style={{ fontWeight: 600, color: '#0F172A' }}>${(site.price ?? 0).toFixed(0)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleRecheck}
            disabled={checking}
            style={{ padding: '7px 14px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: checking ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: checking ? 0.7 : 1 }}
          >
            {checking ? 'Checking…' : 'Re-check Now'}
          </button>
          {(site.urlExamples ?? [])[0] && (
            <a href={site.urlExamples[0]} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 12px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              View Example →
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 22 }}>
        {(['overview', 'seo', 'history'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>
            {t === 'overview' ? 'Overview' : t === 'seo' ? 'SEO Metrics' : 'Check History'}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

          <div style={{ gridColumn: '1/-1', fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #F1F5F9', paddingBottom: 5 }}>Availability</div>

          {checkResult ? (
            <>
              <MetricCard title="HTTP Status" value={`${checkResult.httpStatus} ${checkResult.httpStatusText}`} sub="Response normal" ok={(checkResult.httpStatus ?? 0) < 300} />
              <MetricCard title="Response Time" value={`${checkResult.responseTimeMs}ms`} sub={(checkResult.responseTimeMs ?? 0) < 1000 ? 'Excellent' : 'Slow'} ok={(checkResult.responseTimeMs ?? 0) < 1000} />
              <MetricCard title="Redirect" value={checkResult.redirectUrl ?? 'No redirect'} sub={checkResult.redirectUrl ? `→ ${checkResult.redirectUrl}` : 'Direct'} ok={!checkResult.redirectUrl} />
              {checkResult.title && <MetricCard title="Page Title" value={checkResult.title} sub="From <title> tag" ok={!checkResult.isParked} />}
              {checkResult.description && <MetricCard title="Meta Description" value={checkResult.description.slice(0, 100)} sub="" ok />}
              <MetricCard title="Parked Domain" value={checkResult.isParked ? '⚠️ Parking detected' : '✓ Not parked'} sub="" ok={!checkResult.isParked} />
            </>
          ) : (
            <div style={{ gridColumn: '1/-1', background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Click "Re-check Now" to verify HTTP status, redirects, title, and parking detection
            </div>
          )}

          <div style={{ gridColumn: '1/-1', fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #F1F5F9', paddingBottom: 5, marginTop: 6 }}>SEO</div>

          <MetricCard title="Domain Rating" value={site.dr != null ? String(site.dr) : '—'} sub="Ahrefs DR" ok={(site.dr ?? 0) >= 40} />
          <MetricCard title="Organic Traffic" value={formatTraffic(site.organicTraffic)} sub="per month (Ahrefs)" ok={(site.organicTraffic ?? 0) > 1000} />
          <MetricCard title="Audience" value={formatAudience(site.audience)} sub="Similarweb" ok={(site.audience ?? 0) > 5000} />

          <div style={{ gridColumn: '1/-1', fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #F1F5F9', paddingBottom: 5, marginTop: 6 }}>Engagement</div>

          <MetricCard title="Bounce Rate" value={site.bounceRate != null ? `${(site.bounceRate * 100).toFixed(1)}%` : '—'} sub="" ok={(site.bounceRate ?? 1) < 0.7} />
          <MetricCard title="Time on Site" value={site.timeOnSite != null ? `${site.timeOnSite.toFixed(0)}s` : '—'} sub="avg session" ok={(site.timeOnSite ?? 0) > 30} />
          <MetricCard title="MAI Score" value={site.mai != null ? String(site.mai) : '—'} sub="Medialister Attention Index" ok={(site.mai ?? 0) >= 30} />

          {Array.isArray(site.leadingCountries) && site.leadingCountries.length > 0 && (
            <>
              <div style={{ gridColumn: '1/-1', fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #F1F5F9', paddingBottom: 5, marginTop: 6 }}>Top Countries</div>
              {[...(site.leadingCountries as [string, number][])].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => (
                <MetricCard key={c} title={`${countryFlag(c)} ${c}`} value={Number(v).toLocaleString()} sub="visitors/mo" ok />
              ))}
            </>
          )}
        </div>
      )}

      {/* SEO tab */}
      {tab === 'seo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {[
            { label: 'Ahrefs Domain Rating', value: site.dr != null ? String(site.dr) : '—' },
            { label: 'Organic Traffic (Ahrefs)', value: formatTraffic(site.organicTraffic) },
            { label: 'Organic Traffic (Semrush)', value: formatTraffic(site.organicTraffic) },
            { label: 'Semrush Authority Score', value: site.semrushAuthorityScore != null ? String(site.semrushAuthorityScore) : '—' },
            { label: 'MAI (Attention Index)', value: site.mai != null ? String(site.mai) : '—' },
            { label: 'Estimated Views', value: '—' },
          ].map(m => (
            <div key={m.label} style={{ padding: 16, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: 22 }}>
          <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 32 }}>
            Check history will be stored after you run "Re-check Now" multiple times.
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ title, value, sub, ok }: { title: string; value: string; sub: string; ok: boolean }) {
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: sub ? 4 : 0, wordBreak: 'break-word' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: ok ? '#16A34A' : '#DC2626', fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}
