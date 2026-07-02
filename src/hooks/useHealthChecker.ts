import { useState, useEffect, useRef, useCallback } from 'react'
import { useAction } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { Site, SiteStatus } from '../types'

type CheckResult = { httpStatus: number; redirectUrl?: string; pageTitle?: string; isParked: boolean; responseTimeMs: number }

// Use makeFunctionReference to avoid depending on stale generated types
const checkDomainFn = makeFunctionReference<'action', { domain: string }, CheckResult>('checker:checkDomain')

const HEALTH_TTL = 1000 * 60 * 60 * 24 // 24h
const CONCURRENT = 5
const HEALTH_PREFIX = 'wuc_health_'

export interface HealthRecord {
  status: SiteStatus
  httpStatus?: number
  redirectUrl?: string
  title?: string
  isParked?: boolean
  responseTimeMs?: number
  checkedAt: string
}

function healthKey(domain: string) {
  return HEALTH_PREFIX + domain
}

function loadHealth(domain: string): HealthRecord | null {
  try {
    const raw = localStorage.getItem(healthKey(domain))
    if (!raw) return null
    const rec: HealthRecord = JSON.parse(raw)
    if (Date.now() - new Date(rec.checkedAt).getTime() > HEALTH_TTL) return null
    return rec
  } catch {
    return null
  }
}

function saveHealth(domain: string, rec: HealthRecord) {
  try {
    localStorage.setItem(healthKey(domain), JSON.stringify(rec))
  } catch { /* quota */ }
}

function resultToStatus(r: CheckResult): SiteStatus {
  if (!r.httpStatus || r.httpStatus === 0) return 'Unreachable'
  if (r.isParked) return 'Parked'
  if (r.httpStatus >= 500) return 'Unreachable'
  if (r.httpStatus === 403 || r.httpStatus === 401) return 'Suspended'
  if (r.httpStatus >= 400) return 'Unreachable'
  return 'Active'
}

export function loadHealthMap(domains: string[]): Record<string, HealthRecord> {
  const map: Record<string, HealthRecord> = {}
  for (const d of domains) {
    const rec = loadHealth(d)
    if (rec) map[d] = rec
  }
  return map
}

interface CheckerState {
  checked: number
  total: number
  running: boolean
  healthMap: Record<string, HealthRecord>
}

export function useHealthChecker(sites: Site[]) {
  const checkDomain = useAction(checkDomainFn)
  const [state, setState] = useState<CheckerState>({
    checked: 0,
    total: 0,
    running: false,
    healthMap: {},
  })
  const queueRef = useRef<string[]>([])
  const runningRef = useRef(false)
  const abortRef = useRef(false)

  // When sites list grows, load cached results and enqueue unchecked ones
  useEffect(() => {
    if (sites.length === 0) return

    // Load existing health data from localStorage
    const map: Record<string, HealthRecord> = {}
    const needsCheck: string[] = []

    for (const site of sites) {
      const cached = loadHealth(site.domain)
      if (cached) {
        map[site.domain] = cached
      } else {
        needsCheck.push(site.domain)
      }
    }

    setState(s => ({
      ...s,
      healthMap: { ...s.healthMap, ...map },
      total: needsCheck.length,
      checked: 0,
    }))

    // Add new unchecked sites to queue (avoid duplicates)
    const existing = new Set(queueRef.current)
    for (const d of needsCheck) {
      if (!existing.has(d)) {
        queueRef.current.push(d)
        existing.add(d)
      }
    }
  }, [sites.length]) // re-run when sites count changes (new pages loaded)

  const runChecker = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    abortRef.current = false
    setState(s => ({ ...s, running: true }))

    let checkedCount = 0

    while (queueRef.current.length > 0 && !abortRef.current) {
      const batch = queueRef.current.splice(0, CONCURRENT)

      const results = await Promise.allSettled(
        batch.map(async domain => {
          const result = await checkDomain({ domain })
          const status = resultToStatus(result)
          const rec: HealthRecord = {
            status,
            httpStatus: result.httpStatus,
            redirectUrl: result.redirectUrl,
            title: result.pageTitle,
            isParked: result.isParked,
            responseTimeMs: result.responseTimeMs,
            checkedAt: new Date().toISOString(),
          }
          saveHealth(domain, rec)
          return { domain, rec }
        })
      )

      const updates: Record<string, HealthRecord> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') {
          updates[r.value.domain] = r.value.rec
          checkedCount++
        }
      }

      setState(s => ({
        ...s,
        healthMap: { ...s.healthMap, ...updates },
        checked: checkedCount,
      }))

      // Small pause between batches to not hammer the proxy
      if (queueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    runningRef.current = false
    setState(s => ({ ...s, running: false }))
  }, [checkDomain])

  // Auto-start checker when sites load
  useEffect(() => {
    if (sites.length > 0 && !runningRef.current) {
      runChecker()
    }
  }, [sites.length, runChecker])

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  // Deduplicate by domain (Medialister API can return duplicates across pages)
  const seenDomains = new Set<string>()
  const uniqueSites = sites.filter(s => {
    if (seenDomains.has(s.domain)) return false
    seenDomains.add(s.domain)
    return true
  })

  // Merge health data into sites
  const sitesWithStatus = uniqueSites.map(site => {
    const health = state.healthMap[site.domain]
    if (!health) return site
    return {
      ...site,
      status: health.status,
      httpStatus: health.httpStatus,
      lastCheckedAt: health.checkedAt,
      redirectUrl: health.redirectUrl,
      pageTitle: health.title,
      isParked: health.isParked,
      responseTimeMs: health.responseTimeMs,
    }
  })

  return {
    sitesWithStatus,
    healthChecked: state.checked,
    healthTotal: state.total,
    healthRunning: state.running,
    healthMap: state.healthMap,
    restartChecker: runChecker,
  }
}
