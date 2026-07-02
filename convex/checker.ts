import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'
import { internal, api } from './_generated/api'

const PARKED_KEYWORDS = [
  'this domain is for sale',
  'buy this domain',
  'domain is for sale',
  'parkingcrew.net',
  'hugedomains.com',
  'domain parking',
  'undeveloped.com',
  'afternic.com',
  'sedo.com/search',
  'dan.com/buy',
]

// Direct fetch — no CORS proxy needed since this runs server-side in Convex
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
    try {
      html = await res.text()
    } catch { /* ignore body read errors */ }

    const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)
    const pageTitle = titleMatch?.[1]?.trim().replace(/\s+/g, ' ')

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']{0,500})["'][^>]+name=["']description["']/i)
    const metaDescription = descMatch?.[1]?.trim()

    const textToCheck = `${pageTitle ?? ''} ${html.slice(0, 5000)}`.toLowerCase()
    const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
    const isParked = PARKED_KEYWORDS.some(kw => textToCheck.includes(kw)) && wordCount < 300

    return { httpStatus: res.status, redirectUrl, pageTitle, metaDescription, isParked, responseTimeMs }
  } catch {
    // Try HTTP fallback if HTTPS fails
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

// Check a domain without saving to DB — for use by the health checker hook
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
    const done = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    return { done, failed }
  },
})
