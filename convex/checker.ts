import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'
import { api } from './_generated/api'

// Explicit parking keywords — immediate confirm regardless of word count
const EXPLICIT_PARKING = [
  'domain for sale',
  'buy this domain',
  'this domain is for sale',
  'domain is for sale',
  'parkingcrew.net',
  'hugedomains.com',
  'undeveloped.com',
  'afternic.com',
  'sedo.com/search',
  'dan.com/buy',
  'domain parking',
  'godaddy.com/domainfind',
]

// Level 1: title check — ONLY "Home - SiteName" default WordPress pattern
// Returns true only when the title strongly suggests an empty WordPress install.
// A real site title like "Investing.com — Markets" must NOT match.
function hasSuspiciousTitle(title: string): boolean {
  if (!title) return false
  const t = title.trim()
  // "Home - Anything" or "Home – Anything" → default empty WordPress
  return /^home\s*[-–|]\s*.{1,80}$/i.test(t)
}

// Level 2: body confirmation — called only when Level 1 passes.
// Returns true only when ALL content signals say the site is empty.
function confirmedEmptyByBody(html: string, wordCount: number): boolean {
  // Real content → not parking
  if (wordCount >= 300) return false

  // Has article/post markup → real blog content
  if (/<article[\s>]/i.test(html)) return false
  if (/class=["'][^"']*\bpost\b[^"']*["']/i.test(html)) return false

  // Has timestamps / dates → real posts
  if (/<time[\s>]/i.test(html)) return false
  if (/\bdatetime=/i.test(html)) return false
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(html)) return false
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(html)) return false

  // Has meaningful navigation (≥3 links in <nav>) → real site
  const navBlock = html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? ''
  const navLinkCount = (navBlock.match(/<a\s/gi) ?? []).length
  if (navLinkCount >= 3) return false

  // All signals say empty — confirmed parking/empty
  return true
}

async function fetchSite(domain: string): Promise<{
  httpStatus: number
  redirectUrl?: string
  pageTitle?: string
  metaDescription?: string
  isParked: boolean
  responseTimeMs: number
}> {
  const url = `https://${domain}`
  const start = Date.now()

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })
    const responseTimeMs = Date.now() - start
    const finalUrl = res.url
    const redirectUrl = finalUrl && finalUrl !== url && !finalUrl.startsWith(url + '/') ? finalUrl : undefined

    let html = ''
    try { html = await res.text() } catch { /* ignore body read errors */ }

    const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)
    const pageTitle = titleMatch?.[1]?.trim().replace(/\s+/g, ' ')

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']{0,500})["'][^>]+name=["']description["']/i)
    const metaDescription = descMatch?.[1]?.trim()

    const textToCheck = `${pageTitle ?? ''} ${html.slice(0, 8000)}`.toLowerCase()
    const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length

    // Explicit parking keywords → confirmed immediately
    const hasExplicitParking = EXPLICIT_PARKING.some(kw => textToCheck.includes(kw))

    // Two-level: title suspicion → body confirmation
    const titleSuspicious = hasSuspiciousTitle(pageTitle ?? '')
    const isParked = hasExplicitParking || (titleSuspicious && confirmedEmptyByBody(html, wordCount))

    return { httpStatus: res.status, redirectUrl, pageTitle, metaDescription, isParked, responseTimeMs }
  } catch {
    // HTTP fallback
    try {
      const httpUrl = `http://${domain}`
      const res2 = await fetch(httpUrl, {
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebUpCheck/1.0)' },
      })
      const responseTimeMs = Date.now() - start
      return { httpStatus: res2.status, isParked: false, responseTimeMs }
    } catch {
      return { httpStatus: 0, isParked: false, responseTimeMs: Date.now() - start }
    }
  }
}

export const checkDomain = action({
  args: { domain: v.string() },
  handler: async (_ctx, { domain }) => {
    return await fetchSite(domain)
  },
})

export const checkOneSite = action({
  args: { domain: v.string(), siteId: v.id('sites') },
  handler: async (ctx, { domain, siteId }) => {
    const result = await fetchSite(domain)
    await ctx.runMutation(api.sites.saveCheckResult, { siteId, ...result })
    return result
  },
})

export const checkBatch = internalAction({
  args: {
    batch: v.array(v.object({ domain: v.string(), siteId: v.id('sites') })),
    batchId: v.string(),
  },
  handler: async (ctx, { batch }) => {
    const results = await Promise.allSettled(
      batch.map(async ({ domain, siteId }) => {
        const result = await fetchSite(domain)
        await ctx.runMutation(api.sites.saveCheckResult, { siteId, ...result })
        return { domain, ...result }
      })
    )
    return {
      done: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    }
  },
})
