import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for performance optimizations and caching
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
