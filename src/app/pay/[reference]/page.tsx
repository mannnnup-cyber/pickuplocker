"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { CheckCircle, XCircle, Loader2, ArrowLeft, Copy, Check } from "lucide-react"
import Link from "next/link"

interface PaymentData {
  success: boolean
  data?: {
    amount: number
    currency: string
    description: string
    reference: string
    sdkConfig?: {
      clientId: string
      data: string
      test: boolean
    }
    metadata?: {
      boxSize?: string
      saveCode?: string
      customerPhone?: string
      type?: string
    }
    status?: string
    isDemo?: boolean
  }
  error?: string
}

function PaymentContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const reference = params.reference as string

  const [loading, setLoading] = useState(true)
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'success' | 'failed'>('pending')
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState(300) // 5 minutes countdown
  const [widgetLoaded, setWidgetLoaded] = useState(false)
  const [openingLocker, setOpeningLocker] = useState(false)
  const [lockerOpened, setLockerOpened] = useState(false)
  const [lockerInfo, setLockerInfo] = useState<{boxName?: string; pickCode?: string} | null>(null)

  useEffect(() => {
    const fetchPaymentData = async () => {
      try {
        console.log('[Payment Page] Fetching payment for reference:', reference)
        const res = await fetch(`/api/payment/sdk?reference=${reference}`)
        const data = await res.json()
        console.log('[Payment Page] Payment data response:', data)
        setPaymentData(data)

        if (!data.success) {
          setError(data.error || 'Failed to load payment')
        } else if (data.data?.status === 'COMPLETED') {
          setPaymentStatus('success')
        }
      } catch (err) {
        console.error('[Payment Page] Error fetching payment:', err)
        setError("Failed to load payment data")
      } finally {
        setLoading(false)
      }
    }

    if (reference) {
      fetchPaymentData()
    }
  }, [reference])

  // Initialize DimePay widget when data is loaded
  useEffect(() => {
    if (loading || !paymentData?.success || !paymentData?.data?.sdkConfig || paymentStatus !== 'pending') return
    
    const sdkConfig = paymentData.data.sdkConfig
    
    // Only initialize if we have valid SDK config
    if (!sdkConfig.clientId || !sdkConfig.data) {
      console.log('[Payment Page] No valid SDK config, using demo mode')
      return
    }

    // Dynamically load DimePay SDK
    const loadDimePaySDK = async () => {
      try {
        // Check if SDK already loaded
        if (typeof window !== 'undefined' && (window as unknown as { initPayment?: unknown }).initPayment) {
          initializeWidget()
          return
        }

        // Load SDK from CDN
        const script = document.createElement('script')
        script.type = 'module'
        script.textContent = `
          import { initPayment } from 'https://unpkg.com/@dimepay/web-sdk@1.0.15/dist/dimepay.es.js';
          window.dimePayInit = initPayment;
          window.dispatchEvent(new Event('dimepay-ready'));
        `
        document.head.appendChild(script)

        // Wait for SDK to be ready
        window.addEventListener('dimepay-ready', initializeWidget, { once: true })
      } catch (err) {
        console.error('[Payment Page] Failed to load DimePay SDK:', err)
      }
    }

    const initializeWidget = () => {
      const initPayment = (window as unknown as { dimePayInit?: (config: unknown) => void }).dimePayInit
      if (!initPayment) {
        console.error('[Payment Page] initPayment not available')
        return
      }

      console.log('[Payment Page] Initializing DimePay widget...')

      initPayment({
        mountId: "dimepay-widget",
        total: paymentData.data!.amount, // Amount is already in dollars
        currency: paymentData.data!.currency || "JMD",
        test: sdkConfig.test,
        order_id: reference,
        client_id: sdkConfig.clientId,
        origin: window.location.origin,
        data: sdkConfig.data,
        styles: {
          primaryColor: '#111111',
          buttonColor: '#FFD439',
          buttonTextColor: '#111111',
          backgroundColor: '#FFFFFF',
          noBorderRadius: false,
        },
        onReady: () => {
          console.log('[Payment Page] DimePay widget ready')
          setWidgetLoaded(true)
        },
        onSuccess: async (data: unknown) => {
          console.log('[Payment Page] Payment success:', data)
          
          // Notify server that payment completed
          try {
            await fetch(`/api/payment/sdk?reference=${reference}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'completed', data }),
            })
            console.log('[Payment Page] Server notified of payment completion')
          } catch (err) {
            console.error('[Payment Page] Failed to notify server:', err)
          }
          
          setPaymentStatus('success')
        },
        onFailed: async (err: unknown) => {
          console.log('[Payment Page] Payment failed:', err)
          
          // Notify server that payment failed
          try {
            await fetch(`/api/payment/sdk?reference=${reference}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'failed', error: err }),
            })
          } catch (notifyErr) {
            console.error('[Payment Page] Failed to notify server:', notifyErr)
          }
          
          setPaymentStatus('failed')
        },
        onError: (err: unknown) => {
          console.error('[Payment Page] Payment error:', err)
          setError('Payment widget error. Please try again.')
        },
        onCancel: () => {
          console.log('[Payment Page] Payment cancelled')
        },
        onLoading: () => {
          console.log('[Payment Page] Widget loading...')
        },
      })
    }

    loadDimePaySDK()
  }, [loading, paymentData, reference, paymentStatus])

  // Countdown timer
  useEffect(() => {
    if (paymentStatus !== 'pending') return
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setError('Payment session expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [paymentStatus])

  // Check for status in URL params
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success') {
      setPaymentStatus('success')
    } else if (status === 'failed') {
      setPaymentStatus('failed')
    }
  }, [searchParams])

  const handleDemoPayment = async () => {
    setPaymentStatus('processing')
    
    // Simulate payment processing
    setTimeout(() => {
      setPaymentStatus('success')
    }, 2000)
  }

  const copyReference = () => {
    navigator.clipboard.writeText(reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleOpenLocker = async () => {
    if (!paymentData?.data?.metadata?.saveCode) {
      setError('No save code available')
      return
    }

    setOpeningLocker(true)
    setError(null)

    try {
      const res = await fetch('/api/kiosk/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open_box_after_payment',
          saveCode: paymentData.data.metadata.saveCode,
          recipientPhone: paymentData.data.metadata.customerPhone,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setLockerOpened(true)
        setLockerInfo({
          boxName: data.boxName,
          pickCode: data.pickCode,
        })
      } else {
        setError(data.error || 'Failed to open locker')
      }
    } catch (err) {
      console.error('Failed to open locker:', err)
      setError('Failed to connect to locker. Please try at the kiosk.')
    } finally {
      setOpeningLocker(false)
    }
  }

  // Auto-redirect countdown for success screen
  const [redirectCountdown, setRedirectCountdown] = useState(15)
  
  useEffect(() => {
    if (paymentStatus !== 'success') return
    
    const timer = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev <= 1) {
          window.location.href = '/'
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [paymentStatus])

  // Success screen - Locker Opened
  if (paymentStatus === 'success' && lockerOpened) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Locker Opened!</h1>
          <p className="text-gray-600 mb-4">
            Box #{lockerInfo?.boxName} is now open. Place your package inside and close the door.
          </p>

          {lockerInfo?.pickCode && (
            <div className="bg-[#FFD439] rounded-xl p-4 mb-4">
              <p className="text-sm text-gray-700 mb-1">Your Pickup Code:</p>
              <p className="text-3xl font-bold text-[#111111]">{lockerInfo.pickCode}</p>
              <p className="text-xs text-gray-600 mt-2">
                Share this code with the recipient to pick up the package
              </p>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-gray-800 font-bold text-sm mb-2">📦 INSTRUCTIONS:</p>
            <ol className="text-gray-600 text-sm space-y-1 list-decimal list-inside">
              <li>Place your package inside locker #{lockerInfo?.boxName}</li>
              <li>Close the door firmly</li>
              <li>The recipient will receive a pickup notification</li>
            </ol>
          </div>
          
          <Link href="/" className="block w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90">
            Done - Return to Home
          </Link>
        </div>
      </div>
    )
  }

  // Success screen
  if (paymentStatus === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-gray-600 mb-4">
            Your payment of {paymentData?.data?.currency || 'JMD'} ${paymentData?.data?.amount || 0} has been processed.
          </p>
          {paymentData?.data?.metadata?.saveCode && (
            <div className="bg-[#FFD439] rounded-xl p-4 mb-4">
              <p className="text-sm text-gray-700 mb-1">Your Save Code:</p>
              <p className="text-3xl font-bold text-[#111111]">{paymentData.data.metadata.saveCode}</p>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(paymentData.data!.metadata!.saveCode!)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="mt-2 text-xs underline text-gray-600 hover:text-gray-800"
              >
                {copied ? 'Copied!' : 'Tap to copy'}
              </button>
            </div>
          )}
          
          {/* Open Locker Button */}
          <button
            onClick={handleOpenLocker}
            disabled={openingLocker}
            className="w-full py-4 bg-green-500 text-white font-bold text-xl rounded-xl hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50 mb-4"
          >
            {openingLocker ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                Opening Locker...
              </span>
            ) : (
              '📦 OPEN LOCKER NOW'
            )}
          </button>
          
          <p className="text-xs text-gray-400 mb-4">
            Tap to open a locker immediately, or use your save code at any Pickup locker
          </p>

          <div className="bg-gray-50 rounded-xl p-3 mb-4">
            <p className="text-gray-600 text-sm">
              Or return to kiosk in <span className="font-bold text-[#111111]">{redirectCountdown}</span> seconds...
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-[#FFD439] h-2 rounded-full transition-all" 
                style={{ width: `${(redirectCountdown / 15) * 100}%` }}
              />
            </div>
          </div>
          
          <Link href="/" className="text-[#FFD439] font-semibold hover:underline text-lg">
            Return to Kiosk Now →
          </Link>
        </div>
      </div>
    )
  }

  // Processing screen
  if (paymentStatus === 'processing') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#FFD439] mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Processing Payment...</h1>
          <p className="text-gray-600">
            Please wait while we confirm your payment. Do not close this page.
          </p>
        </div>
      </div>
    )
  }

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#FFD439]" />
        <p className="mt-4 text-gray-600">Loading payment...</p>
      </div>
    )
  }

  // Error screen
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-[#FFD439] text-gray-900 font-bold rounded-xl hover:bg-[#FFD439]/90"
            >
              Try Again
            </button>
            <Link href="/" className="block text-[#FFD439] font-semibold hover:underline">
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Determine if this has valid SDK config for real payment
  const hasValidSDKConfig = paymentData?.data?.sdkConfig?.clientId && paymentData?.data?.sdkConfig?.data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#111111] p-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-white">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-lg font-bold text-white">
            Complete Payment
          </h1>
        </div>
      </header>

      {/* Payment Info */}
      <main className="p-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md mx-auto">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FFD439] mb-4">
              <span className="text-2xl font-bold text-[#111111]">P</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {paymentData?.data?.description || "Drop-off Credit"}
            </h2>
            <p className="text-4xl font-bold text-[#111111]">
              {paymentData?.data?.currency || "JMD"} ${paymentData?.data?.amount || 0}
            </p>
          </div>

          {/* Countdown Timer */}
          <div className="bg-gray-100 rounded-xl p-3 mb-4 text-center">
            <p className="text-sm text-gray-600">Time remaining</p>
            <p className="text-2xl font-bold text-gray-900">{formatTime(countdown)}</p>
          </div>

          {/* Box Info */}
          {paymentData?.data?.metadata?.boxSize && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Box Size</span>
                <span className="font-bold text-lg">{paymentData.data.metadata.boxSize}</span>
              </div>
            </div>
          )}

          {/* Reference */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Reference</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{reference}</span>
                <button onClick={copyReference} className="text-gray-400 hover:text-gray-600">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Real Payment Widget OR Demo Mode */}
          {hasValidSDKConfig ? (
            <>
              {/* DimePay Widget Container */}
              <div className="mb-4">
                {!widgetLoaded && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-[#FFD439]" />
                    <span className="ml-2 text-gray-600">Loading payment form...</span>
                  </div>
                )}
                <div 
                  id="dimepay-widget" 
                  className={widgetLoaded ? '' : 'hidden'}
                  style={{ minHeight: widgetLoaded ? '300px' : '0' }}
                />
              </div>
              
              <p className="text-center text-gray-500 text-sm mt-4">
                Secure payment powered by DimePay
              </p>
            </>
          ) : (
            <>
              {/* Demo Mode Fallback */}
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                <p className="text-orange-800 text-sm font-medium">
                  🎮 DEMO MODE
                </p>
                <p className="text-orange-600 text-xs mt-1">
                  Payment gateway not fully configured. Click below to simulate success.
                </p>
              </div>
              <button
                onClick={handleDemoPayment}
                className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 active:scale-95 transition-all"
              >
                Complete Payment
              </button>
              <p className="text-center text-gray-500 text-sm mt-4">
                Secure payment powered by Pickup
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#FFD439]" />
        <p className="mt-4 text-gray-600">Loading payment...</p>
      </div>
    }>
      <PaymentContent />
    </Suspense>
  )
}
