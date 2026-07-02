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

const CONCURRENT = 3

export function useHealthChecker() {
  const sites = useQuery(listNeedingCheckFn, { limit: 100 })
  const checkOneSite = useAction(checkOneSiteFn)

  const [healthChecked, setHealthChecked] = useState(0)
  const [healthTotal, setHealthTotal] = useState(0)
  const [healthRunning, setHealthRunning] = useState(false)

  const runningRef = useRef(false)
  const abortRef = useRef(false)
  const checkedDomainsRef = useRef<Set<string>>(new Set())

  const runChecker = useCallback(async (sitesToCheck: Array<{ _id: ConvexId; domain: string }>) => {
    if (runningRef.current || sitesToCheck.length === 0) return
    runningRef.current = true
    abortRef.current = false
    setHealthRunning(true)
    setHealthTotal(sitesToCheck.length)
    setHealthChecked(0)

    let checked = 0
    const queue = [...sitesToCheck]

    while (queue.length > 0 && !abortRef.current) {
      const batch = queue.splice(0, CONCURRENT)

      await Promise.allSettled(
        batch.map(async site => {
          try {
            await checkOneSite({ domain: site.domain, siteId: site._id })
            checkedDomainsRef.current.add(site.domain)
            checked++
            setHealthChecked(checked)
          } catch {
            // ignore individual failures
          }
        })
      )

      if (queue.length > 0) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    runningRef.current = false
    setHealthRunning(false)
  }, [checkOneSite])

  useEffect(() => {
    if (!sites || sites.length === 0) return

    // Only check sites we haven't already processed in this session
    const toCheck = sites.filter(s => !checkedDomainsRef.current.has(s.domain))
    if (toCheck.length === 0) return

    runChecker(toCheck)
  }, [sites?.length, runChecker]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  return { healthChecked, healthTotal, healthRunning }
}
