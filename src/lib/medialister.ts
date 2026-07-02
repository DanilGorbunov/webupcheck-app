import type { MedialisterResponse, Offer, Site } from '../types'

const API_BASE = '/medialister-api'
const API_KEY = import.meta.env.VITE_MEDIALISTER_API_KEY

export async function fetchOffersPage(page: number, perPage = 100): Promise<MedialisterResponse> {
  const res = await fetch(`${API_BASE}/api/offers?perPage=${perPage}&page=${page}`, {
    headers: { apikey: API_KEY },
  })
  if (!res.ok) throw new Error(`Medialister API error: ${res.status}`)
  return res.json()
}

export function offerToSite(offer: Offer): Site {
  const domain = offer.mediaProject.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const dr = offer.seoMetric?.ahrefsDr
  const traffic = offer.seoMetric?.organicTrafficByAhrefs ?? offer.seoMetric?.semrushOrganicTraffic

  return {
    id: offer.id,
    domain,
    languages: offer.mediaProject.languages,
    formatType: offer.formatType.name,
    price: parseFloat(offer.price),
    dr,
    organicTraffic: traffic,
    audience: offer.seoMetric?.audience,
    leadingCountries: offer.seoMetric?.leadingCountries,
    bounceRate: offer.seoMetric?.bounceRate,
    timeOnSite: offer.seoMetric?.timeOnSite,
    mai: offer.seoMetric?.mai,
    semrushAuthorityScore: offer.seoMetric?.semrushAuthorityScore,
    status: 'Unknown',
    urlExamples: offer.urlExamples,
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

export function getLeadingCountry(countries?: Record<string, number>): string {
  if (!countries) return '—'
  const entries = Object.entries(countries)
  if (!entries.length) return '—'
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
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
