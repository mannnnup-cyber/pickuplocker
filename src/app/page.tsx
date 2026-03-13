"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
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
  RefreshCw
} from "lucide-react"

// Types
type View = 
  | "home" 
  | "dropoff" 
  | "dropoff-code" 
  | "dropoff-buy" 
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
}

// Box sizes with prices
const BOX_SIZES = [
  { code: 'S', name: 'Small', price: 150, description: 'Phones, letters, small items' },
  { code: 'M', name: 'Medium', price: 200, description: 'Shoes, books, clothing' },
  { code: 'L', name: 'Large', price: 300, description: 'Larger packages' },
  { code: 'XL', name: 'Extra Large', price: 400, description: 'Bulky items' },
]

// Auto-timeout duration (60 seconds)
const AUTO_TIMEOUT_MS = 60000

export default function KioskPage() {
  // View state
  const [view, setView] = useState<View>("home")
  
  // Form states
  const [code, setCode] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [courierPin, setCourierPin] = useState("")
  const [selectedBoxSize, setSelectedBoxSize] = useState<string>("")
  const [senderName, setSenderName] = useState("")
  
  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Result data
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null)
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null)
  
  // Auto-timeout
  const [lastActivity, setLastActivity] = useState(Date.now())
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

  // Reset all state
  const resetState = useCallback(() => {
    setView("home")
    setCode("")
    setPhoneNumber("")
    setCourierPin("")
    setSelectedBoxSize("")
    setSenderName("")
    setLoading(false)
    setError(null)
    setOrderResult(null)
    setPaymentResult(null)
    setShowTimeoutWarning(false)
  }, [])

  // Update last activity time
  const updateActivity = useCallback(() => {
    setLastActivity(Date.now())
    setShowTimeoutWarning(false)
  }, [])

  // Auto-timeout effect
  useEffect(() => {
    const checkTimeout = () => {
      const elapsed = Date.now() - lastActivity
      const remaining = AUTO_TIMEOUT_MS - elapsed
      
      if (remaining <= 10000 && remaining > 0 && !showTimeoutWarning) {
        setShowTimeoutWarning(true)
      }
      
      if (elapsed >= AUTO_TIMEOUT_MS && view !== "home") {
        resetState()
      }
    }

    const interval = setInterval(checkTimeout, 1000)
    return () => clearInterval(interval)
  }, [lastActivity, view, showTimeoutWarning, resetState])

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
      const res = await fetch("/api/kiosk/use-code", {
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
    } catch {
      setError("Failed to connect to server. Please try again.")
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
      const res = await fetch("/api/kiosk/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_dropoff_payment",
          boxSize: selectedBoxSize,
          phone: phoneNumber,
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
    } catch {
      setError("Failed to connect to server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Poll payment status
  const pollPaymentStatus = async (paymentId: string) => {
    const maxAttempts = 60 // 5 minutes at 5 second intervals
    let attempts = 0

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError("Payment timeout. Please try again.")
        return
      }

      attempts++

      try {
        const res = await fetch(`/api/kiosk/payment?paymentId=${paymentId}`)
        const data = await res.json()

        if (data.status === "completed") {
          setCode(data.saveCode || "")
          setView("dropoff-code")
          return
        }

        if (data.status === "failed") {
          setError("Payment failed. Please try again.")
          return
        }

        // Continue polling
        setTimeout(poll, 5000)
      } catch {
        // Continue polling on error
        setTimeout(poll, 5000)
      }
    }

    poll()
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
      const res = await fetch("/api/kiosk/use-code", {
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
    } catch {
      setError("Failed to connect to server. Please try again.")
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
      const res = await fetch("/api/kiosk/payment", {
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
        // Start polling for payment
        const pollStoragePayment = async (paymentId: string) => {
          const maxAttempts = 60
          let attempts = 0

          const poll = async () => {
            if (attempts >= maxAttempts) {
              setError("Payment timeout. Please try again.")
              return
            }

            attempts++

            try {
              const res = await fetch(`/api/kiosk/payment?paymentId=${paymentId}`)
              const pollData = await res.json()

              if (pollData.status === "completed") {
                // Payment successful, now process pickup
                const pickupRes = await fetch("/api/kiosk/use-code", {
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

              setTimeout(poll, 5000)
            } catch {
              setTimeout(poll, 5000)
            }
          }

          poll()
        }

        pollStoragePayment(data.paymentId)
      } else {
        setError(data.error || "Failed to create payment")
      }
    } catch {
      setError("Failed to connect to server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Handle courier login
  const handleCourierLogin = async () => {
    if (courierPin.length < 4) {
      setError("Please enter a valid PIN")
      return
    }

    setLoading(true)
    setError(null)

    // For demo, accept any 4+ digit PIN
    if (courierPin.length >= 4) {
      setView("courier-dashboard")
    } else {
      setError("Invalid PIN")
    }
    setLoading(false)
  }

  // Handle courier drop-off
  const handleCourierDropoff = async () => {
    if (!selectedBoxSize || !phoneNumber) {
      setError("Please select a box size and enter phone number")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/kiosk/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_order",
          boxSize: selectedBoxSize,
          recipientPhone: phoneNumber,
          senderName: senderName || undefined,
          courierId: "courier-demo", // Demo courier
          courierPin,
        }),
      })
      const data = await res.json()
      setOrderResult(data)

      if (data.success) {
        setView("success")
      } else {
        setError(data.error || "Failed to create order")
      }
    } catch {
      setError("Failed to connect to server. Please try again.")
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
            className="h-16 w-16 object-contain"
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
            ENTER DROP-OFF CODE
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6">
        <Card className="max-w-md mx-auto w-full shadow-lg">
          <CardContent className="p-6">
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

            {/* Phone number */}
            <p className="text-center text-gray-600 mb-4">Enter Phone Number</p>
            {renderKeypad(phoneNumber, setPhoneNumber, 10)}

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {paymentResult?.qrCodeDataUrl && (
              <div className="mt-6 text-center">
                <p className="text-lg font-bold mb-4">Scan to Pay JMD ${paymentResult.amount}</p>
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
            )}

            {!paymentResult && (
              <button
                onClick={handleDropoffPayment}
                disabled={loading || !selectedBoxSize || phoneNumber.length < 7}
                className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                ) : (
                  `PAY $${BOX_SIZES.find(b => b.code === selectedBoxSize)?.price || 0} JMD`
                )}
              </button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )

  // Render courier login
  const renderCourierLogin = () => (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#111111] p-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setView("dropoff")} className="text-white">
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
              <p className="text-gray-600">Enter your courier PIN</p>
            </div>

            {renderKeypad(courierPin, setCourierPin, 6)}

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleCourierLogin}
              disabled={loading || courierPin.length < 4}
              className="w-full mt-6 h-16 bg-[#FFD439] rounded-xl text-xl font-bold text-[#111111] uppercase hover:bg-[#FFD439]/90 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              ) : (
                "LOGIN"
              )}
            </button>
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
            <button onClick={() => setView("dropoff")} className="text-white">
              <ArrowLeft className="h-8 w-8" />
            </button>
            <h1 className="text-2xl font-bold text-white uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
              COURIER DASHBOARD
            </h1>
          </div>
          <Badge className="bg-[#FFD439] text-[#111111] text-lg px-4 py-2">
            Balance: JMD $5,000
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
    const remaining = Math.ceil((AUTO_TIMEOUT_MS - (Date.now() - lastActivity)) / 1000)
    
    return (
      <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white p-4 text-center z-50">
        <p className="text-lg font-bold">
          Session will reset in {remaining} seconds due to inactivity
        </p>
        <button
          onClick={updateActivity}
          className="mt-2 bg-white text-orange-500 px-4 py-2 rounded-lg font-bold"
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
      {view === "dropoff-courier" && renderCourierLogin()}
      {view === "courier-dashboard" && renderCourierDashboard()}
      {view === "pickup" && renderPickup()}
      {view === "payment" && renderPayment()}
      {view === "success" && renderSuccess()}
    </div>
  )
}
