import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Every 30 minutes: check 2000 oldest-checked sites server-side
// 2000 × 48 ticks/day ≈ 96k sites/day → full daily coverage for 108k publisher domains
crons.interval(
  'scheduled-site-check',
  { minutes: 30 },
  internal.scheduler.runScheduledCheck,
)

// Keep daily deep run for any sites missed by the interval cron
crons.daily(
  'daily-site-check',
  { hourUTC: 3, minuteUTC: 0 },
  internal.scheduler.runDailyCheck,
)

// Morning re-verify of all active alerts via Bright Data proxy (4 AM UTC)
crons.daily(
  'daily-alert-reverify',
  { hourUTC: 4, minuteUTC: 0 },
  internal.checker.startReverifyAllInternal,
)

// Rules Agent: Fix Blocked + Move Dead — runs after morning reverify has finished (6 AM UTC)
crons.daily(
  'morning-alert-cleanup',
  { hourUTC: 6, minuteUTC: 0 },
  internal.sites.runDailyAlertCleanup,
)

// Midday re-verify — catches sites that recovered after the morning run (14:00 UTC)
crons.daily(
  'midday-alert-reverify',
  { hourUTC: 14, minuteUTC: 0 },
  internal.checker.startReverifyAllInternal,
)

// Rules Agent: Fix Blocked + Move Dead — runs after midday reverify (16:00 UTC)
crons.daily(
  'midday-alert-cleanup',
  { hourUTC: 16, minuteUTC: 0 },
  internal.sites.runDailyAlertCleanup,
)

export default crons
