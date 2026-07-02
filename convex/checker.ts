import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'

const PARKED_KEYWORDS = [
  'domain is for sale', 'domain for sale', 'buy this domain',
  'domain available', 'parked by', 'this domain is available',
  'domain parking', 'godaddy', 'sedo', 'dan.com',
  'this domain is parked', 'domain is parked',
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
        'User-Agent': 'Mozilla/5.0 (compatible; WebUpCheck/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
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
    const isParked = PARKED_KEYWORDS.some(kw => textToCheck.includes(kw))

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
    await ctx.runMutation(internal.sites.saveCheckResult, { siteId, ...result })
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
        await ctx.runMutation(internal.sites.saveCheckResult, { siteId, ...result })
        return { domain, ...result }
      })
    )
    const done = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    return { done, failed }
  },
})
