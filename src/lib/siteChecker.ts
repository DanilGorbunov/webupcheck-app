import type { CheckResult } from '../types'

// Proxy endpoint — browser can't do direct HTTP checks due to CORS
// We use a public CORS proxy or our own Convex action
const CORS_PROXY = 'https://api.allorigins.win/get?url='

export async function checkSite(domain: string): Promise<CheckResult> {
  const url = `https://${domain}`
  const start = Date.now()

  try {
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    const responseTimeMs = Date.now() - start

    if (!res.ok) {
      return {
        httpStatus: res.status,
        httpStatusText: res.statusText,
        responseTimeMs,
        checkedAt: new Date().toISOString(),
      }
    }

    const data = await res.json()
    const html: string = data.contents ?? ''
    const status: number = data.status?.http_code ?? 200
    const finalUrl: string = data.status?.url ?? url

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch?.[1]?.trim()

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    const description = descMatch?.[1]?.trim()

    const isRedirected = finalUrl !== url
    const redirectUrl = isRedirected ? finalUrl : undefined

    const parkedKeywords = ['domain is for sale', 'domain for sale', 'buy this domain', 'domain available', 'parked by', 'this domain is available']
    const isParked = parkedKeywords.some(kw =>
      title?.toLowerCase().includes(kw) || html.toLowerCase().includes(kw)
    )

    return {
      httpStatus: status,
      httpStatusText: status === 200 ? 'OK' : String(status),
      redirectUrl,
      title,
      description,
      responseTimeMs,
      isParked,
      checkedAt: new Date().toISOString(),
    }
  } catch {
    return {
      httpStatus: 0,
      httpStatusText: 'Unreachable',
      responseTimeMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    }
  }
}
