"use client"

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Simple client-side cache with TTL
 * Reduces unnecessary API calls and function invocations
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

// Global cache store (persists across component re-renders)
const cache = new Map<string, CacheEntry<unknown>>()

// Default TTL values (in milliseconds)
export const CACHE_TTL = {
  SHORT: 10 * 1000,      // 10 seconds - for frequently changing data
  MEDIUM: 30 * 1000,     // 30 seconds - for moderately changing data
  LONG: 60 * 1000,       // 1 minute - for relatively stable data
  VERY_LONG: 5 * 60 * 1000, // 5 minutes - for rarely changing data
}

/**
 * Hook for fetching data with client-side caching
 * @param key - Unique cache key
 * @param fetcher - Function to fetch data
 * @param ttl - Time to live in milliseconds
 * @param enabled - Whether to fetch (useful for conditional fetching)
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM,
  enabled: boolean = true
): {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  clearCache: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const isFetching = useRef(false)

  const fetchData = useCallback(async (forceRefresh: boolean = false) => {
    // Prevent duplicate requests
    if (isFetching.current) return
    
    // Check cache first
    const cached = cache.get(key)
    if (!forceRefresh && cached && Date.now() - cached.timestamp < cached.ttl) {
      setData(cached.data as T)
      setLoading(false)
      return
    }

    isFetching.current = true
    setLoading(true)
    setError(null)

    try {
      const result = await fetcher()
      setData(result)
      cache.set(key, {
        data: result,
        timestamp: Date.now(),
        ttl,
      })
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fetch failed'))
    } finally {
      setLoading(false)
      isFetching.current = false
    }
  }, [key, fetcher, ttl])

  const refetch = useCallback(async () => {
    await fetchData(true)
  }, [fetchData])

  const clearCache = useCallback(() => {
    cache.delete(key)
  }, [key])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData])

  // Refresh when tab becomes visible (but use cache if still valid)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && enabled) {
        const cached = cache.get(key)
        if (!cached || Date.now() - cached.timestamp >= cached.ttl) {
          fetchData()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [enabled, key, fetchData])

  return { data, loading, error, refetch, clearCache }
}

/**
 * Hook for interval-based refresh with smart caching
 * Only fetches if cache is stale
 */
export function useIntervalRefresh<T>(
  key: string,
  fetcher: () => Promise<T>,
  intervalMs: number = 60000,
  ttl: number = CACHE_TTL.MEDIUM
): {
  data: T | null
  loading: boolean
  refetch: () => Promise<void>
} {
  const { data, loading, refetch } = useCachedFetch(key, fetcher, ttl)

  useEffect(() => {
    const interval = setInterval(() => {
      // Only refetch if cache is stale
      const cached = cache.get(key)
      if (!cached || Date.now() - cached.timestamp >= ttl) {
        refetch()
      }
    }, intervalMs)

    return () => clearInterval(interval)
  }, [key, ttl, refetch])

  return { data, loading, refetch }
}

/**
 * Clear all cache entries
 */
export function clearAllCache() {
  cache.clear()
}

/**
 * Clear cache entries matching a pattern
 */
export function clearCachePattern(pattern: string) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key)
    }
  }
}
