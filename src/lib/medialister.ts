import type { MedialisterResponse, Offer, Site } from '../types'

// In dev: Vite proxies /medialister-api → https://api.medialister.com
// In prod (Vercel): /api/medialister serverless function handles it
const isDev = import.meta.env.DEV
const API_KEY = import.meta.env.VITE_MEDIALISTER_API_KEY

export async function fetchOffersPage(page: number, perPage = 100): Promise<MedialisterResponse> {
  const url = isDev
    ? `/medialister-api/api/offers?perPage=${perPage}&page=${page}`
    : `/api/medialister?page=${page}&perPage=${perPage}`

  const headers: Record<string, string> = isDev ? { apikey: API_KEY } : {}
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Medialister API error: ${res.status}`)
  return res.json()
}

export function offerToSite(offer: Offer): Site {
  const domain = offer.mediaProject.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const dr = offer.seoMetric?.ahrefsDr
  const traffic = offer.seoMetric?.organicTrafficByAhrefs ?? offer.seoMetric?.semrushOrganicTraffic

  const safeNum = (n: number | undefined): number | undefined =>
    n === undefined || isNaN(n) || !isFinite(n) ? undefined : n
  const rawPrice = parseFloat(offer.price)

  return {
    id: offer.id,
    domain,
    languages: offer.mediaProject.languages ?? [],
    formatType: offer.formatType.name ?? '',
    price: isNaN(rawPrice) || !isFinite(rawPrice) ? 0 : rawPrice,
    dr: safeNum(dr),
    organicTraffic: safeNum(traffic),
    audience: safeNum(offer.seoMetric?.audience),
    leadingCountries: offer.seoMetric?.leadingCountries,
    bounceRate: safeNum(offer.seoMetric?.bounceRate),
    timeOnSite: safeNum(offer.seoMetric?.timeOnSite),
    mai: safeNum(offer.seoMetric?.mai),
    semrushAuthorityScore: safeNum(offer.seoMetric?.semrushAuthorityScore),
    status: 'Unknown',
    urlExamples: offer.urlExamples ?? [],
  }
}

export function formatTraffic(n?: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function formatAudience(n?: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M/mo`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K/mo`
  return `${n}/mo`
}

export function getLeadingCountry(countries?: unknown): string {
  if (!countries) return '—'
  // Support both array [[name, share]] (Convex) and object {name: share} (raw)
  const entries: [string, number][] = Array.isArray(countries)
    ? (countries as [string, number][])
    : Object.entries(countries as Record<string, number>)
  if (!entries.length) return '—'
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  return sorted[0][0]
}

const COUNTRY_FLAGS: Record<string, string> = {
  'United States of America': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'Japan': '🇯🇵',
  'Ukraine': '🇺🇦',
  'Russian Federation': '🇷🇺',
  'Canada': '🇨🇦',
  'Australia': '🇦🇺',
  'Spain': '🇪🇸',
  'India': '🇮🇳',
  'Italy': '🇮🇹',
  'Netherlands': '🇳🇱',
  'Poland': '🇵🇱',
  'Brazil': '🇧🇷',
  'Mexico': '🇲🇽',
}

export function countryFlag(name: string): string {
  return COUNTRY_FLAGS[name] ?? '🌐'
}
