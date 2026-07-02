import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

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
    const issues = all.filter(s => ['Unreachable', 'Parked', 'Blacklisted'].includes(s.status)).length
    const unknown = all.filter(s => s.status === 'Unknown').length
    const withDr50 = all.filter(s => (s.dr ?? 0) >= 50).length
    const avgPrice = total ? Math.round(all.reduce((a, b) => a + b.price, 0) / total) : 0
    const languages = new Set(all.flatMap(s => s.languages)).size
    const lastChecked = all.reduce((max, s) => Math.max(max, s.lastCheckedAt ?? 0), 0)
    return { total, active, warning, issues, unknown, withDr50, avgPrice, languages, lastChecked }
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
    const newStatus = deriveStatus(args)

    await ctx.db.patch(args.siteId, {
      httpStatus: args.httpStatus,
      redirectUrl: args.redirectUrl,
      pageTitle: args.pageTitle,
      metaDescription: args.metaDescription,
      isParked: args.isParked,
      responseTimeMs: args.responseTimeMs,
      status: newStatus,
      lastCheckedAt: Date.now(),
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

    // Create alert if status changed negatively
    if (statusBefore !== 'Unknown' && statusBefore !== newStatus) {
      const severity = ['Unreachable', 'Blacklisted'].includes(newStatus) ? 'critical'
        : newStatus === 'Parked' ? 'critical'
        : 'warning'
      const message = newStatus === 'Unreachable' ? `Site is unreachable (HTTP ${args.httpStatus ?? 0})`
        : newStatus === 'Parked' ? `Parking page detected — title: "${args.pageTitle}"`
        : newStatus === 'Warning' && args.redirectUrl ? `Redirects to ${args.redirectUrl}`
        : `Status changed: ${statusBefore} → ${newStatus}`

      await ctx.db.insert('alerts', {
        siteId: args.siteId,
        domain: site.domain,
        severity,
        message,
        createdAt: Date.now(),
        dismissed: false,
      })
    }
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
      .take(100)
  },
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

function deriveStatus(r: {
  httpStatus?: number
  isParked?: boolean
  redirectUrl?: string
}): string {
  if (!r.httpStatus || r.httpStatus === 0) return 'Unreachable'
  if (r.httpStatus >= 400) return 'Unreachable'
  if (r.isParked) return 'Parked'
  if (r.httpStatus === 301 || r.httpStatus === 302) return 'Warning'
  if (r.httpStatus >= 200 && r.httpStatus < 300) return 'Active'
  return 'Unknown'
}
