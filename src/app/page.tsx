"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { KioskErrorBoundary } from './kiosk-error-boundary'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Package, 
  QrCode, 
  MapPin,
  Truck,
  CheckCircle,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Smartphone,
  User,
  Clock,
  Box,
  X,
  RefreshCw,
  Mail
} from "lucide-react"

// Types
type View = 
  | "home" 
  | "dropoff" 
  | "dropoff-code" 
  | "dropoff-buy" 
  | "dropoff-payment-options"
  | "dropoff-courier"
  | "pickup" 
  | "payment" 
  | "success"
  | "courier-dashboard"

interface OrderResult {
  success: boolean
  orderNo?: string
  saveCode?: string
  pickCode?: string
  boxName?: string
  boxSize?: string
  deviceName?: string
  deviceLocation?: string
  error?: string
  requiresPhone?: boolean
  requiresPayment?: boolean
  storageFee?: number
  storageDays?: number
  courierBalance?: number
}

interface PaymentResult {
  success: boolean
  paymentId?: string
  paymentUrl?: string
  qrCodeDataUrl?: string
  amount?: number
  boxSize?: string
  saveCode?: string
  error?: string
  isDemoMode?: boolean
}

// Courier session
interface CourierSession {
  id: string
  name: string
  phone: string
  balance: number
  totalDropOffs?: number
  totalSpent?: number
}

// Box sizes with prices (static definition)
const ALL_BOX_SIZES = [
  { code: 'S', name: 'Small', price: 150, description: 'Phones, letters, small items' },
  { code: 'M', name: 'Medium', price: 200, description: 'Shoes, books, clothing' },
  { code: 'L', name: 'Large', price: 300, description: 'Larger packages' },
  { code: 'XL', name: 'Extra Large', price: 400, description: 'Bulky items' },
]

// Auto-timeout duration (60 seconds)
const AUTO_TIMEOUT_MS = 60000

// Fetch with timeout — prevents white screen when API calls hang
const FETCH_TIMEOUT_MS = 10000

async function kioskFetch(url: string, options?: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`)
    }
    return res
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Box availability type
interface BoxAvailability {
  code: string
  available: number
}

function KioskPage() {
  // View state
  const [view, setView] = useState<View>("home")
  
  // Form states
  const [code, setCode] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [courierPhone, setCourierPhone] = useState("")
  const [courierPin, setCourierPin] = useState("")
  const [courierSession, setCourierSession] = useState<CourierSession | null>(null)
  const [courierLoginStep, setCourierLoginStep] = useState<"phone" | "pin">("phone")
  const [selectedBoxSize, setSelectedBoxSize] = useState<string>("")
  const [senderName, setSenderName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  
  // Box availability
  const [boxAvailability, setBoxAvailability] = useState<BoxAvailability[]>([])
  const [loadingBoxes, setLoadingBoxes] = useState(true)
  
  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Result data
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null)
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null)
  
  // Auto-timeout
  const [lastActivity, setLastActivity] = useState(Date.now())
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(10)

  // Refs for timer cleanup (prevents memory leaks that cause white screen)
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const visibilityHandlerRef = useRef<(() => void) | null>(null)
  const isMountedRef = useRef(true)
  const loadingStartTimeRef = useRef<number | null>(null)

  // Reset all state — defined early because it's referenced by recovery useEffects below
  const resetState = useCallback(() => {
    // Cancel any active polling
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
      visibilityHandlerRef.current = null
    }
    setView("home")
    setCode("")
    setPhoneNumber("")
    setCourierPhone("")
    setCourierPin("")
    setCourierSession(null)
    setCourierLoginStep("phone")
    setSelectedBoxSize("")
    setSenderName("")
    setCustomerEmail("")
    setLoading(false)
    setError(null)
    setOrderResult(null)
    setPaymentResult(null)
    setShowTimeoutWarning(false)
    setSecondsRemaining(10)
    setBoxAvailability([])
    setLoadingBoxes(true)
  }, [])

  // Auto-recovery: reload page if it's been stuck/idle too long (prevents white screen)
  useEffect(() => {
    const HEARTBEAT_KEY = 'pickup_kiosk_heartbeat'
    const CRASH_KEY = 'pickup_kiosk_crashed'
    const RECOVERY_MS = 30 * 60 * 1000 // 30 minutes - if no heartbeat, something is wrong
    
    // Write heartbeat
    const heartbeat = setInterval(() => {
      try { localStorage.setItem(HEARTBEAT_KEY, Date.now().toString()) } catch {}
    }, 60000)

    // Check if previous session crashed (no heartbeat for 30 min = white screen)
    try {
      const lastHeartbeat = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0')
      const hadCrash = localStorage.getItem(CRASH_KEY)
      if (hadCrash || (lastHeartbeat && (Date.now() - lastHeartbeat > RECOVERY_MS))) {
        console.log('[Kiosk] Previous session appears to have crashed. Recovering...')
        localStorage.removeItem(CRASH_KEY)
        localStorage.removeItem(HEARTBEAT_KEY)
        // Actually recover — reload the page to clear stuck state
        window.location.reload()
        return
      }
    } catch {}

    // Mark crash on unload (beforeunload fires when page closes/crashes)
    const markCrash = () => {
      try { localStorage.setItem(CRASH_KEY, '1') } catch {}
    }
    window.addEventListener('beforeunload', markCrash)

    // Clear crash flag on successful load (if we made it this far, we're alive)
    try { localStorage.removeItem(CRASH_KEY) } catch {}

    // Write initial heartbeat
    try { localStorage.setItem(HEARTBEAT_KEY, Date.now().toString()) } catch {}

    return () => {
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', markCrash)
      try { localStorage.removeItem(HEARTBEAT_KEY) } catch {}
    }
  }, [])

  // Visibility change handler — prevents white screen when kiosk tab comes back from background
  // Browsers throttle/freeze tabs in background, which can corrupt React state
  useEffect(() => {
    let hiddenAt: number | null = null
    const MAX_BACKGROUND_MS = 5 * 60 * 1000 // 5 minutes — if hidden longer, force refresh

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Record when the page went hidden
        hiddenAt = Date.now()
        console.log('[Kiosk] Page hidden at', new Date().toLocaleTimeString())
      } else if (document.visibilityState === 'visible') {
        // Page is visible again
        if (hiddenAt) {
          const hiddenDuration = Date.now() - hiddenAt
          console.log('[Kiosk] Page visible again after', Math.round(hiddenDuration / 1000), 'seconds')

          // If hidden for too long, do a full page reload to clear any corrupted state
          if (hiddenDuration > MAX_BACKGROUND_MS) {
            console.log('[Kiosk] Page was hidden too long. Reloading to prevent white screen...')
            window.location.reload()
            return
          }

          // If hidden for a moderate time, refresh box availability and reset if on home screen
          if (hiddenDuration > 30000) {
            // Refresh box data since it may be stale
            const refreshBoxes = async () => {
              try {
                const res = await kioskFetch('/api/boxes/availability', undefined, 15000)
                const data = await res.json()
                if (data.success) {
                  setBoxAvailability(data.sizes)
                }
              } catch (err) {
                console.error('[Kiosk] Failed to refresh box availability after visibility change:', err)
              }
            }
            refreshBoxes()
          }
        }
        hiddenAt = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Periodic self-healing check — detects and recovers from white/frozen screen states
  useEffect(() => {
    const CHECK_INTERVAL = 2 * 60 * 1000 // Every 2 minutes
    const WHITE_SCREEN_CHECK_KEY = 'pickup_kiosk_alive'

    const selfHeal = () => {
      try {
        const now = Date.now()
        localStorage.setItem(WHITE_SCREEN_CHECK_KEY, now.toString())

        // Check if the DOM is actually rendering — if the root element has no children
        // or has collapsed, the page is likely frozen/white
        const rootEl = document.getElementById('__next') || document.getElementById('root')
        if (rootEl) {
          const hasContent = rootEl.children.length > 0 || rootEl.textContent?.trim()
          if (!hasContent) {
            console.error('[Kiosk] White screen detected — root element is empty. Forcing reload.')
            window.location.reload()
            return
          }
        }

        // Check if we've been on the same non-home view for too long (possible frozen state)
        // This is a soft check — the auto-timeout should handle most cases,
        // but if timers are frozen, we need this fallback
        const lastHeartbeat = parseInt(localStorage.getItem('pickup_kiosk_heartbeat') || '0')
        if (lastHeartbeat && (now - lastHeartbeat > 10 * 60 * 1000)) {
          // No heartbeat update for 10 minutes means timers are likely frozen
          console.error('[Kiosk] No heartbeat for 10 minutes — timers appear frozen. Reloading.')
          window.location.reload()
        }
      } catch (err) {
        console.error('[Kiosk] Self-heal check failed:', err)
      }
    }

    const interval = setInterval(selfHeal, CHECK_INTERVAL)
    // Run once immediately on mount
    selfHeal()
    return () => clearInterval(interval)
  }, [])

  // Cleanup all polling timers on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Clear any active polling timer
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
      // Remove any dangling visibilitychange listener
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
        visibilityHandlerRef.current = null
      }
    }
  }, [])

  // Global unhandled rejection handler — prevents white screen from uncaught promise errors
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Kiosk] Unhandled promise rejection:', event.reason)
      event.preventDefault()
      // If we're in a loading state and get an unhandled rejection, recover
      setError('An unexpected error occurred. The kiosk will restart shortly.')
      setLoading(false)
      setLoadingBoxes(false)
      // Auto-recover after 5 seconds
      setTimeout(() => {
        resetState()
      }, 5000)
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }, [resetState])

  // Stuck-state watchdog — detects when loading has been stuck too long and forces recovery
  useEffect(() => {
    const STUCK_THRESHOLD_MS = 30000 // 30 seconds — if loading is stuck this long, something is wrong
    const CHECK_INTERVAL_MS = 5000   // Check every 5 seconds

    const checkStuckState = () => {
      const isLoading = loading || loadingBoxes
      if (isLoading) {
        if (!loadingStartTimeRef.current) {
          loadingStartTimeRef.current = Date.now()
        }
        const stuckDuration = Date.now() - loadingStartTimeRef.current
        if (stuckDuration > STUCK_THRESHOLD_MS) {
          console.error(`[Kiosk] Stuck loading state detected for ${stuckDuration}ms. Forcing recovery.`)
          loadingStartTimeRef.current = null
          setLoading(false)
          setLoadingBoxes(false)
          setError('Connection issue. Restarting...')
          // Auto-recover after 3 seconds
          setTimeout(() => {
            resetState()
          }, 3000)
        }
      } else {
        loadingStartTimeRef.current = null
      }
    }

    const interval = setInterval(checkStuckState, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loading, loadingBoxes, resetState])

  // Get available box sizes based on actual availability
  const BOX_SIZES = ALL_BOX_SIZES.filter(box => {
    const availability = boxAvailability.find(a => a.code === box.code)
    return availability && availability.available > 0
  }).map(box => {
    const availability = boxAvailability.find(a => a.code === box.code)
    return {
      ...box,
      available: availability?.available || 0,
    }
  })

  // Fetch box availability on mount AND periodically (keeps kiosk alive + data fresh)
  useEffect(() => {
    const fetchBoxAvailability = async () => {
      try {
        const res = await kioskFetch('/api/boxes/availability', undefined, 15000)
        const data = await res.json()
        if (data.success) {
          setBoxAvailability(data.sizes)
        }
      } catch (err) {
        console.error('Failed to fetch box availability:', err)
        if (err instanceof Error && err.message.includes('timed out')) {
          console.error('[Kiosk] Box availability request timed out — server may be slow')
        }
      } finally {
        setLoadingBoxes(false)
      }
    }
    fetchBoxAvailability()

    // Refresh box availability every 5 minutes to keep data fresh
    // and serve as a liveness check (if this stops running, the self-heal will detect it)
    const refreshInterval = setInterval(fetchBoxAvailability, 5 * 60 * 1000)
    return () => clearInterval(refreshInterval)
  }, [])

  // Update last activity time
  const updateActivity = useCallback(() => {
    setLastActivity(Date.now())
    setShowTimeoutWarning(false)
    setSecondsRemaining(10)
  }, [])

  // Auto-timeout effect (only active when not on home screen)
  useEffect(() => {
    // Skip timeout logic entirely on home screen
    if (view === "home") {
      setShowTimeoutWarning(false)
      return
    }

    const checkTimeout = () => {
      const elapsed = Date.now() - lastActivity
      const remaining = AUTO_TIMEOUT_MS - elapsed
      
      if (remaining <= 10000 && remaining > 0 && !showTimeoutWarning) {
        setShowTimeoutWarning(true)
        setSecondsRemaining(Math.ceil(remaining / 1000))
      }
      
      if (elapsed >= AUTO_TIMEOUT_MS) {
        resetState()
      }
    }

    const interval = setInterval(checkTimeout, 1000)
    return () => clearInterval(interval)
  }, [lastActivity, view, showTimeoutWarning, resetState])

  // Countdown effect when warning is shown
  useEffect(() => {
    if (!showTimeoutWarning) return
    
    const countdownInterval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(countdownInterval)
  }, [showTimeoutWarning])

  // Handle screen touch/click to reset timeout
  useEffect(() => {
    const handleActivity = () => updateActivity()
    window.addEventListener('touchstart', handleActivity)
    window.addEventListener('click', handleActivity)
    return () => {
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('click', handleActivity)
    }
  }, [updateActivity])

  // Render touch-friendly numeric keypad
  const renderKeypad = (value: string, onChange: (val: string) => void, maxLength: number = 6) => {
    const handleKeyPress = (key: string) => {
      if (key === "clear") {
        onChange("")
      } else if (key === "backspace") {
        onChange(value.slice(0, -1))
      } else if (value.length < maxLength) {
        onChange(value + key)
      }
    }

    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"]

    return (
      <div className="w-full max-w-sm mx-auto">
        {/* Display */}
        <div className="bg-gray-100 rounded-xl p-4 mb-4">
          <div className="text-center text-4xl font-mono tracking-widest text-gray-800 min-h-[48px]">
            {value.split("").map((digit, i) => (
              <span key={i} className="inline-block w-8">{digit}</span>
            ))}
            {Array(maxLength - value.length).fill(0).map((_, i) => (
              <span key={`empty-${i}`} className="inline-block w-8 text-gray-300">_</span>
            ))}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {keys.map((key) => (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className={`
                h-16 rounded-xl text-2xl font-bold transition-all active:scale-95
                ${key === "clear" || key === "backspace"
                  ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  : "bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90"
                }
              `}
            >
              {key === "backspace" ? "⌫" : key === "clear" ? "CLR" : key}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Handle drop-off with existing code
  const handleDropoffWithCode = async () => {
    if (code.length !== 6) {
      setError("Please enter a valid 6-digit code")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/kiosk/use-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          codeType: "save",
          recipientPhone: phoneNumber || undefined,
        }),
      })
      const data = await res.json()
      setOrderResult(data)

      if (data.requiresPhone) {
        setView("dropoff-code")
        return
      }

      if (data.success) {
        setView("success")
      } else {
        setError(data.error || "Failed to process drop-off")
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle drop-off payment
  const handleDropoffPayment = async () => {
    if (!selectedBoxSize || !phoneNumber) {
      setError("Please select a box size and enter phone number")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/kiosk/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_dropoff_payment",
          boxSize: selectedBoxSize,
          phone: phoneNumber,
          email: customerEmail || undefined,
        }),
      })
      const data = await res.json()
      setPaymentResult(data)

      if (data.success) {
        // Start polling for payment
        pollPaymentStatus(data.paymentId)
      } else {
        setError(data.error || "Failed to create payment")
      }
      
      return data
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
      return null
    } finally {
      setLoading(false)
    }
  }

  // Poll payment status with smart backoff
  const pollPaymentStatus = async (paymentId: string) => {
    const maxAttempts = 45 // ~6 minutes with backoff
    let attempts = 0

    const poll = async () => {
      // Stop if component unmounted
      if (!isMountedRef.current) return

      if (attempts >= maxAttempts) {
        setError("Payment timeout. Please try again.")
        return
      }

      // Stop polling if tab is hidden
      if (document.visibilityState === 'hidden') {
        // Remove any PREVIOUS orphaned listener before adding a new one
        if (visibilityHandlerRef.current) {
          document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
          visibilityHandlerRef.current = null
        }
        // Resume when visible again - track listener for cleanup
        const handleVisible = () => {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', handleVisible)
            if (visibilityHandlerRef.current === handleVisible) {
              visibilityHandlerRef.current = null
            }
            poll()
          }
        }
        visibilityHandlerRef.current = handleVisible
        document.addEventListener('visibilitychange', handleVisible)
        return
      }

      attempts++

      try {
        const res = await kioskFetch(`/api/kiosk/payment?paymentId=${paymentId}`, undefined, 10000)
        const data = await res.json()

        if (!isMountedRef.current) return

        if (data.status === "completed") {
          setCode(data.saveCode || "")
          // Go directly to dropoff-code view which shows the code
          setView("dropoff-code")
          setPaymentResult(null) // Clear payment result
          return
        }

        if (data.status === "failed") {
          setError("Payment failed. Please try again.")
          return
        }

        // Exponential backoff: 5s for first 10 attempts, then 8s, then 10s
        const delay = attempts < 10 ? 5000 : attempts < 25 ? 8000 : 10000
        pollingTimerRef.current = setTimeout(poll, delay)
      } catch {
        // Continue polling on error with longer delay
        pollingTimerRef.current = setTimeout(poll, 8000)
      }
    }

    poll()
  }

  // Handle immediate box opening after payment
  const handleOpenBoxImmediately = async () => {
    if (!code || code.length !== 6) {
      setError("No valid save code available")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/kiosk/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open_box_after_payment",
          saveCode: code,
          recipientPhone: phoneNumber,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setOrderResult({
          success: true,
          boxName: data.boxName,
          pickCode: data.pickCode,
        })
        setView("success")
      } else {
        setError(data.error || "Failed to open locker")
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle pickup
  const handlePickup = async () => {
    if (code.length !== 6) {
      setError("Please enter a valid 6-digit code")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/kiosk/use-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          codeType: "pick",
        }),
      })
      const data = await res.json()
      setOrderResult(data)

      if (data.requiresPayment) {
        setView("payment")
        return
      }

      if (data.success) {
        setView("success")
      } else {
        setError(data.error || "Invalid pickup code")
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle storage fee payment
  const handleStorageFeePayment = async () => {
    if (!orderResult?.orderNo) return

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/kiosk/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_storage_fee_payment",
          orderId: orderResult.orderNo,
          amount: orderResult.storageFee,
        }),
      })
      const data = await res.json()
      setPaymentResult(data)

      if (data.success) {
        // Start polling for payment with smart backoff
        const pollStoragePayment = async (paymentId: string) => {
          const maxAttempts = 45 // ~6 minutes with backoff
          let attempts = 0

          const poll = async () => {
            // Stop if component unmounted
            if (!isMountedRef.current) return

            if (attempts >= maxAttempts) {
              setError("Payment timeout. Please try again.")
              return
            }

            // Stop polling if tab is hidden - track listener for cleanup
            if (document.visibilityState === 'hidden') {
              // Remove any PREVIOUS orphaned listener before adding a new one
              if (visibilityHandlerRef.current) {
                document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
                visibilityHandlerRef.current = null
              }
              const handleVisible = () => {
                if (document.visibilityState === 'visible') {
                  document.removeEventListener('visibilitychange', handleVisible)
                  if (visibilityHandlerRef.current === handleVisible) {
                    visibilityHandlerRef.current = null
                  }
                  poll()
                }
              }
              visibilityHandlerRef.current = handleVisible
              document.addEventListener('visibilitychange', handleVisible)
              return
            }

            attempts++

            try {
              const res = await kioskFetch(`/api/kiosk/payment?paymentId=${paymentId}`, undefined, 10000)
              const pollData = await res.json()

              if (!isMountedRef.current) return

              if (pollData.status === "completed") {
                // Payment successful, now process pickup
                const pickupRes = await kioskFetch("/api/kiosk/use-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    code,
                    codeType: "pick",
                    paymentMethod: "ONLINE",
                  }),
                })
                const pickupData = await pickupRes.json()
                setOrderResult(pickupData)

                if (pickupData.success) {
                  setView("success")
                } else {
                  setError(pickupData.error || "Failed to open locker")
                }
                return
              }

              if (pollData.status === "failed") {
                setError("Payment failed. Please try again.")
                return
              }

              // Exponential backoff
              const delay = attempts < 10 ? 5000 : attempts < 25 ? 8000 : 10000
              pollingTimerRef.current = setTimeout(poll, delay)
            } catch {
              pollingTimerRef.current = setTimeout(poll, 8000)
            }
          }

          poll()
        }

        pollStoragePayment(data.paymentId)
      } else {
        setError(data.error || "Failed to create payment")
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle courier phone submission
  const handleCourierPhoneSubmit = async () => {
    if (courierPhone.length < 10) {
      setError("Please enter a valid phone number")
      return
    }

    // Move to PIN step
    setCourierLoginStep("pin")
    setError(null)
  }

  // Handle courier login
  const handleCourierLogin = async () => {
    if (courierPin.length !== 4) {
      setError("Please enter a valid 4-digit PIN")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/courier/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: courierPhone,
          pin: courierPin
        })
      })
      const data = await res.json()

      if (data.success) {
        if (data.requirePinSetup) {
          // First-time login - need to set PIN
          setError(`Welcome ${data.courierName}! Please visit pickupja.com/courier/pin?courierId=${data.courierId} to set your PIN.`)
        } else {
          // Login successful
          setCourierSession({
            id: data.courier.id,
            name: data.courier.name,
            phone: data.courier.phone,
            balance: data.courier.balance,
            totalDropOffs: data.courier.totalDropOffs,
            totalSpent: data.courier.totalSpent
          })
          setView("courier-dashboard")
        }
      } else {
        setError(data.error || "Login failed. Please try again.")
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle courier drop-off
  const handleCourierDropoff = async () => {
    if (!selectedBoxSize || !phoneNumber) {
      setError("Please select a box size and enter phone number")
      return
    }

    if (!courierSession) {
      setError("Session expired. Please login again.")
      setView("dropoff-courier")
      return
    }

    const boxPrice = BOX_SIZES.find(b => b.code === selectedBoxSize)?.price || 0

    // Check if courier has enough balance
    if (courierSession.balance < boxPrice) {
      setError(`Insufficient balance. You need JMD $${boxPrice} but have JMD $${courierSession.balance}. Please top up your account.`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await kioskFetch("/api/kiosk/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_order",
          boxSize: selectedBoxSize,
          recipientPhone: phoneNumber,
          senderName: senderName || undefined,
          courierId: courierSession.id,
          courierPin,
        }),
      })
      const data = await res.json()
      setOrderResult(data)

      if (data.success) {
        // Update local balance
        setCourierSession(prev => prev ? { ...prev, balance: prev.balance - boxPrice } : null)
        setView("success")
      } else {
        setError(data.error || "Failed to create order")
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('timed out')) {
        setError("Server is taking too long to respond. Please try again.")
      } else {
        setError("Failed to connect to server. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Render home screen
  const renderHome = () => (
    <div className="min-h-screen bg-[#111111] flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="flex items-center justify-center gap-3">
          <img 
            src="/logo-icon.png" 
            alt="Pickup Logo" 
            className="h-20 w-auto object-contain"
          />
          <div>
            <h1 className="text-3xl font-bold text-white uppercase tracking-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
              PICK<span className="text-[#FFD439]">UP</span>
            </h1>
            <p className="text-sm text-gray-400">SMART LOCKER SYSTEM</p>
          </div>
        </div>
      </header>

      {/* Main buttons */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
        <button
          onClick={() => setView("dropoff")}
          className="w-full max-w-md h-40 bg-[#FFD439] rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-[#FFD439]/90 active:scale-95 transition-all shadow-lg"
        >
          <Package className="h-16 w-16 text-[#111111]" />
          <span className="text-3xl font-bold text-[#111111] uppercase">DROP-OFF</span>
        </button>

        <button
          onClick={() => setView("pickup")}
          className="w-full max-w-md h-40 bg-white rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-gray-50 active:scale-95 transition-all shadow-lg"
        >
          <QrCode className="h-16 w-16 text-[#111111]" />
          <span className="text-3xl font-bold text-[#111111] uppercase">PICKUP</span>
        </button>
      </main>

      {/* Footer */}
      <footer className="p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Clock className="h-5 w-5" />
            <span>Available 24/7</span>
          </div>
          <Link href="/login" className="text-gray-500 text-sm underline">
            Staff Login
          </Link>
        </div>
      </footer>
    </div>
  )

  // Render drop-off options
  const renderDropoffOptions = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={resetState} className="text-white">
            <ArrowLeft className="h-8 w-8" />
          </button>
          <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
            DROP-OFF
          </h1>
        </div>
      </header>

      {/* Options */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <button
          onClick={() => setView("dropoff-code")}
          className="w-full max-w-md h-32 bg-white rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 active:scale-95 transition-all shadow-lg p-4"
        >
          <QrCode className="h-10 w-10 text-[#111111]" />
          <span className="text-xl font-bold text-[#111111] uppercase">I have a Drop-off Code</span>
          <span className="text-sm text-gray-500">Enter your existing save code</span>
        </button>

        <button
          onClick={() => setView("dropoff-buy")}
          className="w-full max-w-md h-32 bg-[#FFD439] rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-[#FFD439]/90 active:scale-95 transition-all shadow-lg p-4"
        >
          <CreditCard className="h-10 w-10 text-[#111111]" />
          <span className="text-xl font-bold text-[#111111] uppercase">Buy a Drop-off Code</span>
          <span className="text-sm text-gray-700">Pay via DimePay QR - Starting at $150 JMD</span>
        </button>

        <button
          onClick={() => setView("dropoff-courier")}
          className="w-full max-w-md h-32 bg-white rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-50 active:scale-95 transition-all shadow-lg p-4 border-2 border-[#111111]"
        >
          <Truck className="h-10 w-10 text-[#111111]" />
          <span className="text-xl font-bold text-[#111111] uppercase">I'm a Courier</span>
          <span className="text-sm text-gray-500">Login with courier PIN</span>
        </button>
      </main>
    </div>
  )

  // Render drop-off with code
  const renderDropoffCode = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setView("dropoff")} className="text-white">
            <ArrowLeft className="h-8 w-8" />
          </button>
          <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
            {code.length === 6 ? "DROP-OFF READY" : "ENTER DROP-OFF CODE"}
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
            {/* If we have a pre-filled code from payment success */}
            {code.length === 6 ? (
              <div className="text-center">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Payment Successful!</h2>
                <p className="text-gray-600 mb-4">Your drop-off code is ready</p>
                
                {/* Show the save code */}
                <div className="bg-[#FFD439] p-4 rounded-xl mb-6">
                  <p className="text-sm text-gray-600">Your Save Code</p>
                  <p className="text-3xl font-bold tracking-widest">{code}</p>
                </div>

                {/* Immediate deposit option */}
                <button
                  onClick={handleOpenBoxImmediately}
                  disabled={loading}
                  className="w-full h-16 bg-green-500 rounded-xl text-xl font-bold text-white uppercase hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50 mb-4"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : (
                    "📦 DEPOSIT NOW"
                  )}
                </button>

                <p className="text-xs text-gray-400 mb-4">
                  This will open a locker immediately. Place your package inside and close the door.
                </p>

                <hr className="my-4" />

                <p className="text-sm text-gray-500">
                  Or enter this code later at any Pickup locker
                </p>
              </div>
            ) : (
              <>
                <p className="text-center text-gray-600 mb-6">
                  Enter your 6-digit drop-off code
                </p>

                {renderKeypad(code, setCode, 6)}

                {/* Phone number input if needed */}
                {orderResult?.requiresPhone && (
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Recipient Phone Number
                    </label>
                    {renderKeypad(phoneNumber, setPhoneNumber, 10)}
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleDropoffWithCode}
                  disabled={loading || code.length !== 6}
                  className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : (
                    "OPEN LOCKER"
                  )}
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render buy drop-off code
  const renderDropoffBuy = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setView("dropoff")} className="text-white">
            <ArrowLeft className="h-8 w-8" />
          </button>
          <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
            BUY DROP-OFF CODE
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
            {/* Box size selection */}
            <p className="text-center text-gray-600 mb-4">Select Box Size</p>
            
            {loadingBoxes ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#FFD439]" />
                <p className="mt-2 text-gray-600">Checking availability...</p>
              </div>
            ) : BOX_SIZES.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 font-medium">No boxes available</p>
                <p className="text-gray-500 text-sm mt-2">All lockers are currently in use. Please try again later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {BOX_SIZES.map((box) => (
                  <button
                    key={box.code}
                    onClick={() => setSelectedBoxSize(box.code)}
                    className={`p-4 rounded-xl text-left transition-all ${
                      selectedBoxSize === box.code
                        ? "bg-[#FFD439] text-[#111111]"
                        : "bg-white border-2 border-gray-200 hover:border-[#FFD439]"
                    }`}
                  >
                    <div className="font-bold text-lg uppercase">{box.code} - ${box.price}</div>
                    <div className="text-sm opacity-70">{box.description}</div>
                    <div className="text-xs mt-1 opacity-60">{box.available} available</div>
                  </button>
                ))}
              </div>
            )}

            {/* Phone number */}
            <p className="text-center text-gray-600 mb-4">Enter Phone Number</p>
            {renderKeypad(phoneNumber, setPhoneNumber, 10)}

            {/* Email (optional) */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                Email (Optional - Receive your code via email)
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full h-14 pl-12 pr-4 rounded-xl border-2 border-gray-200 focus:border-[#FFD439] outline-none text-lg"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {paymentResult?.success && (
              <div className="mt-6 text-center">
                {/* Demo mode indicator */}
                {paymentResult.isDemoMode && (
                  <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg mb-4 font-bold uppercase text-sm">
                    🎮 DEMO MODE - For Testing Only
                  </div>
                )}
                
                <p className="text-lg font-bold mb-2">Amount: JMD ${paymentResult.amount}</p>
                <p className="text-sm text-gray-500 mb-4">
                  Payment ID: {paymentResult.paymentId}
                </p>
                
                {paymentResult.isDemoMode ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Click below to simulate a successful payment
                    </p>
                    <button
                      onClick={async () => {
                        // Complete payment and show options
                        setCode(paymentResult.saveCode || "");
                        // Start polling for completion
                        pollPaymentStatus(paymentResult.paymentId || "");
                      }}
                      className="w-full h-16 bg-green-500 rounded-xl text-xl font-bold text-white uppercase hover:bg-green-600 active:scale-95 transition-all"
                    >
                      ✓ SIMULATE PAYMENT SUCCESS
                    </button>
                    <p className="text-xs text-gray-400">
                      In production, this would show a real DimePay QR code
                    </p>
                  </div>
                ) : (
                  <>
                    <img 
                      src={paymentResult.qrCodeDataUrl} 
                      alt="Payment QR Code" 
                      className="mx-auto w-64 h-64 rounded-lg"
                    />
                    <p className="text-sm text-gray-500 mt-4">
                      Scan with DimePay app to complete payment
                    </p>
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mt-2 text-[#FFD439]" />
                  </>
                )}
              </div>
            )}

            {!paymentResult && (
              <button
                onClick={() => setView("dropoff-payment-options")}
                disabled={loading || !selectedBoxSize || phoneNumber.length < 7}
                className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                ) : (
                  `CONTINUE - $${BOX_SIZES.find(b => b.code === selectedBoxSize)?.price || 0} JMD`
                )}
              </button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render payment options screen
  const renderDropoffPaymentOptions = () => {
    
    // Handle Pay Here - redirect to payment page on this device
    const handlePayHere = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const res = await kioskFetch("/api/kiosk/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_dropoff_payment",
            boxSize: selectedBoxSize,
            phone: phoneNumber,
            email: customerEmail || undefined,
          }),
        })
        const data = await res.json()
        
        if (data.success && data.paymentUrl) {
          // Redirect to payment page
          window.location.href = data.paymentUrl
        } else {
          setError(data.error || "Failed to create payment")
          setLoading(false)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('timed out')) {
          setError("Server is taking too long to respond. Please try again.")
        } else {
          setError("Failed to connect to server. Please try again.")
        }
        setLoading(false)
      }
    }
    
    // Handle Pay on Phone - show QR code
    const handlePayOnPhone = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const res = await kioskFetch("/api/kiosk/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_dropoff_payment",
            boxSize: selectedBoxSize,
            phone: phoneNumber,
            email: customerEmail || undefined,
          }),
        })
        const data = await res.json()
        setPaymentResult(data)
        
        if (data.success) {
          // Start polling for payment completion
          pollPaymentStatus(data.paymentId)
        } else {
          setError(data.error || "Failed to create payment")
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('timed out')) {
          setError("Server is taking too long to respond. Please try again.")
        } else {
          setError("Failed to connect to server. Please try again.")
        }
      } finally {
        setLoading(false)
      }
    }
    
    const selectedBox = BOX_SIZES.find(b => b.code === selectedBoxSize)
    
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <header className="bg-[#111111] p-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { setPaymentResult(null); setView("dropoff-buy") }} className="text-white">
              <ArrowLeft className="h-8 w-8" />
            </button>
            <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
              CHOOSE PAYMENT METHOD
            </h1>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex flex-col p-6">
          <Card className="max-w-md mx-auto w-full shadow-lg">
            <CardContent className="p-6">
              {/* Amount Summary */}
              <div className="text-center mb-6">
                <p className="text-gray-600 mb-2">Total Amount</p>
                <p className="text-4xl font-bold text-[#111111]">
                  JMD ${selectedBox?.price || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedBoxSize} Box - 7 days storage
                </p>
              </div>

              {/* Payment Options - only show if no QR code yet */}
              {!paymentResult?.success && (
                <div className="space-y-4">
                  {/* Option 1: Pay on this device */}
                  <button
                    onClick={handlePayHere}
                    disabled={loading}
                    className="w-full p-6 bg-[#FFD439] rounded-xl text-left hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-[#111111] flex items-center justify-center">
                        <CreditCard className="h-7 w-7 text-[#FFD439]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xl font-bold text-[#111111] uppercase">PAY HERE</p>
                        <p className="text-sm text-gray-700">Continue payment on this device</p>
                      </div>
                      {loading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-[#111111]" />
                      ) : (
                        <ArrowLeft className="h-6 w-6 text-[#111111] rotate-180" />
                      )}
                    </div>
                  </button>

                  {/* Option 2: Pay on another device via QR */}
                  <button
                    onClick={handlePayOnPhone}
                    disabled={loading}
                    className="w-full p-6 bg-white border-2 border-gray-200 rounded-xl text-left hover:border-[#FFD439] active:scale-95 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                        <QrCode className="h-7 w-7 text-[#111111]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xl font-bold text-[#111111] uppercase">PAY ON YOUR PHONE</p>
                        <p className="text-sm text-gray-500">Scan QR code with another device</p>
                      </div>
                      {loading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      ) : (
                        <ArrowLeft className="h-6 w-6 text-gray-400 rotate-180" />
                      )}
                    </div>
                  </button>
                </div>
              )}

              {/* Show QR Code if payment created */}
              {paymentResult?.success && paymentResult.qrCodeDataUrl && (
                <div className="mt-6 text-center">
                  <div className="bg-gray-50 rounded-xl p-6">
                    <p className="text-lg font-bold mb-4">Scan to Pay</p>
                    <img 
                      src={paymentResult.qrCodeDataUrl} 
                      alt="Payment QR Code" 
                      className="mx-auto w-64 h-64 rounded-lg"
                    />
                    <p className="text-sm text-gray-500 mt-4">
                      Scan with your phone camera to complete payment
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Loader2 className="h-5 w-5 animate-spin text-[#FFD439]" />
                      <span className="text-gray-600">Waiting for payment...</span>
                    </div>
                    
                    {/* Cancel button */}
                    <button
                      onClick={() => { setPaymentResult(null); setLoading(false) }}
                      className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                      Cancel and go back
                    </button>
                  </div>
                </div>
              )}

              {loading && !paymentResult && (
                <div className="mt-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#FFD439]" />
                  <p className="mt-2 text-gray-600">Preparing payment...</p>
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // Render courier login
  const renderCourierLogin = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={() => {
            if (courierLoginStep === "pin") {
              setCourierLoginStep("phone")
              setCourierPin("")
              setError(null)
            } else {
              setView("dropoff")
            }
          }} className="text-white">
            <ArrowLeft className="h-8 w-8" />
          </button>
          <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
            COURIER LOGIN
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <Truck className="h-16 w-16 mx-auto text-[#FFD439] mb-4" />
              {courierLoginStep === "phone" ? (
                <p className="text-gray-600">Enter your phone number</p>
              ) : (
                <p className="text-gray-600">Enter your 4-digit PIN</p>
              )}
            </div>

            {courierLoginStep === "phone" ? (
              <>
                {renderKeypad(courierPhone, setCourierPhone, 10)}
                <button
                  onClick={handleCourierPhoneSubmit}
                  disabled={loading || courierPhone.length < 10}
                  className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : (
                    "CONTINUE"
                  )}
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-sm text-gray-500 mb-4">
                  Phone: {courierPhone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}
                </p>
                {renderKeypad(courierPin, setCourierPin, 4)}
                <button
                  onClick={handleCourierLogin}
                  disabled={loading || courierPin.length !== 4}
                  className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : (
                    "LOGIN"
                  )}
                </button>
              </>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render courier dashboard
  const renderCourierDashboard = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={resetState} className="text-white">
              <ArrowLeft className="h-8 w-8" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
                COURIER DASHBOARD
              </h1>
              <p className="text-sm text-gray-400">{courierSession?.name}</p>
            </div>
          </div>
          <Badge className="bg-[#FFD439] text-[#111111] text-lg px-4 py-2">
            Balance: JMD ${(courierSession?.balance || 0).toLocaleString()}
          </Badge>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
            {/* Sender name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sender Name (Optional)
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Courier Company"
                className="w-full h-14 px-4 rounded-xl border-2 border-gray-200 focus:border-[#FFD439] outline-none text-lg"
              />
            </div>

            {/* Box size selection */}
            <p className="text-center text-gray-600 mb-4">Select Box Size</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {BOX_SIZES.map((box) => (
                <button
                  key={box.code}
                  onClick={() => setSelectedBoxSize(box.code)}
                  className={`p-4 rounded-xl text-left transition-all ${
                    selectedBoxSize === box.code
                      ? "bg-[#FFD439] text-[#111111]"
                      : "bg-white border-2 border-gray-200 hover:border-[#FFD439]"
                  }`}
                >
                  <div className="font-bold text-lg uppercase">{box.code} - ${box.price}</div>
                  <div className="text-sm opacity-70">{box.description}</div>
                </button>
              ))}
            </div>

            {/* Recipient phone */}
            <p className="text-center text-gray-600 mb-4">Recipient Phone Number</p>
            {renderKeypad(phoneNumber, setPhoneNumber, 10)}

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleCourierDropoff}
              disabled={loading || !selectedBoxSize || phoneNumber.length < 7}
              className="w-full mt-6 h-16 bg-[#111111] rounded-xl text-xl font-bold text-white uppercase hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              ) : (
                `DROP OFF - $${BOX_SIZES.find(b => b.code === selectedBoxSize)?.price || 0}`
              )}
            </button>
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render pickup
  const renderPickup = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={resetState} className="text-white">
            <ArrowLeft className="h-8 w-8" />
          </button>
          <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
            PICKUP
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <QrCode className="h-16 w-16 mx-auto text-[#FFD439] mb-4" />
              <p className="text-gray-600">Enter your 6-digit pickup code</p>
            </div>

            {renderKeypad(code, setCode, 6)}

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handlePickup}
              disabled={loading || code.length !== 6}
              className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              ) : (
                "FIND MY PACKAGE"
              )}
            </button>
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render payment
  const renderPayment = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={resetState} className="text-white">
            <X className="h-8 w-8" />
          </button>
          <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
            STORAGE FEE
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
            {/* Storage fee info */}
            <div className="text-center mb-6">
              <Clock className="h-16 w-16 mx-auto text-[#FFD439] mb-4" />
              <p className="text-gray-600">Storage Fee Required</p>
              <p className="text-4xl font-bold text-[#111111] mt-2">
                JMD ${orderResult?.storageFee || 0}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {orderResult?.storageDays || 0} days stored (3 days free)
              </p>
            </div>

            {paymentResult?.qrCodeDataUrl ? (
              <div className="text-center">
                <p className="text-lg font-bold mb-4">Scan to Pay</p>
                <img 
                  src={paymentResult.qrCodeDataUrl} 
                  alt="Payment QR Code" 
                  className="mx-auto w-64 h-64 rounded-lg"
                />
                <p className="text-sm text-gray-500 mt-4">
                  Waiting for payment confirmation...
                </p>
                <Loader2 className="h-6 w-6 animate-spin mx-auto mt-2 text-[#FFD439]" />
              </div>
            ) : (
              <>
                {/* Box info */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Box Number</span>
                    <span className="font-bold text-lg">#{orderResult?.boxName}</span>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleStorageFeePayment}
                  disabled={loading}
                  className="w-full h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : (
                    "PAY WITH DIMEPAY"
                  )}
                </button>

                <button
                  onClick={() => {
                    // Process with cash payment
                    handlePickup()
                  }}
                  className="w-full mt-4 h-14 bg-gray-200 rounded-xl text-lg font-bold text-[#111111] uppercase hover:bg-gray-300 active:scale-95 transition-all"
                >
                  PAY WITH CASH (STAFF)
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render success
  const renderSuccess = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg text-center">
          <CardContent className="p-8">
            <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            
            <h2 className="text-3xl font-bold text-[#111111] uppercase mb-2">
              LOCKER OPENED!
            </h2>
            
            <p className="text-gray-600 mb-6">
              Box #{orderResult?.boxName} is now open. Please {view === "dropoff-code" ? "place your package inside" : "collect your package"} and close the door.
            </p>

            {/* Order details */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Box Number</span>
                <span className="font-bold text-lg">#{orderResult?.boxName}</span>
              </div>
              {orderResult?.pickCode && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">Pickup Code</span>
                  <span className="font-bold text-lg text-[#FFD439]">{orderResult.pickCode}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Order #</span>
                <span className="font-medium">{orderResult?.orderNo}</span>
              </div>
            </div>

            {orderResult?.pickCode && (
              <p className="text-sm text-gray-500 mb-6">
                A pickup notification has been sent to the recipient.
              </p>
            )}

            <button
              onClick={resetState}
              className="w-full h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all"
            >
              DONE
            </button>
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Timeout warning banner
  const renderTimeoutWarning = () => {
    if (!showTimeoutWarning) return null
    
    return (
      <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white p-4 text-center z-50 animate-pulse">
        <p className="text-lg font-bold">
          Session will reset in <span className="text-2xl">{secondsRemaining}</span> seconds due to inactivity
        </p>
        <button
          onClick={updateActivity}
          className="mt-2 bg-white text-orange-500 px-4 py-2 rounded-lg font-bold hover:bg-orange-100 transition-colors"
        >
          Continue Session
        </button>
      </div>
    )
  }

  // Main render
  return (
    <div onClick={updateActivity} onTouchStart={updateActivity}>
      {renderTimeoutWarning()}
      
      {view === "home" && renderHome()}
      {view === "dropoff" && renderDropoffOptions()}
      {view === "dropoff-code" && renderDropoffCode()}
      {view === "dropoff-buy" && renderDropoffBuy()}
      {view === "dropoff-payment-options" && renderDropoffPaymentOptions()}
      {view === "dropoff-courier" && renderCourierLogin()}
      {view === "courier-dashboard" && renderCourierDashboard()}
      {view === "pickup" && renderPickup()}
      {view === "payment" && renderPayment()}
      {view === "success" && renderSuccess()}
    </div>
  )
}

// Wrap with kiosk error boundary for auto-recovery on white screen crashes
export default function KioskPageWithErrorBoundary() {
  return (
    <KioskErrorBoundary>
      <KioskPage />
    </KioskErrorBoundary>
  )
}
