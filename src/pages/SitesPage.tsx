import { useState, useMemo } from 'react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { PaginationResult, PaginationOptions } from 'convex/server'
import type { SiteStatus } from '../types'
import { StatusBadge } from '../components/ui/StatusBadge'
import { formatTraffic, getLeadingCountry, countryFlag } from '../lib/medialister'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbSite = any

const listPaginatedFn = makeFunctionReference<'query', { paginationOpts: PaginationOptions }, PaginationResult<DbSite>>('sites:listPaginated')
const statsFn = makeFunctionReference<'query', Record<string, never>, {
  total: number; active: number; warning: number; issues: number; unknown: number; checked: number;
  withDr50: number; avgPrice: number; languages: number; lastChecked: number;
}>('sites:stats')

interface Props {
  totalItems: number
  syncing: boolean
  onViewSite: (site: DbSite) => void
}

type SortCol = 'domain' | 'dr' | 'traffic' | 'price' | 'status'
type SortDir = 'asc' | 'desc'

export function SitesPage({ totalItems, onViewSite }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SiteStatus | 'all'>('all')
  const [langFilter, setLangFilter] = useState('all')
  const [sortCol, setSortCol] = useState<SortCol>('dr')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { results, status: queryStatus, loadMore } = usePaginatedQuery(
    listPaginatedFn,
    {},
    { initialNumItems: 100 }
  )

  const stats = useQuery(statsFn, {})

  const filtered = useMemo(() => {
    let s = [...(results ?? [])]
    if (search) {
      const q = search.toLowerCase()
      s = s.filter((x: DbSite) => x.domain.toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') s = s.filter((x: DbSite) => x.status === statusFilter)
    if (langFilter !== 'all') s = s.filter((x: DbSite) => x.languages.includes(langFilter))

    s.sort((a: DbSite, b: DbSite) => {
      let av: number | string = 0, bv: number | string = 0
      if (sortCol === 'domain') { av = a.domain; bv = b.domain }
      else if (sortCol === 'dr') { av = a.dr ?? -1; bv = b.dr ?? -1 }
      else if (sortCol === 'traffic') { av = a.organicTraffic ?? -1; bv = b.organicTraffic ?? -1 }
      else if (sortCol === 'price') { av = a.price; bv = b.price }
      else if (sortCol === 'status') { av = a.status; bv = b.status }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? av - (bv as number) : (bv as number) - av
    })
    return s
  }, [results, search, statusFilter, langFilter, sortCol, sortDir])

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const thStyle = (col: SortCol) => ({
    padding: '9px 16px', textAlign: 'left' as const,
    fontSize: 10.5, fontWeight: 600, color: sortCol === col ? '#2563EB' : '#64748B',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    borderBottom: '1px solid #E2E8F0', cursor: 'pointer', userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  })

  const arrow = (col: SortCol) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  return (
    <div style={{ padding: '26px 28px', minHeight: '100%', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.4px' }}>Partner Sites</h1>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
            {totalItems.toLocaleString()} publisher domains from Medialister · {(results?.length ?? 0).toLocaleString()} loaded
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {(() => {
        const checked = stats?.checked ?? 0
        const checkedPct = totalItems > 0 ? Math.min(100, Math.round((checked / totalItems) * 100)) : 0
        const cards = [
          { label: 'With DR 50+', value: (stats?.withDr50 ?? 0).toLocaleString(), sub: 'High authority', color: '#16A34A', bg: '#F0FDF4' },
          { label: 'Avg Price', value: stats?.avgPrice ? `$${stats.avgPrice}` : '—', sub: 'per placement', color: '#D97706', bg: '#FFFBEB' },
          { label: 'Languages', value: String(stats?.languages ?? 0), sub: 'unique languages', color: '#7C3AED', bg: '#F5F3FF' },
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
            {/* Total Sites with check progress */}
            <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Total Sites</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>{totalItems.toLocaleString()}</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>{checked.toLocaleString()} checked</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: checkedPct >= 100 ? '#16A34A' : '#2563EB' }}>{checkedPct}%</span>
                </div>
                <div style={{ height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${checkedPct}%`, background: checkedPct >= 100 ? '#16A34A' : '#2563EB', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            </div>
            {cards.map(card => (
              <div key={card.label} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{card.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 11.5, color: card.color, marginTop: 5, fontWeight: 500 }}>{card.sub}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Filter bar */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            type="text"
            placeholder="Search domain..."
            style={{ width: '100%', padding: '6px 10px 6px 30px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12.5, color: '#374151', outline: 'none', fontFamily: 'inherit', background: 'white' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as SiteStatus | 'all')}
          style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12.5, color: '#374151', background: 'white', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Warning">Warning</option>
          <option value="Unreachable">Unreachable</option>
          <option value="Parked">Parked</option>
          <option value="Blacklisted">Blacklisted</option>
        </select>
        <select
          value={langFilter}
          onChange={e => setLangFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12.5, color: '#374151', background: 'white', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
        >
          <option value="all">All Languages</option>
          {['en', 'de', 'fr', 'es', 'it', 'uk', 'ru', 'pl', 'pt', 'nl'].map(l => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: '#94A3B8', paddingLeft: 4 }}>{filtered.length.toLocaleString()} results</span>
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={thStyle('domain')} onClick={() => toggleSort('domain')}>Domain{arrow('domain')}</th>
              <th style={{ ...thStyle('domain'), cursor: 'default' }}>Country</th>
              <th style={{ ...thStyle('domain'), cursor: 'default' }}>Language</th>
              <th style={thStyle('dr')} onClick={() => toggleSort('dr')}>DR{arrow('dr')}</th>
              <th style={thStyle('traffic')} onClick={() => toggleSort('traffic')}>Traffic{arrow('traffic')}</th>
              <th style={thStyle('price')} onClick={() => toggleSort('price')}>Price{arrow('price')}</th>
              <th style={{ ...thStyle('domain'), cursor: 'default' }}>Format</th>
              <th style={thStyle('status')} onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
              <th style={{ padding: '9px 14px', borderBottom: '1px solid #E2E8F0' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((site: DbSite) => {
              const country = getLeadingCountry(site.leadingCountries)
              const flag = countryFlag(country)
              return (
                <tr
                  key={site._id}
                  style={{ borderTop: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F0F7FF'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  onClick={() => onViewSite(site)}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                        width={18} height={18}
                        style={{ borderRadius: 3, flexShrink: 0 }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{site.domain}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12.5, color: '#6B7280' }}>
                    {flag} {country !== '—' ? country.slice(0, 2).toUpperCase() : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#6B7280', fontWeight: 500 }}>
                    {(site.languages ?? []).join(', ').toUpperCase()}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: site.dr ? (site.dr >= 70 ? '#16A34A' : site.dr >= 40 ? '#D97706' : '#DC2626') : '#9CA3AF' }}>
                      {site.dr ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12.5, color: '#374151', fontWeight: 500 }}>
                    {formatTraffic(site.organicTraffic)}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>
                    ${(site.price ?? 0).toFixed(0)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 11, color: '#6B7280', background: '#F1F5F9', padding: '2px 7px', borderRadius: 4, fontWeight: 500 }}>{site.formatType}</span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <StatusBadge status={site.status} />
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#374151', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}
                      onClick={e => { e.stopPropagation(); onViewSite(site) }}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Load more */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {filtered.length.toLocaleString()} of {(results?.length ?? 0).toLocaleString()} loaded
          </span>
          {queryStatus === 'CanLoadMore' && (
            <button
              onClick={() => loadMore(100)}
              style={{ padding: '4px 14px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Load more
            </button>
          )}
          {queryStatus === 'LoadingMore' && (
            <span style={{ fontSize: 12, color: '#94A3B8' }}>Loading…</span>
          )}
        </div>
      </div>
    </div>
  )
}
