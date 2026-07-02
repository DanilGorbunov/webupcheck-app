import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchOffersPage, offerToSite } from '../lib/medialister'
import type { Site } from '../types'

const CACHE_KEY = 'wuc_sites'
const CACHE_META_KEY = 'wuc_meta'
const CACHE_TTL = 1000 * 60 * 60 * 6 // 6h

interface CacheMeta {
  totalItems: number
  totalPages: number
  lastSavedPage: number // how many pages we've saved so far
  fetchedAt: number
}

function loadMeta(): CacheMeta | null {
  try {
    const raw = localStorage.getItem(CACHE_META_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveMeta(meta: CacheMeta) {
  try { localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta)) } catch { /* quota */ }
}

function savePage(pageIndex: number, sites: Site[]) {
  try { localStorage.setItem(`${CACHE_KEY}_${pageIndex}`, JSON.stringify(sites)) } catch { /* quota */ }
}

function loadAllPages(totalPages: number): Site[] {
  const all: Site[] = []
  for (let i = 0; i < totalPages; i++) {
    try {
      const raw = localStorage.getItem(`${CACHE_KEY}_${i}`)
      if (raw) all.push(...JSON.parse(raw))
    } catch { /* skip */ }
  }
  return all
}

function isCacheStale(meta: CacheMeta): boolean {
  return Date.now() - meta.fetchedAt > CACHE_TTL
}

export function useMedialister() {
  const [sites, setSites] = useState<Site[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncTotal, setSyncTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef(false)

  const syncAll = useCallback(async (resumeFrom = 1, knownTotal = 0, knownPages = 0) => {
    abortRef.current = false
    setSyncing(true)
    setError(null)

    try {
      let totalPages = knownPages
      let total = knownTotal

      // If starting fresh, fetch page 1 to get totals
      if (resumeFrom === 1) {
        const first = await fetchOffersPage(1, 100)
        total = first['hydra:totalItems']
        totalPages = Math.ceil(total / 100)
        setTotalItems(total)
        setSyncTotal(totalPages)
        setSyncProgress(1)

        const batch = first['hydra:member'].map(offerToSite)
        savePage(0, batch)
        saveMeta({ totalItems: total, totalPages, lastSavedPage: 1, fetchedAt: Date.now() })
        setSites(loadAllPages(totalPages))
      } else {
        // Resuming — totals already known
        setTotalItems(total)
        setSyncTotal(totalPages)
        setSyncProgress(resumeFrom)
      }

      for (let page = resumeFrom === 1 ? 2 : resumeFrom; page <= totalPages; page++) {
        if (abortRef.current) break
        const data = await fetchOffersPage(page, 100)
        const batch = data['hydra:member'].map(offerToSite)

        // Save this page immediately — survives reload
        savePage(page - 1, batch)
        saveMeta({ totalItems: total, totalPages, lastSavedPage: page, fetchedAt: Date.now() })

        setSyncProgress(page)
        setSites(loadAllPages(totalPages))

        await new Promise(r => setTimeout(r, 50))
      }

      setSyncing(false)
      setLoading(false)
    } catch (err) {
      setSyncing(false)
      setLoading(false)
      setError(String(err))
    }
  }, [])

  useEffect(() => {
    const meta = loadMeta()

    if (!meta) {
      // No cache at all — start fresh
      syncAll()
      return
    }

    if (isCacheStale(meta)) {
      // Cache expired — clear and restart
      for (let i = 0; i < meta.totalPages; i++) localStorage.removeItem(`${CACHE_KEY}_${i}`)
      localStorage.removeItem(CACHE_META_KEY)
      syncAll()
      return
    }

    // Load whatever pages we have
    const cached = loadAllPages(meta.lastSavedPage)
    setSites(cached)
    setTotalItems(meta.totalItems)
    setSyncTotal(meta.totalPages)
    setSyncProgress(meta.lastSavedPage)

    if (meta.lastSavedPage >= meta.totalPages) {
      // Fully synced — done
      setLoading(false)
    } else {
      // Partially synced — resume from where we stopped
      setLoading(false)
      syncAll(meta.lastSavedPage + 1, meta.totalItems, meta.totalPages)
    }

    return () => { abortRef.current = true }
  }, [syncAll])

  return { sites, totalItems, loading, syncing, syncProgress, syncTotal, error, syncAll }
}
