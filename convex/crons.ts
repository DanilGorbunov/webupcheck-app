import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Daily check run — picks 10,000 oldest-checked sites and checks them
crons.daily(
  'daily-site-check',
  { hourUTC: 2, minuteUTC: 0 }, // 2am UTC daily
  internal.scheduler.runDailyCheck,
)

export default crons
