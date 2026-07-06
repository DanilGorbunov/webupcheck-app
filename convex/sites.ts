import { query, mutation, action, internalMutation, internalQuery, MutationCtx } from './_generated/server'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internal } from './_generated/api'

async function adjustCounter(ctx: MutationCtx, name: string, delta: number) {
  const existing = await ctx.db.query('counters').withIndex('by_name', q => q.eq('name', name)).first()
  if (existing) {
    await ctx.db.patch(existing._id, { value: Math.max(0, existing.value + delta) })
  } else {
    await ctx.db.insert('counters', { name, value: Math.max(0, delta) })
  }
}

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
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked', 'Blacklisted', 'NeedsReview']
    const rows = await Promise.all(
      statuses.map(s => ctx.db.query('counters').withIndex('by_name', q => q.eq('name', `status_${s}`)).first())
    )
    const initialized = rows.some(r => r !== null)
    if (initialized) {
      const [active, warning, unreachable, parked, blacklisted, needsReview] = rows.map(r => r?.value ?? 0)
      const checked = active + warning + unreachable + parked + blacklisted + needsReview
      const issues  = unreachable + parked + blacklisted
      return { active, warning, unreachable, parked, blacklisted, needsReview, checked, issues, unknown: 0, total: 0, withDr50: 0, avgPrice: 0, languages: 0, lastChecked: 0 }
    }
    // Counters not yet initialized — fallback to scanning (capped)
    const take = (s: string, n: number) =>
      ctx.db.query('sites').withIndex('by_status', q => q.eq('status', s)).take(n)
    const [warningRows, unreachableRows, parkedRows, blacklistedRows, needsReviewRows, activeRows] =
      await Promise.all([take('Warning', 2000), take('Unreachable', 2000), take('Parked', 2000), take('Blacklisted', 500), take('NeedsReview', 500), take('Active', 8000)])
    const active = activeRows.length, warning = warningRows.length, unreachable = unreachableRows.length
    const parked = parkedRows.length, blacklisted = blacklistedRows.length, needsReview = needsReviewRows.length
    const checked = active + warning + unreachable + parked + blacklisted + needsReview
    const issues  = unreachable + parked + blacklisted
    return { active, warning, unreachable, parked, blacklisted, needsReview, checked, issues, total: 0, unknown: 0, withDr50: 0, avgPrice: 0, languages: 0, lastChecked: 0 }
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
    await adjustCounter(ctx, 'status_Unknown', 1)
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
    viaProxy: v.optional(v.boolean()),
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

    // Status counter is rebuilt periodically by rebuildStatusCounters (not per-mutation)
    // to avoid OCC conflicts when hundreds of checks run concurrently.

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

    // Only alert when status changes to something problematic.
    // 403/429/406 = bot-blocked: site may be alive for humans, needs manual check.
    const changed = statusBefore !== newStatus
    if (!changed) return

    const isBotBlocked = args.httpStatus === 403 || args.httpStatus === 429 || args.httpStatus === 406

    const isAlertWorthy = (() => {
      if (newStatus === 'Unreachable' || newStatus === 'Parked' || newStatus === 'Blacklisted' || newStatus === 'Suspended') return true
      if (newStatus === 'Warning') {
        if (is5xx) return true
        if (isBotBlocked) return true  // needs manual verification
        if (args.redirectUrl) {
          const destDomain = args.redirectUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
          const srcDomain = site.domain.replace(/^www\./, '')
          return destDomain !== srcDomain
        }
        return false
      }
      return false
    })()
    if (!isAlertWorthy) return

    const severity = (newStatus === 'Unreachable' || newStatus === 'Parked') ? 'critical' : 'warning'
    const message = isBotBlocked
      ? `Checker blocked (HTTP ${http}) — manual verification needed`
      : newStatus === 'Unreachable' && is5xx
      ? `Server down — ${newFailures} consecutive checks failed (HTTP ${http})`
      : newStatus === 'Unreachable'
      ? `Site is unreachable (HTTP ${http})`
      : newStatus === 'Parked'
      ? `Parking page detected — title: "${args.pageTitle ?? ''}"`
      : newStatus === 'Warning' && args.redirectUrl
      ? `Redirects to ${args.redirectUrl}`
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

      const subAlertId = await ctx.db.insert('alerts', {
        siteId: args.siteId,
        domain: rootDomain,
        severity,
        message: `Server down (subdomain: ${site.domain})`,
        subdomains: [site.domain],
        createdAt: Date.now(),
        dismissed: false,
      })
      await adjustCounter(ctx, 'alerts_active', 1)
      await ctx.scheduler.runAfter(0, internal.ai.classifyAlert, { alertId: subAlertId })
      return
    }

    const alertId = await ctx.db.insert('alerts', {
      siteId: args.siteId,
      domain: site.domain,
      severity,
      message,
      createdAt: Date.now(),
      dismissed: false,
      // bot_blocked is pre-categorized — skip AI classification
      ...(isBotBlocked ? { aiCategory: 'bot_blocked' } : {}),
    })
    await adjustCounter(ctx, 'alerts_active', 1)
    if (!isBotBlocked) {
      await ctx.scheduler.runAfter(0, internal.ai.classifyAlert, { alertId })
    }
  },
})

export const updateAlertWorkflow = mutation({
  args: { alertId: v.id('alerts'), workflowStatus: v.string() },
  handler: async (ctx, { alertId, workflowStatus }) => {
    await ctx.db.patch(alertId, { workflowStatus })
  },
})

// Dashboard stat cards: Critical = severity:critical, Needs Review = bot_blocked
export const countAlertsByType = query({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .take(5000)
    let critical = 0
    let needsReview = 0
    for (const a of alerts) {
      if (a.aiCategory === 'bot_blocked') needsReview++
      else if (a.severity === 'critical') critical++
    }
    return { critical, needsReview }
  },
})

// Owner clicked "Site is down" on a bot_blocked alert → escalate to critical + mark site Unreachable
export const markBotBlockedAsDown = mutation({
  args: { alertId: v.id('alerts') },
  handler: async (ctx, { alertId }) => {
    const alert = await ctx.db.get(alertId)
    if (!alert) return
    await ctx.db.patch(alertId, {
      severity: 'critical',
      aiCategory: 'site_down',
      message: alert.message.replace('Checker blocked', 'Confirmed down'),
    })
    await ctx.db.patch(alert.siteId, { status: 'Unreachable' })
  },
})

export const getAlertWithSite = internalQuery({
  args: { alertId: v.id('alerts') },
  handler: async (ctx, { alertId }) => {
    const alert = await ctx.db.get(alertId)
    if (!alert) return null
    const site = await ctx.db.get(alert.siteId)
    return { alert, site }
  },
})

export const setAlertAiData = internalMutation({
  args: {
    alertId: v.id('alerts'),
    aiCategory: v.string(),
    aiPriority: v.number(),
    aiReason: v.string(),
    workflowStatus: v.optional(v.string()),
  },
  handler: async (ctx, { alertId, aiCategory, aiPriority, aiReason, workflowStatus }) => {
    const patch: Record<string, unknown> = { aiCategory, aiPriority, aiReason }
    if (workflowStatus) patch.workflowStatus = workflowStatus
    await ctx.db.patch(alertId, patch)
  },
})

export const dismissAlert = mutation({
  args: { alertId: v.id('alerts') },
  handler: async (ctx, { alertId }) => {
    await ctx.db.patch(alertId, { dismissed: true, dismissedAt: Date.now() })
    await adjustCounter(ctx, 'alerts_active', -1)
  },
})

export const listAlerts = query({
  args: {
    dismissed: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { dismissed = false, limit = 500 }) => {
    const rows = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', dismissed))
      .order('desc')
      .take(Math.min(limit, 4000))
    // Strip heavy fields not needed for Kanban to reduce payload size
    return rows.map(r => ({
      _id: r._id,
      siteId: r.siteId,
      domain: r.domain,
      severity: r.severity,
      message: r.message,
      subdomains: r.subdomains,
      createdAt: r.createdAt,
      dismissed: r.dismissed,
      workflowStatus: r.workflowStatus,
      aiCategory: r.aiCategory,
      aiPriority: r.aiPriority,
      aiReason: r.aiReason ? r.aiReason.slice(0, 120) : undefined,
    }))
  },
})

export const countAlerts = query({
  args: { dismissed: v.optional(v.boolean()) },
  handler: async (ctx, { dismissed = false }) => {
    const rows = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', dismissed))
      .take(16384)
    return rows.length
  },
})

// One-time call to initialize the counter from real DB data
export const initAlertCounter = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .take(8192)
    const existing = await ctx.db.query('counters').withIndex('by_name', q => q.eq('name', 'alerts_active')).first()
    if (existing) {
      await ctx.db.patch(existing._id, { value: rows.length })
    } else {
      await ctx.db.insert('counters', { name: 'alerts_active', value: rows.length })
    }
    return rows.length
  },
})

export const fixWarningStatuses = action({
  args: {},
  handler: async (ctx) => {
    const ACTIVE_CODES = new Set([403, 429, 406, 301, 302])
    let fixed = 0
    while (true) {
      const batch = await ctx.runQuery(internal.sites.listByStatus, { status: 'Warning', limit: 300 })
      if (batch.length === 0) break
      const toFix = (batch as Array<{ _id: string; httpStatus?: number }>)
        .filter(s => s.httpStatus && ACTIVE_CODES.has(s.httpStatus))
      if (toFix.length > 0) {
        await ctx.runMutation(internal.sites.patchStatusBatch, {
          ids: toFix.map(s => s._id as never),
          status: 'Active',
        })
        fixed += toFix.length
      }
      const skipped = batch.length - toFix.length
      if (skipped === batch.length) break // whole batch has no fixable items
    }
    return { fixed }
  },
})

export const patchStatusBatch = internalMutation({
  args: { ids: v.array(v.id('sites')), status: v.string() },
  handler: async (ctx, { ids, status }) => {
    const sites = await Promise.all(ids.map(id => ctx.db.get(id)))
    await Promise.all(sites.map(s => s && ctx.db.patch(s._id, { status })))
    const tally: Record<string, number> = {}
    for (const s of sites) {
      if (s) tally[s.status] = (tally[s.status] ?? 0) + 1
    }
    await Promise.all([
      ...Object.entries(tally).map(([st, n]) => adjustCounter(ctx, `status_${st}`, -n)),
      adjustCounter(ctx, `status_${status}`, ids.length),
    ])
    return ids.length
  },
})

export const initStatusCounters = mutation({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked', 'Blacklisted', 'NeedsReview']
    const counts = await Promise.all(
      statuses.map(s => ctx.db.query('sites').withIndex('by_status', q => q.eq('status', s)).take(8192).then(r => r.length))
    )
    await Promise.all(statuses.map(async (s, i) => {
      const existing = await ctx.db.query('counters').withIndex('by_name', q => q.eq('name', `status_${s}`)).first()
      if (existing) {
        await ctx.db.patch(existing._id, { value: counts[i] })
      } else {
        await ctx.db.insert('counters', { name: `status_${s}`, value: counts[i] })
      }
    }))
    return Object.fromEntries(statuses.map((s, i) => [s, counts[i]]))
  },
})

export const resetInProgressAlerts = mutation({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .take(8000)
    const inProgress = alerts.filter(a => a.workflowStatus === 'in_progress')
    for (const a of inProgress) {
      const target = a.severity === 'critical' ? 'urgent' : 'new'
      await ctx.db.patch(a._id, { workflowStatus: target })
    }
    return { reset: inProgress.length }
  },
})

export const dismissAllAlerts = mutation({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .take(8000)
    const now = Date.now()
    for (const a of alerts) {
      await ctx.db.patch(a._id, { dismissed: true, dismissedAt: now })
    }
    await adjustCounter(ctx, 'alerts_active', -alerts.length)
    return alerts.length
  },
})

export const statusTrend = query({
  args: {},
  handler: async (ctx) => {
    try {
      const since = Date.now() - 14 * 24 * 60 * 60 * 1000
      const history = await ctx.db.query('checkHistory')
        .withIndex('by_checked_at', q => q.gte('checkedAt', since))
        .take(8000)

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
    } catch {
      return []
    }
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
    let errors = 0
    for (const site of sites) {
      try {
        const existing = await ctx.db.query('sites').withIndex('by_domain', q => q.eq('domain', site.domain)).first()
        const optional = {
          ...(site.dr !== undefined && { dr: site.dr }),
          ...(site.organicTraffic !== undefined && { organicTraffic: site.organicTraffic }),
          ...(site.audience !== undefined && { audience: site.audience }),
          ...(site.bounceRate !== undefined && { bounceRate: site.bounceRate }),
          ...(site.timeOnSite !== undefined && { timeOnSite: site.timeOnSite }),
          ...(site.mai !== undefined && { mai: site.mai }),
          ...(site.semrushAuthorityScore !== undefined && { semrushAuthorityScore: site.semrushAuthorityScore }),
          ...(site.leadingCountries !== undefined && { leadingCountries: site.leadingCountries }),
        }
        if (existing) {
          await ctx.db.patch(existing._id, {
            medialisterId: site.medialisterId, domain: site.domain,
            languages: site.languages, formatType: site.formatType,
            price: site.price, urlExamples: site.urlExamples,
            ...optional, medialistSyncedAt: Date.now(),
          })
        } else {
          await adjustCounter(ctx, 'status_Unknown', 1)
          await ctx.db.insert('sites', {
            medialisterId: site.medialisterId, domain: site.domain,
            languages: site.languages, formatType: site.formatType,
            price: site.price, urlExamples: site.urlExamples,
            ...optional, status: 'Unknown', medialistSyncedAt: Date.now(),
          })
        }
      } catch {
        errors++
      }
    }
    return errors
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
        .withIndex('by_type', q => q.eq('type', 'medialister_sync'))
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
    return ctx.db.query('sites')
      .withIndex('by_status', q => q.eq('status', 'Unknown'))
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
  // 403/429/406 = bot-blocked: can't confirm alive → needs manual check → Warning
  if (r.httpStatus === 403 || r.httpStatus === 429 || r.httpStatus === 406) return 'Warning'
  if (r.httpStatus === 301 || r.httpStatus === 302) return 'Active'
  if (r.httpStatus >= 200 && r.httpStatus < 300) return 'Active'
  return 'Unknown'
}

function getRootDomain(domain: string): string {
  const parts = domain.split('.')
  if (parts.length <= 2) return domain
  return parts.slice(-2).join('.')
}

// ─── Reset all sites to Unknown (re-check from scratch) ──────────────────────

export const resetBatch = internalMutation({
  args: { ids: v.array(v.id('sites')) },
  handler: async (ctx, { ids }) => {
    const sites = await Promise.all(ids.map(id => ctx.db.get(id)))
    await Promise.all(sites.map(s => s && ctx.db.patch(s._id, { status: 'Unknown' })))
    const tally: Record<string, number> = {}
    for (const s of sites) {
      if (s && s.status !== 'Unknown') tally[s.status] = (tally[s.status] ?? 0) + 1
    }
    const unknownGain = Object.values(tally).reduce((a, b) => a + b, 0)
    await Promise.all([
      ...Object.entries(tally).map(([st, n]) => adjustCounter(ctx, `status_${st}`, -n)),
      adjustCounter(ctx, 'status_Unknown', unknownGain),
    ])
    return ids.length
  },
})

export const resetAllToUnknown = action({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked', 'Blacklisted', 'NeedsReview']
    let total = 0
    for (const status of statuses) {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const batch: any[] = await ctx.runQuery(internal.sites.listByStatus, { status, limit: 300 })
        if (batch.length === 0) break
        await ctx.runMutation(internal.sites.resetBatch, { ids: batch.map((s: { _id: string }) => s._id as never) })
        total += batch.length
        if (batch.length < 300) break
      }
    }
    return { total }
  },
})

export const listByStatus = internalQuery({
  args: { status: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { status, limit = 300 }) => {
    return ctx.db.query('sites')
      .withIndex('by_status', q => q.eq('status', status))
      .take(limit)
  },
})

// ─── Analytics queries ────────────────────────────────────────────────────────

export const topUnreachableByDR = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('sites')
      .withIndex('by_status', q => q.eq('status', 'Unreachable'))
      .take(2000)
    return rows
      .filter(s => s.dr != null && s.dr > 0)
      .sort((a, b) => (b.dr ?? 0) - (a.dr ?? 0))
      .slice(0, 15)
      .map(s => ({ domain: s.domain, dr: s.dr ?? 0, price: s.price ?? 0, status: s.status ?? '' }))
  },
})

export const siteStatusByPrice = query({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked'] as const
    const buckets: Record<string, Record<string, number>> = {
      '0-50': { Active: 0, Warning: 0, Unreachable: 0, Parked: 0 },
      '50-200': { Active: 0, Warning: 0, Unreachable: 0, Parked: 0 },
      '200+': { Active: 0, Warning: 0, Unreachable: 0, Parked: 0 },
    }
    for (const status of statuses) {
      const rows = await ctx.db.query('sites')
        .withIndex('by_status', q => q.eq('status', status))
        .take(3000)
      for (const s of rows) {
        const p = s.price ?? 0
        const bk = p < 50 ? '0-50' : p < 200 ? '50-200' : '200+'
        buckets[bk][status]++
      }
    }
    return buckets
  },
})

export const languageBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const unreachable = await ctx.db.query('sites')
      .withIndex('by_status', q => q.eq('status', 'Unreachable'))
      .take(3000)
    const warning = await ctx.db.query('sites')
      .withIndex('by_status', q => q.eq('status', 'Warning'))
      .take(3000)
    const counts: Record<string, { unreachable: number; warning: number }> = {}
    for (const s of unreachable) {
      const lang = ((s.languages as string[]) ?? [])[0] ?? 'unknown'
      if (!counts[lang]) counts[lang] = { unreachable: 0, warning: 0 }
      counts[lang].unreachable++
    }
    for (const s of warning) {
      const lang = ((s.languages as string[]) ?? [])[0] ?? 'unknown'
      if (!counts[lang]) counts[lang] = { unreachable: 0, warning: 0 }
      counts[lang].warning++
    }
    return Object.entries(counts)
      .map(([lang, v]) => ({ lang, unreachable: v.unreachable, warning: v.warning, total: v.unreachable + v.warning }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
  },
})

export const syncHistory = query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db.query('syncLog')
      .withIndex('by_type', q => q.eq('type', 'medialister_sync'))
      .order('desc')
      .take(10)
    return logs.map(l => ({
      startedAt: l.startedAt,
      completedAt: l.completedAt,
      totalItems: l.totalItems ?? 0,
      processed: l.processed ?? 0,
      status: l.status,
    }))
  },
})

export const alertsByDay = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    const rows = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .order('desc')
      .take(4000)
    const byDay: Record<string, { total: number; critical: number }> = {}
    for (const a of rows) {
      if (a.createdAt < cutoff) continue
      const d = new Date(a.createdAt).toISOString().slice(0, 10)
      if (!byDay[d]) byDay[d] = { total: 0, critical: 0 }
      byDay[d].total++
      if (a.severity === 'critical') byDay[d].critical++
    }
    return Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }))
  },
})

export const dashboardAlertStats = query({
  // nowMs passed from client (rounded to nearest hour) — Date.now() not allowed in queries
  args: { nowMs: v.number() },
  handler: async (ctx, { nowMs }) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .order('desc')
      .take(3000)

    const httpTypes: Record<string, number> = {
      'HTTP 0': 0, 'HTTP 404': 0, 'Server 5xx': 0,
      'Redirect': 0, 'Parked/Bot': 0, 'Other': 0,
    }
    const ageBuckets: Record<string, number> = { '<1d': 0, '1-7d': 0, '7-30d': 0, '>30d': 0 }
    const byDay: Record<string, { total: number; critical: number }> = {}
    const cutoff14 = nowMs - 14 * 24 * 3600 * 1000
    let totalAge = 0

    for (const a of alerts) {
      const msg = (a.message ?? '').toLowerCase()
      if (msg.includes('http 0') || msg.includes('unreachable') || msg.includes('consecutive')) {
        httpTypes['HTTP 0']++
      } else if (msg.includes('http 404') || msg.includes('not found')) {
        httpTypes['HTTP 404']++
      } else if (msg.includes('http 5') || msg.includes('server down')) {
        httpTypes['Server 5xx']++
      } else if (msg.includes('redirect')) {
        httpTypes['Redirect']++
      } else if (msg.includes('park') || msg.includes('403') || msg.includes('429') || msg.includes('bot')) {
        httpTypes['Parked/Bot']++
      } else {
        httpTypes['Other']++
      }

      const ageDays = (nowMs - a.createdAt) / 86400000
      totalAge += ageDays
      if (ageDays < 1) ageBuckets['<1d']++
      else if (ageDays < 7) ageBuckets['1-7d']++
      else if (ageDays < 30) ageBuckets['7-30d']++
      else ageBuckets['>30d']++

      if (a.createdAt >= cutoff14) {
        const ms = a.createdAt
        const d = new Date(ms)
        const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
        if (!byDay[day]) byDay[day] = { total: 0, critical: 0 }
        byDay[day].total++
        if (a.severity === 'critical') byDay[day].critical++
      }
    }

    return {
      httpTypes,
      ageBuckets,
      byDay: Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v })),
      avgAgeDays: alerts.length > 0 ? totalAge / alerts.length : 0,
      totalAlerts: alerts.length,
    }
  },
})

export const riskMatrixSites = query({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Unreachable', 'Warning', 'Active'] as const
    const result: { domain: string; dr: number; price: number; status: string }[] = []
    for (const status of statuses) {
      const limit = status === 'Active' ? 200 : 1000
      const rows = await ctx.db.query('sites')
        .withIndex('by_status', q => q.eq('status', status))
        .take(limit)
      for (const s of rows) {
        if ((s.dr ?? 0) > 0) {
          result.push({ domain: s.domain, dr: s.dr ?? 0, price: s.price ?? 0, status })
        }
      }
    }
    return result
  },
})

// Called after each cron run to keep status counters accurate.
// Avoids per-mutation adjustCounter OCC conflicts during bulk parallel checks.
export const rebuildStatusCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked', 'Blacklisted', 'NeedsReview']
    for (const s of statuses) {
      const rows = await ctx.db.query('sites').withIndex('by_status', q => q.eq('status', s)).take(8192)
      const count = rows.length
      const existing = await ctx.db.query('counters').withIndex('by_name', q => q.eq('name', `status_${s}`)).first()
      if (existing) {
        await ctx.db.patch(existing._id, { value: count })
      } else {
        await ctx.db.insert('counters', { name: `status_${s}`, value: count })
      }
    }
  },
})

