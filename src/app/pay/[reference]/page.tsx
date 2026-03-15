"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { CheckCircle, XCircle, Loader2, ArrowLeft } from "lucide-react"
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
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failed'>('pending')

  useEffect(() => {
    const fetchPaymentData = async () => {
      try {
        const res = await fetch(`/api/payment/sdk?reference=${reference}`)
        const data = await res.json()
        setPaymentData(data)

        if (data.success && data.data?.sdkConfig) {
          // Initialize DimePay SDK
          initializeDimePay(data.data.sdkConfig)
        } else if (data.error) {
          setError(data.error)
        }
      } catch (err) {
        setError("Failed to load payment data")
      } finally {
        setLoading(false)
      }
    }

    if (reference) {
      fetchPaymentData()
    }
  }, [reference])

  const initializeDimePay = (sdkConfig: {
    clientId: string
    data: string
    test: boolean
    onSuccess: string
    onClose: string
  }) => {
    // Check if DimePay SDK is loaded
    if (typeof window !== 'undefined' && (window as any).initPayment) {
      try {
        ;(window as any).initPayment(sdkConfig)
      } catch (err) {
        console.error("Failed to initialize DimePay:", err)
        setError("Failed to initialize payment. Please try again.")
      }
    } else {
      // Wait for SDK to load
      const checkInterval = setInterval(() => {
        if ((window as any).initPayment) {
          clearInterval(checkInterval)
          try {
            ;(window as any).initPayment(sdkConfig)
          } catch (err) {
            console.error("Failed to initialize DimePay:", err)
            setError("Failed to initialize payment. Please try again.")
          }
        }
      }, 100)

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval)
        if (!(window as any).initPayment) {
          setError("Payment SDK failed to load. Please refresh the page.")
        }
      }, 10000)
    }
  }

  // Check for success/failure in URL params
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success') {
      setPaymentStatus('success')
    } else if (status === 'failed') {
      setPaymentStatus('failed')
    }
  }, [searchParams])

  if (paymentStatus === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-gray-600 mb-6">
            Your payment has been processed successfully. You can now close this page and return to the kiosk.
          </p>
          <Link href="/" className="text-[#FFD439] font-semibold hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    )
  }

  if (paymentStatus === 'failed') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h1>
          <p className="text-gray-600 mb-6">
            Your payment could not be processed. Please try again.
          </p>
          <button
            onClick={() => {
              setPaymentStatus('pending')
              if (paymentData?.data?.sdkConfig) {
                initializeDimePay(paymentData.data.sdkConfig)
              }
            }}
            className="w-full py-3 bg-[#FFD439] text-gray-900 font-bold rounded-xl hover:bg-[#FFD439]/90"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#FFD439]" />
        <p className="mt-4 text-gray-600">Loading payment...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link href="/" className="text-[#FFD439] font-semibold hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    )
  }

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
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {paymentData?.data?.description || "Drop-off Credit"}
            </h2>
            <p className="text-4xl font-bold text-[#111111]">
              {paymentData?.data?.currency || "JMD"} ${paymentData?.data?.amount || 0}
            </p>
          </div>

          <div className="text-center text-gray-600 mb-6">
            <p>The DimePay payment widget should appear shortly.</p>
            <p className="text-sm mt-2">If it doesn&apos;t appear, please refresh the page.</p>
          </div>

          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#FFD439]" />
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
