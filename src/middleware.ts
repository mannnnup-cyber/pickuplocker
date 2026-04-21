import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Detect old Android WebView browsers (Android 5.x / Chrome 37-45)
 * These WebViews cannot render modern CSS (oklch, CSS variables, CSS Grid)
 * or run modern JS (ES2017+, async/await, Promises natively).
 * Redirect them to kiosk-lite which is server-rendered pure HTML.
 */
function isOldAndroidWebView(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') || ''

  // Match Android versions 4.x and 5.x
  const androidMatch = ua.match(/Android\s+(\d+(?:\.\d+)?)/)
  if (!androidMatch) return false

  const androidVersion = parseFloat(androidMatch[1])
  if (androidVersion > 5.1) return false // Android 6+ is fine

  // Confirm it's a WebView or old browser (not just any old Android UA)
  const isWebView =
    ua.includes('wv') ||                           // Standard Android WebView flag
    ua.includes('Version/') ||                      // Older WebView format
    ua.includes('Mobile Safari/') && !ua.includes('Chrome/') || // Very old Android browser
    (ua.includes('Chrome/') && (() => {             // Chrome < 46 on Android 5
      const chromeMatch = ua.match(/Chrome\/(\d+)/)
      return chromeMatch && parseInt(chromeMatch[1]) < 46
    })())

  return isWebView
}

/**
 * Middleware for performance optimizations, caching, and WebView detection
 * Runs on the edge before reaching your application
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const pathname = request.nextUrl.pathname

  // Skip middleware for static files and assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // files with extensions
  ) {
    return response
  }

  // ---- WebView Detection: Redirect old Android to kiosk-lite ----
  if (isOldAndroidWebView(request)) {
    // Already on kiosk-lite or an API route? Let it through.
    if (pathname.startsWith('/kiosk-lite') || pathname.startsWith('/api/')) {
      // pass through
    } else {
      // Redirect everything else to kiosk-lite
      const url = request.nextUrl.clone()
      url.pathname = '/kiosk-lite'
      return NextResponse.redirect(url)
    }
  }

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // API caching strategies
  if (pathname.startsWith('/api/')) {
    // For read-only API endpoints that are safe to cache
    const readOnlyApis = [
      '/api/status',
      '/api/stats',
      '/api/boxes/availability',
      '/api/sync', // GET only
      '/api/health',
      '/api/devices', // GET only
    ]

    const isReadOnly = readOnlyApis.some(api => 
      pathname === api || pathname.startsWith(api + '/')
    )

    if (isReadOnly && request.method === 'GET') {
      // Let the edge cache these responses
      // Actual caching is controlled by route handlers and next.config.ts
    }

    // Don't cache mutation endpoints
    if (request.method !== 'GET') {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    }
  }

  // For the kiosk page (most commonly hit), add a short cache
  if (pathname === '/' || pathname === '') {
    response.headers.set(
      'Cache-Control',
      'public, max-age=10, stale-while-revalidate=30'
    )
  }

  // Dashboard pages - private, no caching
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/login')) {
    response.headers.set('Cache-Control', 'private, no-cache, no-store')
  }

  return response
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
