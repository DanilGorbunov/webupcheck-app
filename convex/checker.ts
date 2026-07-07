"use node"

import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { promises as dns } from 'dns'

// Map TLD → Bright Data country code
const TLD_COUNTRY: Record<string, string> = {
  // Asia
  'cn': 'cn', 'com.cn': 'cn', 'net.cn': 'cn', 'org.cn': 'cn',
  'jp': 'jp', 'co.jp': 'jp',
  'kr': 'kr', 'co.kr': 'kr',
  'tw': 'tw',
  'hk': 'hk',
  'sg': 'sg',
  'my': 'my',
  'th': 'th',
  'id': 'id',
  'ph': 'ph',
  'vn': 'vn',
  'in': 'in', 'co.in': 'in',
  // Americas
  'us': 'us',
  'ca': 'ca',
  'mx': 'mx',
  'br': 'br', 'com.br': 'br',
  'ar': 'ar',
  // Europe
  'uk': 'gb', 'co.uk': 'gb',
  'de': 'de',
  'fr': 'fr',
  'it': 'it',
  'es': 'es',
  'nl': 'nl',
  'pl': 'pl',
  'se': 'se',
  'no': 'no',
  'fi': 'fi',
  'dk': 'dk',
  'be': 'be',
  'ch': 'ch',
  'at': 'at',
  'pt': 'pt',
  'gr': 'gr',
  'cz': 'cz',
  'hu': 'hu',
  'ro': 'ro',
  'ua': 'ua',
  'ru': 'ru',
  // Middle East & Africa
  'tr': 'tr',
  'il': 'il',
  'ae': 'ae',
  'sa': 'sa',
  'za': 'za', 'co.za': 'za',
  // Oceania
  'au': 'au', 'com.au': 'au',
  'nz': 'nz',
}

function getCountryForDomain(domain: string): string | null {
  const d = domain.replace(/^www\./, '').toLowerCase()
  const parts = d.split('.')
  // Check two-part TLD first (co.uk, com.br, etc.)
  if (parts.length >= 3) {
    const twoTld = parts.slice(-2).join('.')
    if (TLD_COUNTRY[twoTld]) return TLD_COUNTRY[twoTld]
  }
  const tld = parts[parts.length - 1]
  return TLD_COUNTRY[tld] ?? null
}

function buildProxyUrl(baseProxyUrl: string, country: string | null): string {
  if (!country) return baseProxyUrl
  const u = new URL(baseProxyUrl)
  u.username = u.username + `-country-${country}`
  return u.toString()
}

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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

function hasSuspiciousTitle(title: string): boolean {
  if (!title) return false
  const t = title.trim()
  return /^home\s*[-–|]\s*.{1,80}$/i.test(t)
}

function confirmedEmptyByBody(html: string, wordCount: number): boolean {
  if (wordCount >= 150) return false
  if (/id=["']root["']/i.test(html)) return false
  if (/id=["']app["']/i.test(html)) return false
  if (/__next/i.test(html)) return false
  if (/data-reactroot/i.test(html)) return false
  if (/nuxt/i.test(html)) return false
  if (/gatsby/i.test(html)) return false
  if (/property=["']og:image["']/i.test(html)) return false
  if (/property=["']og:description["']/i.test(html)) return false
  if (/property=["']og:site_name["']/i.test(html)) return false
  if (/rel=["']canonical["']/i.test(html)) return false
  if (/application\/ld\+json/i.test(html)) return false
  const scriptCount = (html.match(/<script[\s>]/gi) ?? []).length
  if (scriptCount >= 4) return false
  const styleCount = (html.match(/<link[^>]+rel=["']stylesheet["']/gi) ?? []).length
  if (styleCount >= 2) return false
  if (/<article[\s>]/i.test(html)) return false
  if (/class=["'][^"']*\bpost\b[^"']*["']/i.test(html)) return false
  if (/<time[\s>]/i.test(html)) return false
  if (/\bdatetime=/i.test(html)) return false
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(html)) return false
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(html)) return false
  const navBlock = (html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? '') +
                   (html.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? '')
  const navLinkCount = (navBlock.match(/<a\s/gi) ?? []).length
  if (navLinkCount >= 3) return false
  return true
}

function parseHtml(html: string, httpStatus: number, finalUrl: string, originalUrl: string, responseTimeMs: number) {
  const redirectUrl = finalUrl && finalUrl !== originalUrl && !finalUrl.startsWith(originalUrl + '/') ? finalUrl : undefined
  const titleMatch = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)
  const pageTitle = titleMatch?.[1]?.trim().replace(/\s+/g, ' ')
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,500})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{0,500})["'][^>]+name=["']description["']/i)
  const metaDescription = descMatch?.[1]?.trim()
  const textToCheck = `${pageTitle ?? ''} ${html.slice(0, 8000)}`.toLowerCase()
  const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  const hasExplicitParking = EXPLICIT_PARKING.some(kw => textToCheck.includes(kw))
  const titleSuspicious = hasSuspiciousTitle(pageTitle ?? '')
  const isParked = hasExplicitParking || (titleSuspicious && confirmedEmptyByBody(html, wordCount))

  // Extract OG image
  let ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
    undefined
  if (ogImage?.startsWith('/')) {
    try { ogImage = new URL(finalUrl || originalUrl).origin + ogImage } catch { /* skip */ }
  }

  // Extract canonical URL
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ??
    undefined

  return { httpStatus, redirectUrl, pageTitle, metaDescription, isParked, responseTimeMs, wordCount, ogImage, canonical }
}

// Retry via Bright Data residential proxy when direct check returns HTTP 0
async function fetchViaProxy(url: string, proxyUrl: string, start: number, domain: string, overrideCountry?: string) {
  const country = overrideCountry ?? getCountryForDomain(domain)
  const resolvedProxyUrl = buildProxyUrl(proxyUrl, country)
  const agent = new HttpsProxyAgent(resolvedProxyUrl)
  const { default: nodeFetch } = await import('node-fetch') as { default: typeof import('node-fetch').default }
  const res = await nodeFetch(url, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: agent as any,
    signal: AbortSignal.timeout(25000),
    redirect: 'follow',
    headers: BROWSER_HEADERS,
  })
  const responseTimeMs = Date.now() - start
  let html = ''
  try { html = await res.text() } catch { /* ignore */ }
  return parseHtml(html, res.status, res.url, url, responseTimeMs)
}

async function fetchSite(domain: string, opts?: { forceProxy?: boolean; forceCountry?: string }): Promise<{
  httpStatus: number
  redirectUrl?: string
  pageTitle?: string
  metaDescription?: string
  isParked: boolean
  responseTimeMs: number
  viaProxy?: boolean
  wordCount?: number
  ogImage?: string
  canonical?: string
}> {
  const url = `https://${domain}`
  const start = Date.now()

  // Step 0: DNS check — extract hostname only (domain may include a path like "site.com/section")
  const hostname = domain.split('/')[0]
  try {
    await dns.lookup(hostname)
  } catch {
    return { httpStatus: 0, isParked: false, responseTimeMs: Date.now() - start }
  }

  // Force specific country or known bot-blocked: skip direct check, go straight to proxy
  if (opts?.forceProxy || opts?.forceCountry) {
    const proxyUrl = process.env.BRIGHT_DATA_PROXY
    if (proxyUrl) {
      try {
        const proxyResult = await fetchViaProxy(url, proxyUrl, start, domain, opts.forceCountry)
        return { ...proxyResult, viaProxy: true }
      } catch {
        return { httpStatus: 0, isParked: false, responseTimeMs: Date.now() - start, viaProxy: true }
      }
    }
  }

  // Step 1: direct check from our server
  let directResult: Awaited<ReturnType<typeof fetchSite>> | null = null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: BROWSER_HEADERS,
    })
    const responseTimeMs = Date.now() - start
    let html = ''
    try { html = await res.text() } catch { /* ignore */ }
    directResult = parseHtml(html, res.status, res.url, url, responseTimeMs)
  } catch {
    // HTTPS failed — try HTTP fallback
    try {
      const httpUrl = `http://${domain}`
      const res2 = await fetch(httpUrl, {
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
        headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
      })
      const responseTimeMs = Date.now() - start
      let html = ''
      try { html = await res2.text() } catch { /* ignore */ }
      directResult = parseHtml(html, res2.status, res2.url, httpUrl, responseTimeMs)
    } catch {
      directResult = { httpStatus: 0, isParked: false, responseTimeMs: Date.now() - start }
    }
  }

  // Step 2: retry via Bright Data proxy for HTTP 0 (unreachable) or 403 (bot-blocked AWS IP)
  const needsProxy = directResult.httpStatus === 0 || directResult.httpStatus === 403
  if (needsProxy) {
    const proxyUrl = process.env.BRIGHT_DATA_PROXY
    if (proxyUrl) {
      try {
        const proxyResult = await fetchViaProxy(url, proxyUrl, start, domain)
        return { ...proxyResult, viaProxy: true }
      } catch {
        return directResult
      }
    }
  }

  return directResult
}

export const requeueAlertSites = action({
  args: {},
  handler: async (ctx) => {
    const allSiteIds = new Set<string>()
    let afterCreatedAt = 0
    let totalAlerts = 0

    // Paginate through all alerts using by_created index
    for (let page = 0; page < 10; page++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: { siteId: string; createdAt: number }[] = await ctx.runQuery(
        internal.sites.listAlertSiteIdPage,
        { afterCreatedAt }
      )
      if (!rows.length) break
      totalAlerts += rows.length
      rows.forEach(r => allSiteIds.add(r.siteId))
      afterCreatedAt = rows[rows.length - 1].createdAt + 1
      if (rows.length < 4000) break
    }

    const siteIds = [...allSiteIds]
    let requeued = 0
    for (let i = 0; i < siteIds.length; i += 500) {
      const batch = siteIds.slice(i, i + 500)
      const r: number = await ctx.runMutation(api.sites.requeueSitesBatch, { siteIds: batch })
      requeued += r
    }
    return { requeued, alertCount: totalAlerts }
  },
})

export const reverifyAlerts = action({
  args: { offset: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { offset = 0, limit = 4000 }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = await ctx.runQuery(api.sites.listAlerts, { dismissed: false, limit: 8000 })
    const alerts = all.slice(offset, offset + limit)

    let dismissed = 0
    let stillDead = 0

    for (let i = 0; i < alerts.length; i += 20) {
      const batch = alerts.slice(i, i + 20)
      await Promise.allSettled(batch.map(async (alert: { _id: string; siteId: string; domain: string }) => {
        try {
          const result = await fetchSite(alert.domain)
          const alive = result.httpStatus >= 200 && result.httpStatus < 400 && !result.isParked
          if (alive) {
            await ctx.runMutation(api.sites.dismissAlert, { alertId: alert._id as never })
            await ctx.runMutation(api.sites.saveCheckResult, { siteId: alert.siteId as never, ...result })
            dismissed++
          } else {
            stillDead++
          }
        } catch {
          stillDead++
        }
      }))
    }

    return { dismissed, stillDead, total: alerts.length }
  },
})

// Self-scheduling reverify — processes alerts per invocation, chains itself
export const reverifyAlertsPage = internalAction({
  args: {
    afterCreatedAt: v.number(),
    dismissed: v.number(),
    stillDead: v.number(),
    startedAt: v.optional(v.number()),
  },
  handler: async (ctx, { afterCreatedAt, dismissed, stillDead, startedAt }) => {
    const PAGE_SIZE = 150
    const runStartedAt = startedAt ?? Date.now()
    const pageAlerts: {
      _id: string; siteId: string; domain: string; createdAt: number;
      severity: string; aiCategory?: string;
    }[] = await ctx.runQuery(
      internal.sites.listAlertPage,
      { afterCreatedAt, limit: PAGE_SIZE }
    )
    if (!pageAlerts.length) {
      await ctx.runMutation(internal.sites.logReverifyComplete, {
        dismissed, stillDead, startedAt: runStartedAt,
      })
      return { done: true, dismissed, stillDead }
    }

    let pageDismissed = 0
    let pageStillDead = 0

    for (let i = 0; i < pageAlerts.length; i += 30) {
      const batch = pageAlerts.slice(i, i + 30)
      await Promise.allSettled(batch.map(async (alert) => {
        try {
          // BLOCKED sites (aiCategory=bot_blocked): skip direct AWS check, go straight to proxy
          const forceProxy = alert.aiCategory === 'bot_blocked'
          const result = await fetchSite(alert.domain, { forceProxy })
          const alive = result.httpStatus >= 200 && result.httpStatus < 400 && !result.isParked

          if (alive) {
            // Critical alerts: confirm with a second check before dismissing.
            // If the first check required the proxy (site blocks AWS IPs), force proxy
            // on the second check too — otherwise it hits the same AWS block and fails.
            if (alert.severity === 'critical') {
              await new Promise<void>(r => setTimeout(r, 4000))
              const forceProxy2 = forceProxy || result.viaProxy === true
              const result2 = await fetchSite(alert.domain, { forceProxy: forceProxy2 })
              const aliveAgain = result2.httpStatus >= 200 && result2.httpStatus < 400 && !result2.isParked
              if (!aliveAgain) {
                pageStillDead++
                return
              }
            }
            await ctx.runMutation(api.sites.dismissAlert, { alertId: alert._id as never })
            await ctx.runMutation(api.sites.saveCheckResult, { siteId: alert.siteId as never, ...result })
            pageDismissed++
          } else {
            pageStillDead++
          }
        } catch {
          pageStillDead++
        }
      }))
    }

    const nextAfter = pageAlerts.length < PAGE_SIZE
      ? -1
      : pageAlerts[pageAlerts.length - 1].createdAt + 1

    if (nextAfter >= 0) {
      await ctx.scheduler.runAfter(0, internal.checker.reverifyAlertsPage, {
        afterCreatedAt: nextAfter,
        dismissed: dismissed + pageDismissed,
        stillDead: stillDead + pageStillDead,
        startedAt: runStartedAt,
      })
    } else {
      await ctx.runMutation(internal.sites.logReverifyComplete, {
        dismissed: dismissed + pageDismissed,
        stillDead: stillDead + pageStillDead,
        startedAt: runStartedAt,
      })
    }

    return {
      done: nextAfter < 0,
      dismissed: dismissed + pageDismissed,
      stillDead: stillDead + pageStillDead,
      pageSize: pageAlerts.length,
    }
  },
})

export const startReverifyAll = action({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.checker.reverifyAlertsPage, {
      afterCreatedAt: 0,
      dismissed: 0,
      stillDead: 0,
    })
    return { started: true, message: 'Reverify running in background — check Convex dashboard for progress' }
  },
})

export const startReverifyAllInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.checker.reverifyAlertsPage, {
      afterCreatedAt: 0,
      dismissed: 0,
      stillDead: 0,
    })
  },
})

export const startReverifyFast = action({
  args: { workers: v.optional(v.number()) },
  handler: async (ctx, { workers = 5 }) => {
    // Find split points by sampling the alert list
    const CHUNK = 2000
    const boundaries: number[] = [0]
    let cursor = 0
    for (let i = 1; i < workers; i++) {
      const rows: { createdAt: number }[] = await ctx.runQuery(
        internal.sites.listAlertPage,
        { afterCreatedAt: cursor, limit: CHUNK }
      )
      if (rows.length < CHUNK) break // not enough alerts for another worker
      cursor = rows[rows.length - 1].createdAt + 1
      boundaries.push(cursor)
    }
    // Start all chains in parallel
    for (const afterCreatedAt of boundaries) {
      await ctx.scheduler.runAfter(0, internal.checker.reverifyAlertsPage, {
        afterCreatedAt,
        dismissed: 0,
        stillDead: 0,
      })
    }
    return { started: true, workers: boundaries.length, boundaries }
  },
})

export const checkDomain = action({
  args: { domain: v.string() },
  handler: async (_ctx, { domain }) => {
    return await fetchSite(domain)
  },
})

export const diagnoseDomain = action({
  args: { domain: v.string() },
  handler: async (_ctx, { domain }) => {
    const url = `https://${domain}`
    const start = Date.now()
    const steps: { step: string; ok: boolean; detail: string }[] = []

    // Step 0: DNS
    try {
      await dns.lookup(domain)
      steps.push({ step: 'DNS', ok: true, detail: 'Domain resolves' })
    } catch (e) {
      steps.push({ step: 'DNS', ok: false, detail: 'DNS lookup failed — domain does not exist' })
      return { steps, httpStatus: 0, finalStatus: 'dead' }
    }

    // Step 1: Direct HTTP
    let directStatus = 0
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'follow', headers: BROWSER_HEADERS })
      directStatus = res.status
      steps.push({ step: 'Direct HTTP', ok: directStatus >= 200 && directStatus < 400, detail: `HTTP ${directStatus}` })
    } catch {
      try {
        const res2 = await fetch(`http://${domain}`, { signal: AbortSignal.timeout(8000), redirect: 'follow', headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] } })
        directStatus = res2.status
        steps.push({ step: 'Direct HTTP', ok: directStatus >= 200 && directStatus < 400, detail: `HTTP ${directStatus} (via http fallback)` })
      } catch {
        steps.push({ step: 'Direct HTTP', ok: false, detail: 'Connection refused (AWS IP blocked)' })
      }
    }

    // Step 2: Bright Data proxy (only if direct failed)
    const proxyUrl = process.env.BRIGHT_DATA_PROXY
    if (!proxyUrl) {
      steps.push({ step: 'Bright Data', ok: false, detail: 'BRIGHT_DATA_PROXY env not set' })
      return { steps, httpStatus: directStatus, finalStatus: directStatus > 0 ? 'alive' : 'dead' }
    }

    if (directStatus === 0) {
      try {
        const country = getCountryForDomain(domain)
        const resolvedProxyUrl = buildProxyUrl(proxyUrl, country)
        const agent = new HttpsProxyAgent(resolvedProxyUrl)
        const { default: nodeFetch } = await import('node-fetch') as { default: typeof import('node-fetch').default }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await nodeFetch(url, { agent: agent as any, signal: AbortSignal.timeout(25000), redirect: 'follow', headers: BROWSER_HEADERS })
        steps.push({ step: 'Bright Data', ok: res.status >= 200 && res.status < 400, detail: `HTTP ${res.status} via ${country ?? 'generic'} proxy` })
        return { steps, httpStatus: res.status, finalStatus: res.status >= 200 && res.status < 400 ? 'alive' : 'dead', responseTimeMs: Date.now() - start }
      } catch (e) {
        steps.push({ step: 'Bright Data', ok: false, detail: `Proxy failed: ${e instanceof Error ? e.message : 'unknown error'}` })
        return { steps, httpStatus: 0, finalStatus: 'dead', responseTimeMs: Date.now() - start }
      }
    } else {
      steps.push({ step: 'Bright Data', ok: true, detail: 'Not needed — direct HTTP succeeded' })
    }

    return { steps, httpStatus: directStatus, finalStatus: directStatus >= 200 && directStatus < 400 ? 'alive' : 'dead', responseTimeMs: Date.now() - start }
  },
})

export const checkOneSite = action({
  args: { domain: v.string(), siteId: v.id('sites') },
  handler: async (ctx, { domain, siteId }) => {
    try {
      const result = await fetchSite(domain)
      await ctx.runMutation(api.sites.saveCheckResult, { siteId, ...result })
      return result
    } catch {
      // Network/proxy errors are expected — return HTTP 0 (unreachable)
      const result = { httpStatus: 0 as const }
      await ctx.runMutation(api.sites.saveCheckResult, { siteId, ...result })
      return result
    }
  },
})

export const checkDomainFromCountry = action({
  args: { domain: v.string(), country: v.string() },
  handler: async (_ctx, { domain, country }) => {
    return await fetchSite(domain, { forceCountry: country })
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
