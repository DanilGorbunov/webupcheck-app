import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { fetchOffersPage, offerToSite } from '../lib/medialister'

type SyncLogId = string

const getActiveSyncLog = makeFunctionReference<'query', Record<string, never>, {
  _id: SyncLogId
  type: string
  startedAt: number
  completedAt?: number
  totalItems?: number
  processed?: number
  status: string
  message?: string
} | null>('sites:getActiveSyncLog')

const upsertBatchFn = makeFunctionReference<'mutation', {
  sites: Array<{
    medialisterId: string; domain: string; languages: string[]; formatType: string; price: number;
    dr?: number; organicTraffic?: number; audience?: number; bounceRate?: number;
    timeOnSite?: number; mai?: number; semrushAuthorityScore?: number;
    leadingCountries?: unknown; urlExamples: string[];
  }>
}, void>('sites:upsertBatch')

const startSyncLogFn = makeFunctionReference<'mutation', { totalItems: number; totalPages: number }, string>('sites:startSyncLog')
const updateSyncLogFn = makeFunctionReference<'mutation', { logId: string; processed: number; totalPages: number }, void>('sites:updateSyncLog')
const completeSyncLogFn = makeFunctionReference<'mutation', { logId: string }, void>('sites:completeSyncLog')

const SYNC_TTL = 1000 * 60 * 60 * 6 // 6h

export function useMedialister() {
  const syncLog = useQuery(getActiveSyncLog, {})
  const upsertBatch = useMutation(upsertBatchFn)
  const startSyncLog = useMutation(startSyncLogFn)
  const updateSyncLog = useMutation(updateSyncLogFn)
  const completeSyncLog = useMutation(completeSyncLogFn)

  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncTotal, setSyncTotal] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef(false)
  const startedRef = useRef(false)

  const syncAll = useCallback(async (resumeFrom = 1, knownTotal = 0, knownPages = 0) => {
    abortRef.current = false
    setSyncing(true)
    setError(null)

    try {
      let totalPages = knownPages
      let total = knownTotal
      let logId: string

      if (resumeFrom === 1) {
        const first = await fetchOffersPage(1, 100)
        total = first['hydra:totalItems']
        totalPages = Math.ceil(total / 100)
        setTotalItems(total)
        setSyncTotal(totalPages)
        setSyncProgress(1)

        logId = await startSyncLog({ totalItems: total, totalPages })

        const batch = first['hydra:member'].map(offerToSite)
        await upsertBatch({ sites: batch.map(s => ({
          medialisterId: s.id,
          domain: s.domain,
          languages: s.languages,
          formatType: s.formatType,
          price: s.price,
          dr: s.dr,
          organicTraffic: s.organicTraffic,
          audience: s.audience,
          bounceRate: s.bounceRate,
          timeOnSite: s.timeOnSite,
          mai: s.mai,
          semrushAuthorityScore: s.semrushAuthorityScore,
          leadingCountries: s.leadingCountries,
          urlExamples: s.urlExamples,
        })) })
        await updateSyncLog({ logId, processed: 1, totalPages })
      } else {
        setTotalItems(knownTotal)
        setSyncTotal(knownPages)
        setSyncProgress(resumeFrom)
        // We need a valid logId — it will be the currently running one
        // We'll get it from the syncLog query value captured via closure
        logId = '' // will be overwritten below
      }

      for (let page = resumeFrom === 1 ? 2 : resumeFrom; page <= totalPages; page++) {
        if (abortRef.current) break
        const data = await fetchOffersPage(page, 100)
        const batch = data['hydra:member'].map(offerToSite)

        await upsertBatch({ sites: batch.map(s => ({
          medialisterId: s.id,
          domain: s.domain,
          languages: s.languages,
          formatType: s.formatType,
          price: s.price,
          dr: s.dr,
          organicTraffic: s.organicTraffic,
          audience: s.audience,
          bounceRate: s.bounceRate,
          timeOnSite: s.timeOnSite,
          mai: s.mai,
          semrushAuthorityScore: s.semrushAuthorityScore,
          leadingCountries: s.leadingCountries,
          urlExamples: s.urlExamples,
        })) })

        if (logId) {
          await updateSyncLog({ logId, processed: page, totalPages })
        }

        setSyncProgress(page)
        await new Promise(r => setTimeout(r, 50))
      }

      if (logId!) {
        await completeSyncLog({ logId })
      }

      setSyncing(false)
    } catch (err) {
      setSyncing(false)
      setError(String(err))
    }
  }, [upsertBatch, startSyncLog, updateSyncLog, completeSyncLog])

  // Decide what to do once syncLog is loaded from DB
  useEffect(() => {
    if (syncLog === undefined) return // still loading
    if (startedRef.current) return   // already acted
    startedRef.current = true

    if (!syncLog) {
      // No sync log at all — start fresh
      syncAll()
      return
    }

    const isStale = Date.now() - syncLog.startedAt > SYNC_TTL

    if (syncLog.status === 'completed' && !isStale) {
      // Fresh completed sync — nothing to do
      setTotalItems(syncLog.totalItems ?? 0)
      setSyncTotal(0)
      setSyncProgress(0)
      setSyncing(false)
      return
    }

    if (syncLog.status === 'running') {
      // Resume from where we left off
      const processed = syncLog.processed ?? 0
      const total = syncLog.totalItems ?? 0
      const pages = total > 0 ? Math.ceil(total / 100) : 0
      setTotalItems(total)
      setSyncTotal(pages)
      setSyncProgress(processed)
      syncAll(processed + 1, total, pages)
      return
    }

    // Stale or failed — start fresh
    syncAll()
  }, [syncLog, syncAll])

  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  return { syncing, syncProgress, syncTotal, totalItems, error }
}
