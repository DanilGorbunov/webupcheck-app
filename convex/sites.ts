import { query, mutation, action, internalMutation, internalQuery, internalAction, MutationCtx } from './_generated/server'
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


// Lightweight counter-only query — reads 7 counter docs, no full table scan
export const siteCounters = query({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked', 'Blacklisted', 'NeedsReview', 'Unknown']
    const rows = await Promise.all(
      statuses.map(s => ctx.db.query('counters').withIndex('by_name', q => q.eq('name', `status_${s}`)).first())
    )
    const [active, warning, unreachable, parked, blacklisted, needsReview, unknown] = rows.map(r => r?.value ?? 0)
    const total   = active + warning + unreachable + parked + blacklisted + needsReview + unknown
    const checked = active + warning + unreachable + parked + blacklisted + needsReview
    const issues  = unreachable + parked + blacklisted
    return { active, warning, unreachable, parked, blacklisted, needsReview, checked, issues, unknown, total }
  },
})

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const statuses = ['Active', 'Warning', 'Unreachable', 'Parked', 'Blacklisted', 'NeedsReview', 'Unknown']
    const rows = await Promise.all(
      statuses.map(s => ctx.db.query('counters').withIndex('by_name', q => q.eq('name', `status_${s}`)).first())
    )

    // Compute site-level stats (DR, price, languages) from a sample scan
    const sample = await ctx.db.query('sites').take(8000)
    const withDr50 = sample.filter(s => (s.dr ?? 0) >= 50).length
    const priced = sample.filter(s => s.price > 0)
    const avgPrice = priced.length ? Math.round(priced.reduce((a, s) => a + s.price, 0) / priced.length) : 0
    const langSet = new Set<string>()
    sample.forEach(s => (s.languages ?? []).forEach((l: string) => langSet.add(l)))
    const languages = langSet.size

    const initialized = rows.some(r => r !== null)
    if (initialized) {
      const [active, warning, unreachable, parked, blacklisted, needsReview, unknown] = rows.map(r => r?.value ?? 0)
      const total   = active + warning + unreachable + parked + blacklisted + needsReview + unknown
      const checked = active + warning + unreachable + parked + blacklisted + needsReview
      const issues  = unreachable + parked + blacklisted
      return { active, warning, unreachable, parked, blacklisted, needsReview, checked, issues, unknown, total, withDr50, avgPrice, languages, lastChecked: 0 }
    }
    // Counters not yet initialized — fallback to scanning (capped)
    const take = (s: string, n: number) =>
      ctx.db.query('sites').withIndex('by_status', q => q.eq('status', s)).take(n)
    const [warningRows, unreachableRows, parkedRows, blacklistedRows, needsReviewRows, activeRows] =
      await Promise.all([take('Warning', 2000), take('Unreachable', 2000), take('Parked', 2000), take('Blacklisted', 500), take('NeedsReview', 500), take('Active', 8000)])
    const active = activeRows.length, warning = warningRows.length, unreachable = unreachableRows.length
    const parked = parkedRows.length, blacklisted = blacklistedRows.length, needsReview = needsReviewRows.length
    const total   = active + warning + unreachable + parked + blacklisted + needsReview
    const checked = total
    const issues  = unreachable + parked + blacklisted
    return { active, warning, unreachable, parked, blacklisted, needsReview, checked, issues, total, unknown: 0, withDr50, avgPrice, languages, lastChecked: 0 }
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
    wordCount: v.optional(v.number()),
    ogImage: v.optional(v.string()),
    canonical: v.optional(v.string()),
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
      viaProxy: args.viaProxy,
      ...(args.wordCount != null ? { wordCount: args.wordCount } : {}),
      ...(args.ogImage ? { ogImage: args.ogImage } : {}),
      ...(args.canonical ? { canonical: args.canonical } : {}),
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

    // When site is confirmed alive (2xx, not parked), auto-dismiss any open alerts.
    // This fires on every successful check — direct 200 OR proxy 200 after 403 retry.
    if (is2xx && !args.isParked) {
      // Primary: alerts directly attached to this siteId
      const openAlerts = await ctx.db.query('alerts')
        .withIndex('by_site', q => q.eq('siteId', args.siteId))
        .filter(q => q.eq(q.field('dismissed'), false))
        .collect()

      // www. mismatch fix: for path-based/subdomain sites, also dismiss group alerts
      // whose domain = rootDomain and which list this site.domain in their subdomains.
      // This catches the case where www.example.com/path and example.com/path are two
      // separate site records — the group alert may be attached to the other record's siteId.
      const rootDomain = getRootDomain(site.domain)
      if (rootDomain !== site.domain) {
        const groupAlerts = await ctx.db.query('alerts')
          .withIndex('by_dismissed', q => q.eq('dismissed', false))
          .filter(q => q.eq(q.field('domain'), rootDomain))
          .collect()
        const seen = new Set(openAlerts.map(a => a._id.toString()))
        for (const ga of groupAlerts) {
          if (!seen.has(ga._id.toString()) &&
              (ga.subdomains ?? []).some(s => s === site.domain || s.replace(/^www\./, '') === site.domain.replace(/^www\./, ''))) {
            openAlerts.push(ga)
            seen.add(ga._id.toString())
          }
        }
      }

      if (openAlerts.length > 0) {
        const now = Date.now()
        for (const alert of openAlerts) {
          await ctx.db.patch(alert._id, { dismissed: true, dismissedAt: now })
          await adjustCounter(ctx, 'alerts_active', -1)
        }
      }
      return
    }

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

    let severity = (newStatus === 'Unreachable' || newStatus === 'Parked') ? 'critical' : 'warning'
    let message = isBotBlocked
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

    // Cloudflare detection: HTTP 0 that follows HTTP 403 = bot-protected, not truly dead
    let isCloudflareBlock = false
    if (http === 0 && !isBotBlocked) {
      const recentHistory = await ctx.db.query('checkHistory')
        .withIndex('by_site', q => q.eq('siteId', args.siteId))
        .order('desc')
        .take(5)
      isCloudflareBlock = recentHistory.some(h =>
        h.httpStatus === 403 || h.httpStatus === 429 || h.httpStatus === 406
      )
      if (isCloudflareBlock) {
        severity = 'warning'
        message = `Cloudflare protection (HTTP 403 → 0) — site may be accessible in browser`
      }
    }
    const effectiveBotBlocked = isBotBlocked || isCloudflareBlock

    // Sites with real SEO signals are likely temporarily unreachable, not dead.
    // DR ≥ 20 or any organic traffic or audience = real publisher site → keep in Urgent.
    const siteIsReal = (site.dr ?? 0) >= 20 || (site.organicTraffic ?? 0) > 0 || (site.audience ?? 0) > 0
    // HTTP 0 on a real site = false positive (Cloudflare/geo block), not dead
    const isHttp0Dead = http === 0 && !effectiveBotBlocked && !siteIsReal

    // Snapshot SEO metrics from site at alert creation time
    const seoFields = {
      ...(site.dr != null ? { dr: site.dr } : {}),
      ...(site.organicTraffic != null ? { organicTraffic: site.organicTraffic } : {}),
    }

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
        message: `Server down (subdomain: ${site.domain})${http === 0 ? ' — HTTP 0' : http > 0 ? ` — HTTP ${http}` : ''}`,
        subdomains: [site.domain],
        createdAt: Date.now(),
        dismissed: false,
        workflowStatus: isHttp0Dead ? 'dead' : severity === 'critical' ? 'urgent' : 'new',
        ...seoFields,
      })
      await adjustCounter(ctx, 'alerts_active', 1)
      await ctx.scheduler.runAfter(0, internal.ai.classifyAlert, { alertId: subAlertId })
      return
    }

    // Deduplicate: if an open alert already exists for this site, update it in place
    const existingAlert = await ctx.db.query('alerts')
      .withIndex('by_site', q => q.eq('siteId', args.siteId))
      .filter(q => q.eq(q.field('dismissed'), false))
      .first()

    if (existingAlert) {
      const currentWf = existingAlert.workflowStatus ?? 'new'
      const wfPatch = isHttp0Dead && !['dead', 'done', 'ignored'].includes(currentWf)
        ? { workflowStatus: 'dead' }
        : severity === 'critical' && currentWf === 'new'
        ? { workflowStatus: 'urgent' }
        : {}
      await ctx.db.patch(existingAlert._id, {
        severity,
        message,
        ...(effectiveBotBlocked ? { aiCategory: 'bot_blocked' } : {}),
        ...wfPatch,
      })
      if (!effectiveBotBlocked) {
        await ctx.scheduler.runAfter(0, internal.ai.classifyAlert, { alertId: existingAlert._id })
      }
      return
    }

    const alertId = await ctx.db.insert('alerts', {
      siteId: args.siteId,
      domain: site.domain,
      severity,
      message,
      createdAt: Date.now(),
      dismissed: false,
      workflowStatus: isHttp0Dead ? 'dead' : severity === 'critical' ? 'urgent' : 'new',
      ...(effectiveBotBlocked ? { aiCategory: 'bot_blocked' } : {}),
      ...seoFields,
    })
    await adjustCounter(ctx, 'alerts_active', 1)
    if (!effectiveBotBlocked) {
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
      .take(8192)
    let critical = 0, needsReview = 0, warning = 0
    for (const a of alerts) {
      if (a.aiCategory === 'bot_blocked') needsReview++
      else if (a.severity === 'critical') critical++
      else if (a.severity === 'warning') warning++
    }
    return { critical, needsReview, warning }
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

export const listAlertSiteIdPage = internalQuery({
  args: { afterCreatedAt: v.number() },
  handler: async (ctx, { afterCreatedAt }) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_created', q => q.gte('createdAt', afterCreatedAt))
      .filter(q => q.eq(q.field('dismissed'), false))
      .order('asc')
      .take(4000)
    return alerts.map(a => ({ siteId: a.siteId as string, createdAt: a.createdAt }))
  },
})

export const listAlertPage = internalQuery({
  args: { afterCreatedAt: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { afterCreatedAt, limit = 500 }) => {
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_created', q => q.gte('createdAt', afterCreatedAt))
      .filter(q => q.eq(q.field('dismissed'), false))
      .order('asc')
      .take(limit)
    return alerts.map(a => ({
      _id: a._id as string,
      siteId: a.siteId as string,
      domain: a.domain as string,
      createdAt: a.createdAt,
      severity: a.severity,
      aiCategory: a.aiCategory,
    }))
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
      .take(Math.min(limit, 16384))
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
    if (dismissed) {
      const rows = await ctx.db.query('alerts')
        .withIndex('by_dismissed', q => q.eq('dismissed', true))
        .take(8192)
      return rows.length
    }
    // Count only actionable columns (new + urgent + in_progress + dead).
    // Excludes done/ignored (resolved) and null-workflowStatus (legacy) so the
    // sidebar badge matches what users actually see in the Kanban columns.
    const [a, b, c, d] = await Promise.all([
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'new')).take(8192),
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'urgent')).take(8192),
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'in_progress')).take(8192),
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'dead')).take(8192),
    ])
    return a.length + b.length + c.length + d.length
  },
})

export const rebuildAlertCounterPage = internalMutation({
  args: { cursor: v.optional(v.string()), count: v.number() },
  handler: async (ctx, { cursor, count }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .paginate({ cursor: cursor ?? null, numItems: 2048 })
    const newCount = count + page.page.length
    if (page.isDone) {
      const existing = await ctx.db.query('counters').withIndex('by_name', q => q.eq('name', 'alerts_active')).first()
      if (existing) {
        await ctx.db.patch(existing._id, { value: newCount })
      } else {
        await ctx.db.insert('counters', { name: 'alerts_active', value: newCount })
      }
      return { done: true, count: newCount }
    }
    return { done: false, cursor: page.continueCursor, count: newCount }
  },
})

// Action that paginates through all alerts to rebuild the counter accurately
export const rebuildAlertCounter = action({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined
    let count = 0
    let done = false
    while (!done) {
      const result: { done: boolean; count: number; cursor?: string } = await ctx.runMutation(internal.sites.rebuildAlertCounterPage, { cursor, count })
      count = result.count
      done = result.done
      if (!done) cursor = result.cursor
    }
    return count
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

export const logReverifyComplete = internalMutation({
  args: { dismissed: v.number(), stillDead: v.number(), startedAt: v.number() },
  handler: async (ctx, { dismissed, stillDead, startedAt }) => {
    await ctx.db.insert('syncLog', {
      type: 'alert_reverify',
      startedAt,
      completedAt: Date.now(),
      totalItems: dismissed + stillDead,
      processed: dismissed + stillDead,
      status: 'completed',
      message: `Reverify done — dismissed ${dismissed}, still dead ${stillDead}`,
    })
  },
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

export const getLastReverifyLog = query({
  args: {},
  handler: async (ctx) => {
    try {
      const logs = await ctx.db.query('syncLog')
        .withIndex('by_type', q => q.eq('type', 'alert_reverify'))
        .order('desc')
        .take(1)
      return logs[0] ?? null
    } catch {
      return null
    }
  },
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
  const host = domain.split('/')[0] // strip path like tapinto.net/towns/south-brunswick → tapinto.net
  const parts = host.split('.')
  if (parts.length <= 2) return host
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
    const allRows = await Promise.all(
      statuses.map(status =>
        ctx.db.query('sites')
          .withIndex('by_status', q => q.eq('status', status))
          .take(3000)
          .then(rows => rows.map(s => ({ price: s.price ?? 0, status })))
      )
    )
    for (const rows of allRows) {
      for (const s of rows) {
        const bk = s.price < 50 ? '0-50' : s.price < 200 ? '50-200' : '200+'
        buckets[bk][s.status]++
      }
    }
    return buckets
  },
})

export const languageBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const [unreachable, warning] = await Promise.all([
      ctx.db.query('sites').withIndex('by_status', q => q.eq('status', 'Unreachable')).take(3000),
      ctx.db.query('sites').withIndex('by_status', q => q.eq('status', 'Warning')).take(3000),
    ])
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
      .take(8192)

    const httpTypes: Record<string, number> = {
      'HTTP 0': 0, 'HTTP 404': 0, 'Server 5xx': 0,
      'Redirect': 0, 'Parked/Bot': 0, 'Other': 0,
    }
    const ageBuckets: Record<string, number> = { '<1d': 0, '1-7d': 0, '7-30d': 0, '>30d': 0 }
    const byDay: Record<string, { total: number; critical: number }> = {}
    type DayTypeEntry = { date: string; dead: number; blocked: number; serverError: number; unreachable: number; parked: number; other: number }
    const byDayType: Record<string, DayTypeEntry> = {}
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
        if (!byDayType[day]) byDayType[day] = { date: day, dead: 0, blocked: 0, serverError: 0, unreachable: 0, parked: 0, other: 0 }
        if (msg.includes('http 0') || msg.includes('consecutive')) byDayType[day].dead++
        else if (msg.includes('http 403') || msg.includes('blocked') || msg.includes('bot')) byDayType[day].blocked++
        else if (msg.includes('http 5') || msg.includes('server error')) byDayType[day].serverError++
        else if (msg.includes('unreachable') || msg.includes('server down') || msg.includes('server not')) byDayType[day].unreachable++
        else if (msg.includes('park')) byDayType[day].parked++
        else byDayType[day].other++
      }
    }

    return {
      httpTypes,
      ageBuckets,
      byDay: Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v })),
      byDayType: Object.values(byDayType).sort((a, b) => a.date.localeCompare(b.date)),
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

export const bulkUpdateAlertsByDomain = mutation({
  args: {
    updates: v.array(v.object({ domain: v.string(), action: v.string() })),
  },
  handler: async (ctx, { updates }) => {
    let working = 0, dead = 0, inProgress = 0, ignored = 0, notFound = 0
    for (const { domain, action } of updates) {
      const site = await ctx.db.query('sites')
        .withIndex('by_domain', q => q.eq('domain', domain.trim().toLowerCase()))
        .first()
      if (!site) { notFound++; continue }

      const alert = await ctx.db.query('alerts')
        .withIndex('by_site', q => q.eq('siteId', site._id))
        .order('desc')
        .filter(q => q.eq(q.field('dismissed'), false))
        .first()
      if (!alert) { notFound++; continue }

      const a = action.trim().toLowerCase()
      if (a === 'working') {
        await ctx.db.patch(alert._id, { dismissed: true, dismissedAt: Date.now() })
        working++
      } else if (a === 'dead') {
        await ctx.db.patch(alert._id, { workflowStatus: 'urgent', severity: 'critical' })
        dead++
      } else if (a === 'in_progress') {
        await ctx.db.patch(alert._id, { workflowStatus: 'in_progress' })
        inProgress++
      } else if (a === 'ignore') {
        await ctx.db.patch(alert._id, { dismissed: true, dismissedAt: Date.now() })
        ignored++
      } else {
        notFound++
      }
    }
    return { working, dead, inProgress, ignored, notFound }
  },
})

export const requeueSitesBatch = mutation({
  args: { siteIds: v.array(v.string()) },
  handler: async (ctx, { siteIds }) => {
    let requeued = 0
    for (const siteId of siteIds) {
      const site = await ctx.db.get(siteId as never)
      if (site) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.patch(siteId as never, { lastCheckedAt: undefined } as any)
        requeued++
      }
    }
    return requeued
  },
})

export const bulkDismissByDomainPrefix = mutation({
  args: { prefix: v.string(), action: v.string() },
  handler: async (ctx, { prefix, action }) => {
    const p = prefix.trim().toLowerCase()
    // Scan alerts table for matching domains
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed_workflow', q => q.eq('dismissed', false))
      .take(8192)
    const matching = alerts.filter((a: { domain?: string }) => (a.domain ?? '').toLowerCase().startsWith(p))
    let count = 0
    for (const alert of matching) {
      if (action === 'working' || action === 'ignore') {
        await ctx.db.patch(alert._id, { dismissed: true, dismissedAt: Date.now() })
      } else if (action === 'in_progress') {
        await ctx.db.patch(alert._id, { workflowStatus: 'in_progress' })
      } else if (action === 'urgent') {
        await ctx.db.patch(alert._id, { workflowStatus: 'urgent' })
      }
      count++
    }
    return { count, prefix: p }
  },
})

export const alertTypeTrend = query({
  args: { nowMs: v.number() },
  handler: async (ctx, { nowMs }) => {
    const since = nowMs - 14 * 24 * 3600 * 1000
    // Use by_dismissed index to read only active alerts — avoids scanning dismissed ones
    const alerts = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .take(8192)

    type DayEntry = { date: string; dead: number; blocked: number; serverError: number; unreachable: number; parked: number; other: number }
    const days: Record<string, DayEntry> = {}

    for (const a of alerts) {
      if (a.createdAt < since) continue
      const d = new Date(a.createdAt)
      const key = `${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
      if (!days[key]) days[key] = { date: key, dead: 0, blocked: 0, serverError: 0, unreachable: 0, parked: 0, other: 0 }
      const msg = (a.message ?? '').toLowerCase()
      if (msg.includes('http 0') || msg.includes('consecutive')) days[key].dead++
      else if (msg.includes('http 403') || msg.includes('blocked') || msg.includes('bot')) days[key].blocked++
      else if (msg.includes('http 5') || msg.includes('server error')) days[key].serverError++
      else if (msg.includes('unreachable') || msg.includes('server down') || msg.includes('server not')) days[key].unreachable++
      else if (msg.includes('park')) days[key].parked++
      else days[key].other++
    }

    return Object.values(days).sort((a, b) => a.date.localeCompare(b.date))
  },
})

export const urgentBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const [urgent, inProgressRows] = await Promise.all([
      ctx.db.query('alerts')
        .withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'urgent'))
        .take(8192),
      ctx.db.query('alerts')
        .withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'in_progress'))
        .take(8192),
    ])
    let dead = 0, critical = 0
    for (const a of urgent) {
      const msg = (a.message ?? '').toLowerCase()
      if (msg.includes('http 0') || msg.includes('consecutive')) dead++
      else if (a.severity === 'critical') critical++
    }
    return { dead, critical, inProgress: inProgressRows.length }
  },
})

export const alertWorkflowCounts = query({
  args: {},
  handler: async (ctx) => {
    const [newRows, urgentRows, inProgressRows, doneRows] = await Promise.all([
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'new')).take(8192),
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'urgent')).take(8192),
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'in_progress')).take(8192),
      ctx.db.query('alerts').withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'done')).take(8192),
    ])
    return { new: newRows.length, urgent: urgentRows.length, in_progress: inProgressRows.length, done: doneRows.length }
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

export const rebuildCountersStep = internalMutation({
  args: { cursor: v.optional(v.string()), counts: v.any() },
  handler: async (ctx, { cursor, counts }) => {
    const page = await ctx.db.query('sites')
      .paginate({ cursor: cursor ?? null, numItems: 8000 })

    const newCounts: Record<string, number> = { ...counts }
    for (const site of page.page) {
      const s = (site.status ?? 'Unknown') as string
      newCounts[s] = (newCounts[s] ?? 0) + 1
    }

    if (page.isDone) {
      for (const [status, count] of Object.entries(newCounts)) {
        const name = `status_${status}`
        const existing = await ctx.db.query('counters').withIndex('by_name', q => q.eq('name', name)).first()
        if (existing) {
          await ctx.db.patch(existing._id, { value: count as number })
        } else {
          await ctx.db.insert('counters', { name, value: count as number })
        }
      }
      return { done: true, cursor: null as string | null, counts: newCounts }
    }
    return { done: false, cursor: page.continueCursor, counts: newCounts }
  },
})

export const rebuildCountersChain = internalAction({
  args: { cursor: v.optional(v.string()), counts: v.any() },
  handler: async (ctx, { cursor, counts }) => {
    const result: { done: boolean; cursor: string | null; counts: Record<string, number> } =
      await ctx.runMutation(internal.sites.rebuildCountersStep, { cursor, counts })
    if (!result.done && result.cursor) {
      await ctx.scheduler.runAfter(0, internal.sites.rebuildCountersChain, {
        cursor: result.cursor,
        counts: result.counts,
      })
    }
    return result
  },
})

export const rebuildCounters = action({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.sites.rebuildCountersChain, { cursor: undefined, counts: {} })
    return { started: true }
  },
})


export const alertStatsPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .paginate({ cursor: cursor ?? null, numItems: 2048 })
    const c = { total: 0, dead: 0, critical: 0, warning: 0, http0: 0, http404: 0, http403: 0, http429: 0, http5xx: 0, redirect: 0, parked: 0 }
    for (const a of page.page) {
      const m = (a.message ?? '').toLowerCase()
      const sev = a.severity ?? 'warning'
      const isDead = m.includes('http 0') || m.includes('consecutive')
      c.total++
      if (isDead) c.dead++
      else if (sev === 'critical') c.critical++
      else c.warning++
      if (m.includes('http 0')) c.http0++
      else if (m.includes('http 404')) c.http404++
      else if (m.includes('http 403')) c.http403++
      else if (m.includes('http 429')) c.http429++
      else if (m.includes('redirect')) c.redirect++
      else if (m.includes('park')) c.parked++
      else if (m.match(/http 5\d\d/)) c.http5xx++
    }
    return { c, isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const alertStats = action({
  args: {},
  handler: async (ctx) => {
    const totals = { total: 0, dead: 0, critical: 0, warning: 0, http0: 0, http404: 0, http403: 0, http429: 0, http5xx: 0, redirect: 0, parked: 0 }
    let cursor: string | undefined = undefined
    let done = false
    while (!done) {
      const page: any = await ctx.runQuery(internal.sites.alertStatsPage, { cursor })
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[k] += page.c[k] ?? 0
      }
      done = page.isDone
      cursor = page.cursor
    }
    return totals
  },
})

export const listAlertsByColumn = query({
  args: {
    workflowStatus: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { workflowStatus, cursor, limit = 500 }) => {
    return ctx.db.query('alerts')
      .withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', workflowStatus))
      .order('desc')
      .take(limit)
  },
})

export const migrateAlertWorkflowStatusPage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .paginate({ cursor: cursor ?? null, numItems: 500 })
    let count = 0
    for (const a of page.page) {
      if (a.workflowStatus) continue
      const isDead = (a.message ?? '').toLowerCase().includes('http 0') || (a.message ?? '').toLowerCase().includes('consecutive')
      const status = (isDead || a.severity === 'critical') ? 'urgent' : 'new'
      await ctx.db.patch(a._id, { workflowStatus: status })
      count++
    }
    return { patched: count, isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const migrateAlertWorkflowStatus = action({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined
    let total = 0
    let done = false
    while (!done) {
      const result: any = await ctx.runMutation(internal.sites.migrateAlertWorkflowStatusPage, { cursor })
      total += result.patched
      done = result.isDone
      cursor = result.cursor
    }
    return { total }
  },
})

export const migrateDeadAlertsPage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .paginate({ cursor: cursor ?? null, numItems: 200 })

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const cutoff = Date.now() - THIRTY_DAYS_MS

    const PARKING_HOSTS = [
      'atom.com', 'sedo.com', 'afternic.com', 'dan.com', 'hugedomains.com',
      'namecheap.com', 'godaddy.com', 'flippa.com', 'brandpa.com', 'efty.com',
      'squadhelp.com', 'undeveloped.com', 'uni.com', 'above.com', 'parkingcrew.com',
      'bodis.com', 'domainnameshop.com', 'domainmarket.com',
      // Additional marketplaces
      'bloomup.com', 'bloom-up.com', 'brandseller.com', 'domainagents.com',
      'netsol.com', 'register.com', 'networksolutions.com', 'sav.com', 'epik.com',
      'porkbun.com', 'namebright.com', 'dynadot.com', 'uniregistry.com',
      'domainholder.com', 'domaincapital.com', 'domainbrokers.com',
    ]

    // Multilingual "domain for sale" title signals
    const SALE_TITLE_KEYWORDS = [
      'domain for sale', 'buy this domain', 'this domain is for sale', 'domain is available for purchase',
      'est à vendre', 'à vendre sur', 'domaine à vendre',   // French
      'zu verkaufen', 'domain zu verkaufen', 'steht zum verkauf',  // German
      'se vende', 'dominio en venta', 'en venta',           // Spanish
      'te koop', 'domein te koop',                          // Dutch
      'in vendita', 'dominio in vendita',                   // Italian
      'à venda', 'domínio à venda',                         // Portuguese
      'till salu', 'til salg',                              // Swedish / Danish / Norwegian
      'продаётся', 'продається', 'домен продаётся',         // Russian / Ukrainian
      'til salgs', 'zum kauf',                              // more DE/NO
    ]

    let dead = 0
    for (const a of page.page) {
      if (a.workflowStatus === 'dead' || a.workflowStatus === 'done') continue

      const msg = (a.message ?? '').toLowerCase()

      // Bot-blocked (403/429) = site may be alive for humans, skip
      const isBotBlocked =
        a.aiCategory === 'bot_blocked' ||
        msg.includes('http 403') ||
        msg.includes('http 429')
      if (isBotBlocked) continue

      // Check recent history — if any 403/429 in last 5 checks → bot-blocked, not dead
      const recentHistory = await ctx.db.query('checkHistory')
        .withIndex('by_site', q => q.eq('siteId', a.siteId))
        .order('desc')
        .take(5)
      const wasBlocked = recentHistory.some(h => h.httpStatus === 403 || h.httpStatus === 429)
      if (wasBlocked) continue

      // SEO guard: sites with real metrics are likely temporarily down, not dead.
      // Parked domains are the exception — dead regardless of historic SEO.
      const isParkedMsg = msg.includes('parked') || msg.includes('parking')
      if (!isParkedMsg) {
        const alertDr = a.dr ?? 0
        const alertOt = a.organicTraffic ?? 0
        if (alertDr >= 20 || alertOt > 0) continue
      }

      // High-confidence dead from message alone
      const deadByMessage =
        msg.includes('http 0') ||
        msg.includes('consecutive') ||
        msg.includes('parked') ||
        msg.includes('parking')

      if (deadByMessage) {
        await ctx.db.patch(a._id, { workflowStatus: 'dead' })
        dead++
        continue
      }

      // Join to sites table for full data
      const site = await ctx.db.get(a.siteId)
      if (!site) continue

      // Audience not stored on alert — check site directly
      if (!isParkedMsg && (site.audience ?? 0) > 0) continue

      // Page title contains "for sale" in any language → dead
      const titleLower = (site.pageTitle ?? '').toLowerCase()
      const deadByTitle = titleLower.length > 0 && SALE_TITLE_KEYWORDS.some(kw => titleLower.includes(kw))
      if (deadByTitle) {
        await ctx.db.patch(a._id, { workflowStatus: 'dead' })
        dead++
        continue
      }

      // Redirect to known parking/domain-broker platform → dead
      if (site.redirectUrl) {
        try {
          const redirectHost = new URL(site.redirectUrl).hostname.replace(/^www\./, '')
          if (PARKING_HOSTS.some(h => redirectHost === h || redirectHost.endsWith('.' + h))) {
            await ctx.db.patch(a._id, { workflowStatus: 'dead' })
            dead++
            continue
          }
        } catch { /* invalid URL, skip */ }
      }

      // Only HTTP 0 (no connection at all) counts as "dead by site data"
      // HTTP 5xx means the server IS responding — keep in Urgent, not Dead
      const httpStatus = site.httpStatus ?? 0
      const consecutive = site.consecutiveFailures ?? 0
      const isCompletelyUnreachable = httpStatus === 0 || httpStatus === 404

      // Repeated HTTP 0 failures with no recent success → dead
      const deadBySite =
        isCompletelyUnreachable && (
          consecutive >= 5 ||
          (site.lastSuccessAt != null && site.lastSuccessAt < cutoff) ||
          (site.lastSuccessAt == null && site.lastCheckedAt != null && site.lastCheckedAt < cutoff)
        )

      if (deadBySite) {
        await ctx.db.patch(a._id, { workflowStatus: 'dead' })
        dead++
      }
    }
    return { patched: dead, isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const revertBlockedFromDeadPage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'dead'))
      .paginate({ cursor: cursor ?? null, numItems: 200 })

    let reverted = 0
    for (const a of page.page) {
      const msg = (a.message ?? '').toLowerCase()

      // bot_blocked or 403 in message → alive but blocked
      const isBlocked = a.aiCategory === 'bot_blocked' || msg.includes('http 403')
      if (isBlocked) {
        await ctx.db.patch(a._id, { workflowStatus: 'urgent' })
        reverted++
        continue
      }

      // Check recent history for 403/429 or 5xx (server responding = not dead)
      const recentHistory = await ctx.db.query('checkHistory')
        .withIndex('by_site', q => q.eq('siteId', a.siteId))
        .order('desc')
        .take(5)
      const wasBlockedOrErroring = recentHistory.some(
        h => h.httpStatus === 403 || h.httpStatus === 429 || (h.httpStatus !== undefined && h.httpStatus >= 500)
      )
      if (wasBlockedOrErroring) {
        await ctx.db.patch(a._id, { workflowStatus: 'urgent' })
        reverted++
        continue
      }

      // Site has HTTP 5xx currently → server responds, not dead
      const site = await ctx.db.get(a.siteId)
      if (site && (site.httpStatus ?? 0) >= 500) {
        await ctx.db.patch(a._id, { workflowStatus: 'urgent' })
        reverted++
      }
    }
    return { reverted, isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const revertBlockedFromDead = action({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined
    let total = 0
    let done = false
    while (!done) {
      const result: any = await ctx.runMutation(internal.sites.revertBlockedFromDeadPage, { cursor })
      total += result.reverted
      done = result.isDone
      cursor = result.cursor
    }
    return { total }
  },
})

export const revertCriticalFromDeadPage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed_workflow', q => q.eq('dismissed', false).eq('workflowStatus', 'dead'))
      .paginate({ cursor: cursor ?? null, numItems: 200 })

    let reverted = 0
    for (const a of page.page) {
      const msg = (a.message ?? '').toLowerCase()
      // Keep in Dead only if message clearly indicates dead (http 0, consecutive, parked)
      const isConfirmedDead =
        msg.includes('http 0') ||
        msg.includes('consecutive') ||
        msg.includes('park')
      // If severity=critical but not confirmed dead by message → belongs in Urgent
      if (!isConfirmedDead && a.severity === 'critical') {
        await ctx.db.patch(a._id, { workflowStatus: 'urgent' })
        reverted++
      }
    }
    return { reverted, isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const revertCriticalFromDead = action({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined
    let total = 0
    let done = false
    while (!done) {
      const result: any = await ctx.runMutation(internal.sites.revertCriticalFromDeadPage, { cursor })
      total += result.reverted
      done = result.isDone
      cursor = result.cursor
    }
    return { total }
  },
})

export const migrateDeadAlerts = action({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined
    let total = 0
    let done = false
    while (!done) {
      const result: any = await ctx.runMutation(internal.sites.migrateDeadAlertsPage, { cursor })
      total += result.patched
      done = result.isDone
      cursor = result.cursor
    }
    return { total }
  },
})

// Rules Agent: runs after reverify — Fix Blocked then Move Dead
export const runDailyAlertCleanup = internalAction({
  args: {},
  handler: async (ctx) => {
    // Step 1: Fix Blocked — return wrongly-dead sites (403/5xx) back to Urgent
    let cursor: string | undefined = undefined
    let reverted = 0
    let done = false
    while (!done) {
      const r: any = await ctx.runMutation(internal.sites.revertBlockedFromDeadPage, { cursor })
      reverted += r.reverted
      done = r.isDone
      cursor = r.cursor
    }

    // Step 2: Move Dead — classify confirmed dead alerts into Dead column
    cursor = undefined
    let moved = 0
    done = false
    while (!done) {
      const r: any = await ctx.runMutation(internal.sites.migrateDeadAlertsPage, { cursor })
      moved += r.patched
      done = r.isDone
      cursor = r.cursor
    }

    return { reverted, moved }
  },
})

export const debugSiteCount = query({
  args: {},
  handler: async (ctx) => {
    const sample = await ctx.db.query('sites')
      .filter(q => q.gt(q.field('_creationTime'), 0))
      .take(10)
    const total = await ctx.db.query('sites').take(8192)
    return { sampleCount: sample.length, firstStatuses: sample.map(s => s.status), totalTake8192: total.length }
  },
})

export const testRebuildStep = action({
  args: { cursor: v.optional(v.string()), counts: v.optional(v.any()) },
  handler: async (ctx, { cursor, counts }) => {
    const result: { done: boolean; cursor: string | null; counts: Record<string, number> } =
      await ctx.runMutation(internal.sites.rebuildCountersStep, { cursor, counts: counts ?? {} })
    return result
  },
})

// Deduplication: keep only the newest open alert per site, dismiss older duplicates
export const deduplicateAlertsPage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .paginate({ cursor: cursor ?? null, numItems: 500 })

    // Group alerts in this page by siteId
    const bySite = new Map<string, typeof page.page>()
    for (const a of page.page) {
      const key = a.siteId as string
      if (!bySite.has(key)) bySite.set(key, [])
      bySite.get(key)!.push(a)
    }

    let dismissed = 0
    const now = Date.now()
    for (const [, alerts] of bySite) {
      if (alerts.length <= 1) continue
      // Sort descending by createdAt — keep the newest
      alerts.sort((a, b) => b.createdAt - a.createdAt)
      const [_keep, ...dupes] = alerts
      for (const dupe of dupes) {
        await ctx.db.patch(dupe._id, { dismissed: true, dismissedAt: now })
        dismissed++
      }
    }
    await adjustCounter(ctx, 'alerts_active', -dismissed)
    return { dismissed, isDone: page.isDone, cursor: page.continueCursor }
  },
})

export const deduplicateAlerts = action({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined
    let total = 0
    let done = false
    while (!done) {
      const result: any = await ctx.runMutation(internal.sites.deduplicateAlertsPage, { cursor })
      total += result.dismissed
      done = result.isDone
      cursor = result.cursor
    }
    return { dismissed: total }
  },
})

// Browser-check for bot_blocked (403) sites via Vercel Playwright function
export const getBlockedAlertsPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('alerts')
      .withIndex('by_dismissed', q => q.eq('dismissed', false))
      .filter(q => q.eq(q.field('aiCategory'), 'bot_blocked'))
      .paginate({ cursor: cursor ?? null, numItems: 30 })
    return {
      items: page.page.map(a => ({ id: a._id, domain: a.domain as string })),
      isDone: page.isDone,
      cursor: page.continueCursor,
    }
  },
})

export const updateBrowserChecked = internalMutation({
  args: { alertId: v.id('alerts'), browserStatus: v.string() },
  handler: async (ctx, { alertId, browserStatus }) => {
    const patch: Record<string, unknown> = { aiCategory: `browser_${browserStatus}` }
    if (browserStatus === 'alive') {
      patch.workflowStatus = 'done'
    } else if (browserStatus === 'parked') {
      patch.workflowStatus = 'dead'
    } else if (browserStatus === 'error') {
      patch.workflowStatus = 'urgent'
    }
    // timeout → no status change, just update aiCategory
    await ctx.db.patch(alertId, patch)
  },
})

export const checkBlockedSites = action({
  args: { vercelUrl: v.string(), maxSites: v.optional(v.number()) },
  handler: async (ctx, { vercelUrl, maxSites = 200 }) => {
    let cursor: string | undefined = undefined
    let total = 0, alive = 0, parked = 0, errors = 0, timeouts = 0

    while (total < maxSites) {
      const batch: any = await ctx.runQuery(internal.sites.getBlockedAlertsPage, { cursor })
      if (!batch.items.length) break

      for (let i = 0; i < batch.items.length && total < maxSites; i += 5) {
        const chunk = batch.items.slice(i, i + 5)
        await Promise.all(
          chunk.map(async ({ id, domain }: { id: string; domain: string }) => {
            try {
              const r = await fetch(
                `${vercelUrl}/api/check-browser?domain=${encodeURIComponent(domain)}`,
                { signal: AbortSignal.timeout(50000) }
              )
              if (!r.ok) { errors++; return }
              const data: any = await r.json()
              const status: string = data.status ?? 'error'
              await ctx.runMutation(internal.sites.updateBrowserChecked, { alertId: id, browserStatus: status })
              if (status === 'alive') alive++
              else if (status === 'parked') parked++
              else if (status === 'timeout') timeouts++
              else errors++
            } catch { errors++ }
            total++
          })
        )
      }

      if (batch.isDone || total >= maxSites) break
      cursor = batch.cursor
    }

    return { total, alive, parked, errors, timeouts }
  },
})
