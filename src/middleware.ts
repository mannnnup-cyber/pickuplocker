import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Detect old Android WebView browsers (Android 5.x / Chrome 37-45)
 * These WebViews cannot render modern CSS (oklch, CSS variables, CSS Grid)
 * or run modern JS (ES2017+, async/await, Promises natively).
 * Redirect them to kiosk-lite which is server-rendered pure HTML.
 *
 * IMPORTANT: Detection must be very conservative. Only detect genuinely old
 * Android WebViews to avoid false positives that cause redirect loops.
 */
function isOldAndroidWebView(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') || ''

  // Must be Android
  const androidMatch = ua.match(/Android\s+(\d+(?:\.\d+)?)/)
  if (!androidMatch) return false

  const androidVersion = parseFloat(androidMatch[1])
  if (androidVersion > 5.1) return false // Android 6+ is fine

  // Must have the 'wv' flag (standard Android WebView marker)
  // This is the SAFEST detection — only real WebViews have this flag
  if (ua.includes('; wv') || ua.includes(' wv)')) {
    return true
  }

  // Old Android Browser (pre-Chrome) — no Chrome/ token at all
  if (!ua.includes('Chrome/') && ua.includes('Mobile Safari/')) {
    return true
  }

  // Very old Chrome on Android 5 (Chrome < 46 in a WebView context)
  if (ua.includes('Chrome/')) {
    const chromeMatch = ua.match(/Chrome\/(\d+)/)
    if (chromeMatch) {
      const chromeVersion = parseInt(chromeMatch[1])
      // Only flag as old if Chrome is genuinely old AND it's an Android 5 device
      if (chromeVersion < 46 && androidVersion <= 5.1) {
        return true
      }
    }
  }

  return false
}

/**
 * Middleware for performance optimizations, caching, and WebView detection
 * Runs on the edge before reaching your application
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ---- ALWAYS skip: kiosk-lite and API routes ----
  // Never redirect these — prevents infinite redirect loops
  if (pathname.startsWith('/kiosk-lite') || pathname.startsWith('/api/')) {
    const response = NextResponse.next()
    // Add cache-control for kiosk-lite
    if (pathname.startsWith('/kiosk-lite')) {
      response.headers.set('Cache-Control', 'no-store')
    }
    return response
  }

  // Skip static files and assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // ---- WebView Detection: Redirect old Android to kiosk-lite ----
  if (isOldAndroidWebView(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/kiosk-lite'
    return NextResponse.redirect(url)
  }

  // ---- Security headers and caching for normal browsers ----
  const response = NextResponse.next()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // Root page - short cache
  if (pathname === '/' || pathname === '') {
    response.headers.set(
      'Cache-Control',
      'public, max-age=10, stale-while-revalidate=30'
    )
  }

  // Dashboard/auth pages - private, no caching
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
