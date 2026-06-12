"use client"

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  countdown: number
}

/**
 * Kiosk-specific error boundary with auto-reload.
 * 
 * Unlike the global error page, this auto-recovers after 5 seconds
 * which is critical for an unattended kiosk tablet that may get
 * white screens after long idle periods.
 */
export class KioskErrorBoundary extends React.Component<Props, State> {
  private countdownTimer: NodeJS.Timeout | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, countdown: 5 }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, countdown: 5 }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Kiosk Error Boundary] Caught error:', error, errorInfo)
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (this.state.hasError && !prevState.hasError) {
      // Start countdown to auto-reload
      this.countdownTimer = setInterval(() => {
        this.setState(prev => {
          if (prev.countdown <= 1) {
            if (this.countdownTimer) clearInterval(this.countdownTimer)
            // Auto-reload the page
            window.location.href = '/'
            return { ...prev, countdown: 0 }
          }
          return { countdown: prev.countdown - 1 }
        })
      }, 1000)
    }
  }

  componentWillUnmount() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
    }
  }

  handleReload = () => {
    if (this.countdownTimer) clearInterval(this.countdownTimer)
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-900/20 border border-yellow-700/50">
              <svg className="h-10 w-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-white mb-2">
              Refreshing...
            </h1>
            
            <p className="text-gray-400 mb-4 text-sm">
              The kiosk will automatically restart in {this.state.countdown} seconds.
            </p>

            <button
              onClick={this.handleReload}
              className="rounded-lg bg-[#FFD439] px-6 py-3 text-sm font-semibold text-[#111111] hover:bg-[#FFD439]/90 transition-colors"
            >
              Restart Now
            </button>

            <p className="mt-6 text-xs text-gray-600">
              Pickup Jamaica Kiosk
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
