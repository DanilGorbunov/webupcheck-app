import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'

const PARKED_KEYWORDS = [
  'domain is for sale', 'domain for sale', 'buy this domain',
  'domain available', 'parked by', 'this domain is available',
  'domain parking', 'godaddy', 'sedo', 'dan.com',
  'this domain is parked', 'domain is parked',
]

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
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) })
    const responseTimeMs = Date.now() - start

    if (!res.ok) {
      return { httpStatus: res.status, isParked: false, responseTimeMs }
    }

    const data = await res.json()
    const html: string = data.contents ?? ''
    const httpStatus: number = data.status?.http_code ?? 200
    const finalUrl: string = data.status?.url ?? url
    const redirectUrl = finalUrl !== url ? finalUrl : undefined

    const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)
    const pageTitle = titleMatch?.[1]?.trim().replace(/\s+/g, ' ')

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']{0,500})["'][^>]+name=["']description["']/i)
    const metaDescription = descMatch?.[1]?.trim()

    const textToCheck = `${pageTitle ?? ''} ${html.slice(0, 5000)}`.toLowerCase()
    const isParked = PARKED_KEYWORDS.some(kw => textToCheck.includes(kw))

    return { httpStatus, redirectUrl, pageTitle, metaDescription, isParked, responseTimeMs }
  } catch {
    return { httpStatus: 0, isParked: false, responseTimeMs: Date.now() - start }
  }
}

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
