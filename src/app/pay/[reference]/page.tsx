"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { CheckCircle, XCircle, Loader2, ArrowLeft, ExternalLink, Copy, Check } from "lucide-react"
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
      onSuccess: string
      onClose: string
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
  const router = useRouter()
  const reference = params.reference as string

  const [loading, setLoading] = useState(true)
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'success' | 'failed'>('pending')
  const [copied, setCopied] = useState(false)

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

  // Poll for payment status
  useEffect(() => {
    if (paymentStatus !== 'processing' || !reference) return

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/sdk?reference=${reference}`)
        const data = await res.json()
        
        if (data.success && data.data?.status === 'COMPLETED') {
          setPaymentStatus('success')
          clearInterval(pollInterval)
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [paymentStatus, reference])

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

  const handleRealPayment = () => {
    if (paymentData?.data?.sdkConfig) {
      // Redirect to DimePay checkout
      const checkoutUrl = `https://checkout.dimepay.app?clientId=${paymentData.data.sdkConfig.clientId}&token=${paymentData.data.sdkConfig.data}&test=${paymentData.data.sdkConfig.test}`
      window.open(checkoutUrl, '_blank')
      setPaymentStatus('processing')
    }
  }

  const copyReference = () => {
    navigator.clipboard.writeText(reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
            Your payment has been processed successfully.
          </p>
          {paymentData?.data?.metadata?.saveCode && (
            <div className="bg-[#FFD439] rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-700 mb-1">Your Save Code:</p>
              <p className="text-3xl font-bold text-[#111111]">{paymentData.data.metadata.saveCode}</p>
            </div>
          )}
          <p className="text-gray-500 text-sm mb-6">
            Return to the kiosk to store your package.
          </p>
          <Link href="/" className="text-[#FFD439] font-semibold hover:underline">
            Return to Home
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

  // Main payment screen
  const isDemo = paymentData?.data?.isDemo || reference.toString().includes('DEMO')

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

          {/* Demo Mode Notice */}
          {isDemo && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
              <p className="text-orange-800 text-sm font-medium">
                🎮 DEMO MODE - This is a test payment
              </p>
              <p className="text-orange-600 text-xs mt-1">
                Click below to simulate a successful payment
              </p>
            </div>
          )}

          {/* Pay Button */}
          {isDemo ? (
            <button
              onClick={handleDemoPayment}
              className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 active:scale-95 transition-all"
            >
              Complete Demo Payment
            </button>
          ) : (
            <button
              onClick={handleRealPayment}
              className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>Pay with DimePay</span>
              <ExternalLink className="w-5 h-5" />
            </button>
          )}

          <p className="text-center text-gray-500 text-sm mt-4">
            Secure payment powered by DimePay
          </p>

          {/* Help text */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-gray-500 text-xs">
              Having trouble? Return to the kiosk and try again.
            </p>
          </div>
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
