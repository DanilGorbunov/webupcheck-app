import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  sites: defineTable({
    // From Medialister
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
    // Check results
    status: v.string(), // Active | Warning | Unreachable | Parked | Blacklisted | Unknown
    lastCheckedAt: v.optional(v.number()),
    httpStatus: v.optional(v.number()),
    redirectUrl: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    isParked: v.optional(v.boolean()),
    responseTimeMs: v.optional(v.number()),
    // Retry / failure tracking
    consecutiveFailures: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    // Sync
    medialistSyncedAt: v.optional(v.number()),
  })
    .index('by_domain', ['domain'])
    .index('by_status', ['status'])
    .index('by_last_checked', ['lastCheckedAt'])
    .index('by_dr', ['dr']),

  checkHistory: defineTable({
    siteId: v.id('sites'),
    domain: v.string(),
    checkedAt: v.number(),
    httpStatus: v.optional(v.number()),
    redirectUrl: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    isParked: v.optional(v.boolean()),
    responseTimeMs: v.optional(v.number()),
    statusBefore: v.string(),
    statusAfter: v.string(),
  })
    .index('by_site', ['siteId'])
    .index('by_checked_at', ['checkedAt']),

  alerts: defineTable({
    siteId: v.id('sites'),
    domain: v.string(),
    severity: v.string(), // critical | warning | info
    message: v.string(),
    subdomains: v.optional(v.array(v.string())), // grouped subdomain alerts
    createdAt: v.number(),
    dismissed: v.boolean(),
    dismissedAt: v.optional(v.number()),
  })
    .index('by_site', ['siteId'])
    .index('by_dismissed', ['dismissed'])
    .index('by_created', ['createdAt']),

  checkQueue: defineTable({
    domain: v.string(),
    siteId: v.id('sites'),
    scheduledAt: v.number(),
    status: v.string(), // pending | running | done | failed
    batchId: v.string(),
  })
    .index('by_status', ['status'])
    .index('by_batch', ['batchId']),

  syncLog: defineTable({
    type: v.string(), // medialister_sync | check_run
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    totalItems: v.optional(v.number()),
    processed: v.optional(v.number()),
    status: v.string(), // running | completed | failed
    message: v.optional(v.string()),
  })
    .index('by_type', ['type'])
    .index('by_started', ['startedAt']),
})
