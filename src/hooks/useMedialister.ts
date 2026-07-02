import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchOffersPage, offerToSite } from '../lib/medialister'
import type { Site } from '../types'

interface UseMedialisterState {
  sites: Site[]
  totalItems: number
  loading: boolean
  syncing: boolean
  syncProgress: number
  syncTotal: number
  error: string | null
  currentPage: number
  totalPages: number
}

const CACHE_KEY = 'medialister_sites'
const CACHE_META_KEY = 'medialister_meta'
const CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

function loadCache(): { sites: Site[]; totalItems: number; fetchedAt: number } | null {
  try {
    const meta = localStorage.getItem(CACHE_META_KEY)
    if (!meta) return null
    const { totalItems, fetchedAt, pages } = JSON.parse(meta)
    if (Date.now() - fetchedAt > CACHE_TTL) return null

    const all: Site[] = []
    for (let i = 0; i < pages; i++) {
      const chunk = localStorage.getItem(`${CACHE_KEY}_${i}`)
      if (!chunk) return null
      all.push(...JSON.parse(chunk))
    }
    return { sites: all, totalItems, fetchedAt }
  } catch {
    return null
  }
}

function saveCache(sites: Site[], totalItems: number) {
  try {
    const chunkSize = 1000
    const pages = Math.ceil(sites.length / chunkSize)
    for (let i = 0; i < pages; i++) {
      localStorage.setItem(`${CACHE_KEY}_${i}`, JSON.stringify(sites.slice(i * chunkSize, (i + 1) * chunkSize)))
    }
    localStorage.setItem(CACHE_META_KEY, JSON.stringify({ totalItems, fetchedAt: Date.now(), pages }))
  } catch {
    // localStorage quota exceeded — skip caching
  }
}

export function useMedialister() {
  const [state, setState] = useState<UseMedialisterState>({
    sites: [],
    totalItems: 0,
    loading: true,
    syncing: false,
    syncProgress: 0,
    syncTotal: 0,
    error: null,
    currentPage: 1,
    totalPages: 1,
  })

  const abortRef = useRef(false)

  const syncAll = useCallback(async () => {
    abortRef.current = false
    setState(s => ({ ...s, syncing: true, error: null, syncProgress: 0 }))

    try {
      const first = await fetchOffersPage(1, 100)
      const total = first['hydra:totalItems']
      const totalPages = Math.ceil(total / 100)

      setState(s => ({ ...s, syncTotal: totalPages, totalItems: total }))

      const all: Site[] = first['hydra:member'].map(offerToSite)
      setState(s => ({ ...s, syncProgress: 1, sites: [...all] }))

      for (let page = 2; page <= totalPages; page++) {
        if (abortRef.current) break
        const data = await fetchOffersPage(page, 100)
        const batch = data['hydra:member'].map(offerToSite)
        all.push(...batch)
        setState(s => ({ ...s, syncProgress: page, sites: [...all] }))
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50))
      }

      saveCache(all, total)
      setState(s => ({ ...s, syncing: false, loading: false, sites: all }))
    } catch (err) {
      setState(s => ({ ...s, syncing: false, loading: false, error: String(err) }))
    }
  }, [])

  useEffect(() => {
    const cached = loadCache()
    if (cached) {
      setState(s => ({ ...s, sites: cached.sites, totalItems: cached.totalItems, loading: false }))
    } else {
      syncAll()
    }
    return () => { abortRef.current = true }
  }, [syncAll])

  return { ...state, syncAll }
}
