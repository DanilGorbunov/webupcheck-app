export interface SeoMetric {
  audience: number
  audienceSourceDirect?: number
  audienceSourceSearch?: number
  audienceSourceSocial?: number
  sourceDirect?: number
  sourceSearch?: number
  ahrefsDr?: number
  semrushOrganicTraffic?: number
  semrushAuthorityScore?: number
  organicTrafficByAhrefs?: number
  estimatedViews?: number
  leadingCountries?: Record<string, number>
  bounceRate?: number
  timeOnSite?: number
  pagePerVisit?: number
  mai?: number
}

export interface Offer {
  id: string
  formatType: { name: string }
  mediaProject: {
    website: string
    languages: string[]
    fullLanguages?: Record<string, string>
  }
  price: string
  urlExamples: string[]
  seoMetric: SeoMetric
}

export interface MedialisterResponse {
  'hydra:totalItems': number
  'hydra:member': Offer[]
  'hydra:view': {
    'hydra:next'?: string
    'hydra:last': string
  }
}

export type SiteStatus = 'Active' | 'Warning' | 'Unreachable' | 'Parked' | 'Blacklisted' | 'Suspended' | 'Unknown'

export interface CheckResult {
  httpStatus?: number
  httpStatusText?: string
  redirectUrl?: string
  redirectChain?: string[]
  title?: string
  description?: string
  sslValid?: boolean
  sslDaysLeft?: number
  responseTimeMs?: number
  isParked?: boolean
  checkedAt: string
}

export interface Site {
  id: string
  domain: string
  languages: string[]
  formatType: string
  price: number
  dr?: number
  organicTraffic?: number
  audience?: number
  leadingCountries?: Record<string, number>
  bounceRate?: number
  timeOnSite?: number
  mai?: number
  semrushAuthorityScore?: number
  status: SiteStatus
  lastCheck?: CheckResult
  urlExamples: string[]
}
