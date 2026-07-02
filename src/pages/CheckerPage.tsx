import { useState } from 'react'
import { checkSite } from '../lib/siteChecker'
import type { CheckResult } from '../types'

interface CheckRow {
  domain: string
  result: CheckResult
}

export function CheckerPage() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CheckRow | null>(null)

  async function handleCheck() {
    const domain = input.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!domain) return
    setLoading(true)
    setResult(null)
    const r = await checkSite(domain)
    setResult({ domain, result: r })
    setLoading(false)
  }

  function getRecommendation(r: CheckResult): { text: string; color: string; bg: string; border: string } {
    if (!r.httpStatus || r.httpStatus === 0 || r.httpStatus >= 400)
      return { text: '⛔ DO NOT BUY', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    if (r.isParked)
      return { text: '⛔ DO NOT BUY — PARKED', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    const titleLower = (r.title ?? '').toLowerCase()
    const forSaleKw = ['for sale', 'available', 'buy this domain', 'domain available']
    if (forSaleKw.some(k => titleLower.includes(k)))
      return { text: '⛔ DO NOT BUY — DOMAIN FOR SALE', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }
    if (r.httpStatus === 301 || r.httpStatus === 302)
      return { text: '⚠️ PROCEED WITH CAUTION — REDIRECT', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    if ((r.responseTimeMs ?? 0) > 5000)
      return { text: '⚠️ PROCEED WITH CAUTION — SLOW', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
    return { text: '✅ SAFE TO BUY', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' }
  }

  const checks = result ? [
    {
      label: 'HTTP Status',
      value: result.result.httpStatus ? `${result.result.httpStatus} ${result.result.httpStatusText}` : 'Unreachable',
      ok: (result.result.httpStatus ?? 0) >= 200 && (result.result.httpStatus ?? 0) < 300,
    },
    {
      label: 'Response Time',
      value: result.result.responseTimeMs ? `${result.result.responseTimeMs}ms` : '—',
      ok: (result.result.responseTimeMs ?? 9999) < 3000,
    },
    {
      label: 'Redirect',
      value: result.result.redirectUrl ? `→ ${result.result.redirectUrl}` : 'No redirect',
      ok: !result.result.redirectUrl,
      warn: !!result.result.redirectUrl,
    },
    {
      label: 'Page Title',
      value: result.result.title ?? '—',
      ok: !!result.result.title && !result.result.isParked,
      warn: result.result.isParked,
    },
    {
      label: 'Description',
      value: result.result.description ? result.result.description.slice(0, 80) + (result.result.description.length > 80 ? '…' : '') : '—',
      ok: !!result.result.description,
    },
    {
      label: 'Parked Domain',
      value: result.result.isParked ? 'DETECTED' : 'Not detected',
      ok: !result.result.isParked,
    },
  ] : []

  return (
    <div style={{ padding: '26px 28px', background: '#F8FAFC', minHeight: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.4px', marginBottom: 6 }}>Pre-Purchase Checker</h1>
      <p style={{ fontSize: 12.5, color: '#64748B', marginBottom: 28 }}>Verify any site before buying a placement — check HTTP status, redirects, title, and parking detection</p>

      {/* Input */}
      <div style={{ maxWidth: 640, background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 28 }}>
        <div style={{ padding: '6px 6px 6px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: result || loading ? '1px solid #F1F5F9' : 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCheck()}
            type="text"
            placeholder="Enter domain, e.g. techcrunch.com"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#1E293B', fontFamily: 'inherit', background: 'transparent', minWidth: 0 }}
          />
          <button
            onClick={handleCheck}
            disabled={loading}
            style={{ padding: '8px 18px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Checking…' : 'Check Now'}
          </button>
        </div>

        {loading && (
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 20, height: 20, border: '2.5px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Checking {input}…</div>
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>Verifying HTTP status, redirects, title, parking detection…</div>
            </div>
          </div>
        )}

        {result && !loading && (() => {
          const rec = getRecommendation(result.result)
          return (
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{result.domain}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Checked just now</div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 14px', background: rec.bg, color: rec.color, border: `1px solid ${rec.border}`, borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  {rec.text}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checks.map(c => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5 }}>
                    <span style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>
                      {c.warn ? '⚠️' : c.ok ? '✅' : '❌'}
                    </span>
                    <span style={{ color: '#374151', fontWeight: 500, minWidth: 120 }}>{c.label}</span>
                    <span style={{ color: c.warn ? '#D97706' : c.ok ? '#16A34A' : '#DC2626', wordBreak: 'break-all' }}>{c.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setResult(null); setInput('') }}
                  style={{ flex: 1, padding: 8, background: 'white', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}
                >
                  Check Another
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
