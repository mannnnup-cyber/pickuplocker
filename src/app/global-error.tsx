"use client"

/**
 * Global Error Boundary for the root layout.
 * 
 * This catches errors that error.tsx cannot — specifically errors in the
 * root layout itself (AuthProvider, CSS loading, hydration mismatches).
 * Without this file, any root layout error causes an unrecoverable white screen.
 * 
 * For kiosk tablets, this auto-reloads after 5 seconds so the device
 * recovers without manual intervention.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Auto-reload after 5 seconds — critical for unattended kiosk tablets
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.location.href = '/'
    }, 5000)
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#111111',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            {/* Warning icon */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgb(234, 179, 8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>

            <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              Refreshing...
            </h1>

            <p style={{ color: 'rgb(156, 163, 175)', fontSize: '14px', marginBottom: '16px' }}>
              The kiosk will automatically restart in 5 seconds.
            </p>

            <button
              onClick={() => { window.location.href = '/' }}
              style={{
                backgroundColor: '#FFD439',
                color: '#111111',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Restart Now
            </button>

            {error?.message && (
              <p style={{ color: 'rgb(75, 85, 99)', fontSize: '11px', marginTop: '16px', wordBreak: 'break-word' }}>
                {error.message}
              </p>
            )}

            <p style={{ color: 'rgb(55, 65, 81)', fontSize: '11px', marginTop: '24px' }}>
              Pickup Jamaica Kiosk
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
