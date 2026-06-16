/**
 * Kiosk-safe fetch with timeout and HTTP status validation.
 * 
 * Prevents white screens by:
 * 1. Timing out stuck requests after 10 seconds
 * 2. Throwing on non-2xx HTTP responses (instead of silently returning bad data)
 * 3. Providing a clear error message for network failures
 */

const DEFAULT_TIMEOUT_MS = 10000 // 10 seconds — enough for normal API calls, fast enough to recover

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`)
    this.name = 'FetchTimeoutError'
  }
}

export class FetchHttpError extends Error {
  status: number
  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${url}`)
    this.name = 'FetchHttpError'
    this.status = status
  }
}

/**
 * Fetch with automatic timeout and HTTP status validation.
 * 
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Response object (only if res.ok is true)
 * @throws FetchTimeoutError if the request takes too long
 * @throws FetchHttpError if the server returns a non-2xx status
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new FetchHttpError(res.status, url)
    }

    return res
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch JSON with timeout and status validation.
 * Convenience wrapper that parses the response as JSON.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const res = await fetchWithTimeout(url, options, timeoutMs)
  return res.json() as Promise<T>
}
