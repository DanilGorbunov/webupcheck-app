import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useAction } from 'convex/react'
import { makeFunctionReference } from 'convex/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConvexId = any

const listNeedingCheckFn = makeFunctionReference<'query', { limit?: number }, Array<{
  _id: ConvexId
  domain: string
  status: string
  lastCheckedAt?: number
}>>('sites:listNeedingCheck')

const checkOneSiteFn = makeFunctionReference<'action', { domain: string; siteId: ConvexId }, unknown>('checker:checkOneSite')

const CONCURRENT = 50
const BATCH_SIZE = 2000

export function useHealthChecker() {
  const sites = useQuery(listNeedingCheckFn, { limit: BATCH_SIZE })
  const checkOneSite = useAction(checkOneSiteFn)

  const [healthChecked, setHealthChecked] = useState(0)
  const [healthTotal, setHealthTotal] = useState(0)
  const [healthRunning, setHealthRunning] = useState(false)

  const runningRef = useRef(false)
  const abortRef = useRef(false)
  const cumulativeChecked = useRef(0)

  const runBatch = useCallback(async (sitesToCheck: Array<{ _id: ConvexId; domain: string }>) => {
    setHealthRunning(true)
    const queue = [...sitesToCheck]

    while (queue.length > 0 && !abortRef.current) {
      const batch = queue.splice(0, CONCURRENT)
      await Promise.allSettled(
        batch.map(async site => {
          try {
            await checkOneSite({ domain: site.domain, siteId: site._id })
          } catch { /* ignore individual failures */ }
          cumulativeChecked.current++
          setHealthChecked(cumulativeChecked.current)
        })
      )
      if (queue.length > 0) {
        await new Promise(r => setTimeout(r, 100))
      }
    }
  }, [checkOneSite])

  useEffect(() => {
    if (!sites || sites.length === 0) {
      // No more Unknown sites — done
      if (runningRef.current) {
        runningRef.current = false
        setHealthRunning(false)
      }
      return
    }

    if (runningRef.current) return

    runningRef.current = true
    // Update total estimate: cumulative + remaining
    setHealthTotal(cumulativeChecked.current + sites.length)

    runBatch(sites).then(() => {
      runningRef.current = false
      // After batch, Convex will reactively return next batch of Unknown sites
      // which re-triggers this effect automatically
    })
  }, [sites, runBatch])

  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  return { healthChecked, healthTotal, healthRunning }
}
