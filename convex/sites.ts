import { query, mutation } from './_generated/server'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'

export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { status, limit = 50 }) => {
    let q = status && status !== 'all'
      ? ctx.db.query('sites').withIndex('by_status', q => q.eq('status', status))
      : ctx.db.query('sites')
    const sites = await q.order('desc').take(limit)
    return sites
  },
})

export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    return ctx.db.query('sites').withIndex('by_domain', q => q.eq('domain', domain)).first()
  },
})

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('sites').collect()
    const total = all.length
    const active = all.filter(s => s.status === 'Active').length
    const warning = all.filter(s => s.status === 'Warning').length
    const unreachable = all.filter(s => s.status === 'Unreachable').length
    const parked = all.filter(s => s.status === 'Parked').length
    const blacklisted = all.filter(s => s.status === 'Blacklisted').length
    const needsReview = all.filter(s => s.status === 'NeedsReview').length
    const issues = unreachable + parked + blacklisted
    const unknown = all.filter(s => s.status === 'Unknown').length
    const checked = total - unknown
    const withDr50 = all.filter(s => (s.dr ?? 0) >= 50).length
    const avgPrice = total ? Math.round(all.reduce((a, b) => a + b.price, 0) / total) : 0
    const languages = new Set(all.flatMap(s => s.languages)).size
    const lastChecked = all.reduce((max, s) => Math.max(max, s.lastCheckedAt ?? 0), 0)
    return { total, active, warning, unreachable, parked, blacklisted, needsReview, issues, unknown, checked, withDr50, avgPrice, languages, lastChecked }
  },
})

export const upsertFromMedialister = mutation({
  args: {
    medialisterId: v.string(),
    domain: v.string(),
    languages: v.array(v.string()),
    formatType: v.string(),
    price: v.number(),
    dr: v.optional(v.number()),
    organicTraffic: v.optional(v.number()),
    audience: v.optional(v.number()),
    bounceRate: v.optional(v.number()),
    timeOnSite: v.optional(v.number()),
    mai: v.optional(v.number()),
    semrushAuthorityScore: v.optional(v.number()),
    leadingCountries: v.optional(v.any()),
    urlExamples: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('sites').withIndex('by_domain', q => q.eq('domain', args.domain)).first()
    if (existing) {
      await ctx.db.patch(existing._id, {
        dr: args.dr,
        organicTraffic: args.organicTraffic,
        audience: args.audience,
        bounceRate: args.bounceRate,
        timeOnSite: args.timeOnSite,
        mai: args.mai,
        semrushAuthorityScore: args.semrushAuthorityScore,
        leadingCountries: args.leadingCountries,
        price: args.price,
        medialistSyncedAt: Date.now(),
      })
      return existing._id
    }
    return ctx.db.insert('sites', { ...args, status: 'Unknown', medialistSyncedAt: Date.now() })
  },
})

export const saveCheckResult = mutation({
  args: {
    siteId: v.id('sites'),
    httpStatus: v.optional(v.number()),
    redirectUrl: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    isParked: v.optional(v.boolean()),
    responseTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.siteId)
    if (!site) return

    const statusBefore = site.status
    const prevFailures = site.consecutiveFailures ?? 0

    // Derive status using pre-check failure count
    const newStatus = deriveStatus({ ...args, consecutiveFailures: prevFailures })

    // Update consecutive failure counter
    const http = args.httpStatus ?? 0
    const is5xx = http >= 500
    const is2xx = http >= 200 && http < 300
    const newFailures = is5xx ? prevFailures + 1 : is2xx ? 0 : prevFailures
    const lastSuccessAt = is2xx ? Date.now() : site.lastSuccessAt

    await ctx.db.patch(args.siteId, {
      httpStatus: args.httpStatus,
      redirectUrl: args.redirectUrl,
      pageTitle: args.pageTitle,
      metaDescription: args.metaDescription,
      isParked: args.isParked,
      responseTimeMs: args.responseTimeMs,
      status: newStatus,
      lastCheckedAt: Date.now(),
      consecutiveFailures: newFailures,
      lastSuccessAt,
    })

    await ctx.db.insert('checkHistory', {
      siteId: args.siteId,
      domain: site.domain,
      checkedAt: Date.now(),
      httpStatus: args.httpStatus,
      redirectUrl: args.redirectUrl,
      pageTitle: args.pageTitle,
      metaDescription: args.metaDescription,
      isParked: args.isParked,
      responseTimeMs: args.responseTimeMs,
      statusBefore,
      statusAfter: newStatus,
    })

    const ALERT_STATUSES = ['Unreachable', 'Parked', 'Blacklisted', 'Suspended', 'Warning']
    const changed = statusBefore !== newStatus
    if (!changed || !ALERT_STATUSES.includes(newStatus)) return

    const severity = (newStatus === 'Unreachable' || newStatus === 'Parked') ? 'critical' : 'warning'
    const message = newStatus === 'Unreachable' && is5xx
      ? `Server down — ${newFailures} consecutive checks failed (HTTP ${http})`
      : newStatus === 'Unreachable'
      ? `Site is unreachable (HTTP ${http})`
      : newStatus === 'Parked'
      ? `Parking page detected — title: "${args.pageTitle ?? ''}"`
      : newStatus === 'Warning' && args.redirectUrl
      ? `Redirects to ${args.redirectUrl}`
      : newStatus === 'Warning'
      ? `Bot protection / rate limit (HTTP ${http})`
      : `Status changed: ${statusBefore} → ${newStatus}`

    // Subdomain grouping: group N subdomains of same root into one alert
    const rootDomain = getRootDomain(site.domain)
    const isSubdomain = rootDomain !== site.domain

    if (isSubdomain) {
      const existingGroup = await ctx.db.query('alerts')
        .withIndex('by_dismissed', q => q.eq('dismissed', false))
        .filter(q => q.and(
          q.eq(q.field('domain'), rootDomain),
          q.eq(q.field('severity'), severity),
        ))
        .first()

      if (existingGroup) {
        const subs = existingGroup.subdomains ?? []
        if (!subs.includes(site.domain)) {
          const newSubs = [...subs, site.domain]
          await ctx.db.patch(existingGroup._id, {
            subdomains: newSubs,
            message: `Server down — ${newSubs.length} subdomains affected`,
          })
        }
        return
      }

      // First subdomain to fail → create grouped alert under root domain
      await ctx.db.insert('alerts', {
        siteId: args.siteId,
        domain: rootDomain,
        severity,
        message: `Server down (subdomain: ${site.domain})`,
        subdomains: [site.domain],
        createdAt: Date.now(),
        dismissed: false,
      })
      return
    }

    await ctx.db.insert('alerts', {
      siteId: args.siteId,
      domain: site.domain,
      severity,
      message,
      createdAt: Date.now(),
      dismissed: false,
    })
  },
})

export const dismissAlert = mutation({
  args: { alertId: v.id('alerts') },
  handler: async (ctx, { alertId }) => {
    await ctx.db.patch(alertId, { dismissed: true, dismissedAt: Date.now() })
  },
})

export const listAlerts = query({
  args: { dismissed: v.optional(v.boolean()) },
  handler: async (ctx, { dismissed = false }) => {
    return ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', dismissed))
      .order('desc')
      .take(500)
  },
})

export const countAlerts = query({
  args: { dismissed: v.optional(v.boolean()) },
  handler: async (ctx, { dismissed = false }) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', dismissed))
      .collect()
    return alerts.length
  },
})

export const dismissAllAlerts = mutation({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .collect()
    const now = Date.now()
    for (const a of alerts) {
      await ctx.db.patch(a._id, { dismissed: true, dismissedAt: now })
    }
    return alerts.length
  },
})

export const statusTrend = query({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - 14 * 24 * 60 * 60 * 1000
    const history = await ctx.db.query('checkHistory')
      .withIndex('by_checked_at', q => q.gte('checkedAt', since))
      .collect()

    const days: Record<string, { date: string; unreachable: number; warning: number; active: number; parked: number }> = {}
    for (const entry of history) {
      const d = new Date(entry.checkedAt)
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!days[key]) days[key] = { date: key, unreachable: 0, warning: 0, active: 0, parked: 0 }
      const s = entry.statusAfter
      if (s === 'Unreachable') days[key].unreachable++
      else if (s === 'Warning') days[key].warning++
      else if (s === 'Active') days[key].active++
      else if (s === 'Parked') days[key].parked++
    }
    return Object.values(days).sort((a, b) => a.date.localeCompare(b.date))
  },
})

export const upsertBatch = mutation({
  args: {
    sites: v.array(v.object({
      medialisterId: v.string(), domain: v.string(),
      languages: v.array(v.string()), formatType: v.string(), price: v.number(),
      dr: v.optional(v.number()), organicTraffic: v.optional(v.number()),
      audience: v.optional(v.number()), bounceRate: v.optional(v.number()),
      timeOnSite: v.optional(v.number()), mai: v.optional(v.number()),
      semrushAuthorityScore: v.optional(v.number()),
      leadingCountries: v.optional(v.any()), urlExamples: v.array(v.string()),
    }))
  },
  handler: async (ctx, { sites }) => {
    for (const site of sites) {
      const existing = await ctx.db.query('sites').withIndex('by_domain', q => q.eq('domain', site.domain)).first()
      const clean = Object.fromEntries(Object.entries(site).filter(([, val]) => val !== undefined))
      if (existing) {
        await ctx.db.patch(existing._id, { ...clean, medialistSyncedAt: Date.now() })
      } else {
        await ctx.db.insert('sites', { ...clean, status: 'Unknown', medialistSyncedAt: Date.now() })
      }
    }
  }
})

export const startSyncLog = mutation({
  args: { totalItems: v.number(), totalPages: v.number() },
  handler: async (ctx, args) => {
    const running = await ctx.db.query('syncLog')
      .filter(q => q.and(q.eq(q.field('type'), 'medialister_sync'), q.eq(q.field('status'), 'running')))
      .collect()
    for (const log of running) await ctx.db.patch(log._id, { status: 'failed', message: 'interrupted' })
    return ctx.db.insert('syncLog', {
      type: 'medialister_sync', startedAt: Date.now(), totalItems: args.totalItems,
      processed: 0, status: 'running', message: `0/${args.totalPages} pages`
    })
  }
})

export const updateSyncLog = mutation({
  args: { logId: v.id('syncLog'), processed: v.number(), totalPages: v.number() },
  handler: async (ctx, { logId, processed, totalPages }) => {
    await ctx.db.patch(logId, { processed, message: `${processed}/${totalPages} pages` })
  }
})

export const completeSyncLog = mutation({
  args: { logId: v.id('syncLog') },
  handler: async (ctx, { logId }) => {
    await ctx.db.patch(logId, { status: 'completed', completedAt: Date.now() })
  }
})

export const getActiveSyncLog = query({
  args: {},
  handler: async (ctx) => {
    try {
      const logs = await ctx.db.query('syncLog')
        .filter(q => q.eq(q.field('type'), 'medialister_sync'))
        .order('desc')
        .take(1)
      return logs[0] ?? null
    } catch {
      return null
    }
  }
})

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return ctx.db.query('sites').order('desc').paginate(paginationOpts)
  }
})

export const listNeedingCheck = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 100 }) => {
    // Prioritize high DR sites first using by_dr index
    return ctx.db.query('sites')
      .withIndex('by_dr')
      .order('desc')
      .filter(q => q.eq(q.field('status'), 'Unknown'))
      .take(limit)
  }
})

export const siteHistory = query({
  args: { siteId: v.id('sites') },
  handler: async (ctx, { siteId }) => {
    return ctx.db.query('checkHistory')
      .withIndex('by_site', q => q.eq('siteId', siteId))
      .order('desc')
      .take(50)
  },
})

// consecutiveFailures = failures recorded BEFORE this check
function deriveStatus(r: {
  httpStatus?: number
  isParked?: boolean
  consecutiveFailures?: number
}): string {
  if (!r.httpStatus || r.httpStatus === 0) return 'Unreachable'
  if (r.isParked) return 'Parked'
  if (r.httpStatus === 404) return 'Unreachable'
  // 5xx retry logic: Warning until 3rd consecutive failure → Unreachable
  if (r.httpStatus >= 500) {
    return (r.consecutiveFailures ?? 0) >= 2 ? 'Unreachable' : 'Warning'
  }
  if (r.httpStatus === 403 || r.httpStatus === 429 || r.httpStatus === 406) return 'Warning'
  if (r.httpStatus === 301 || r.httpStatus === 302) return 'Warning'
  if (r.httpStatus >= 200 && r.httpStatus < 300) return 'Active'
  return 'Unknown'
}

function getRootDomain(domain: string): string {
  const parts = domain.split('.')
  if (parts.length <= 2) return domain
  return parts.slice(-2).join('.')
}
