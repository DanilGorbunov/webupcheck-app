import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'

const DAILY_LIMIT = 10000
const BATCH_SIZE = 50
// Per-cron-tick: 1500 sites, 1 batch group at a time (50 concurrent HTTP checks)
// 1500 × 48 ticks/day + 10k daily = ~82k sites/day (full coverage every ~1.3 days)
// DB I/O: ~360MB/day — well within 50GB free tier
const SCHEDULED_LIMIT = 1500
const CONCURRENT_GROUPS = 1

export const getSitesToCheck = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    // Priority: never-checked first, then oldest lastCheckedAt
    const unchecked = await ctx.db.query('sites')
      .withIndex('by_last_checked', q => q.eq('lastCheckedAt', undefined))
      .take(limit)

    if (unchecked.length >= limit) return unchecked

    const remaining = limit - unchecked.length
    const checked = await ctx.db.query('sites')
      .withIndex('by_last_checked')
      .order('asc')
      .take(remaining + unchecked.length)

    const checkedFiltered = checked.filter(s => s.lastCheckedAt !== undefined).slice(0, remaining)
    return [...unchecked, ...checkedFiltered]
  },
})

export const logSync = internalMutation({
  args: {
    type: v.string(),
    status: v.string(),
    totalItems: v.optional(v.number()),
    processed: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('syncLog', { ...args, startedAt: Date.now() })
  },
})

export const runDailyCheck = internalAction({
  args: {},
  handler: async (ctx) => {
    const logId = await ctx.runMutation(internal.scheduler.logSync, {
      type: 'check_run',
      status: 'running',
      totalItems: DAILY_LIMIT,
    })

    try {
      const sites = await ctx.runQuery(internal.scheduler.getSitesToCheck, { limit: DAILY_LIMIT })

      if (!sites.length) {
        await ctx.runMutation(internal.scheduler.updateLog, {
          logId,
          status: 'completed',
          processed: 0,
          message: 'No sites to check',
        })
        return
      }

      // Split into batches of BATCH_SIZE
      const batches: typeof sites[] = []
      for (let i = 0; i < sites.length; i += BATCH_SIZE) {
        batches.push(sites.slice(i, i + BATCH_SIZE))
      }

      let totalDone = 0
      const batchId = `run_${Date.now()}`

      for (const batch of batches) {
        const result = await ctx.runAction(internal.checker.checkBatch, {
          batch: batch.map(s => ({ domain: s.domain, siteId: s._id })),
          batchId,
        })
        totalDone += result.done
        // Small pause between batches to avoid rate limiting
        await new Promise(r => setTimeout(r, 200))
      }

      await ctx.runMutation(internal.scheduler.updateLog, {
        logId,
        status: 'completed',
        processed: totalDone,
        message: `Checked ${totalDone} sites`,
      })
    } catch (err) {
      await ctx.runMutation(internal.scheduler.updateLog, {
        logId,
        status: 'failed',
        message: String(err),
      })
    }
  },
})

// Runs every 30 minutes via cron — server-side, no browser involvement
export const runScheduledCheck = internalAction({
  args: {},
  handler: async (ctx) => {
    // Skip if Medialister sync is running — avoid flooding browser with concurrent mutations
    const syncLog = await ctx.runQuery(api.sites.getActiveSyncLog, {})
    if (syncLog?.status === 'running') return

    const sites = await ctx.runQuery(internal.scheduler.getSitesToCheck, { limit: SCHEDULED_LIMIT })
    if (!sites.length) return

    const batchId = `cron_${Date.now()}`
    const batches: { domain: string; siteId: string }[][] = []
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      batches.push(sites.slice(i, i + BATCH_SIZE).map(s => ({ domain: s.domain, siteId: s._id })))
    }

    // One batch at a time — 50 concurrent HTTP checks, avoids Convex mutation overload
    for (let i = 0; i < batches.length; i += CONCURRENT_GROUPS) {
      const group = batches.slice(i, i + CONCURRENT_GROUPS)
      await Promise.allSettled(
        group.map(batch => ctx.runAction(internal.checker.checkBatch, { batch: batch as never, batchId }))
      )
      // Brief pause to let Convex process pending mutations between batches
      if (i + CONCURRENT_GROUPS < batches.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    }

    // Rebuild status counters after all checks finish (avoids per-mutation OCC)
    await ctx.runMutation(internal.sites.rebuildStatusCounters, {})
  },
})

export const updateLog = internalMutation({
  args: {
    logId: v.id('syncLog'),
    status: v.string(),
    processed: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { logId, ...rest }) => {
    await ctx.db.patch(logId, { ...rest, completedAt: Date.now() })
  },
})
