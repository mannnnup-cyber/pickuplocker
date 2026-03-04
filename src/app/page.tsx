"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Package, 
  Clock, 
  Shield, 
  QrCode, 
  MapPin,
  Truck,
  CheckCircle,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Banknote
} from "lucide-react"

interface PickupData {
  orderNumber: string
  trackingCode: string
  customerName: string
  deviceName?: string
  deviceLocation?: string
  boxNumber?: number
  storageDays: number
  storageFee: number
  remainingFee: number
  requiresPayment: boolean
  freePickup: boolean
  isAbandoned: boolean
  daysUntilAbandoned: number
  dropOffDate: string
}

export default function HomePage() {
  const [view, setView] = useState<"home" | "pickup" | "payment" | "success">("home")
  const [pickupCode, setPickupCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickupData, setPickupData] = useState<PickupData | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "CASH" | null>(null)

  const handlePickupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pickupCode.length !== 6) {
      setError("Please enter a valid 6-digit code")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/pickup?code=${pickupCode}`)
      const data = await res.json()

      if (!data.success) {
        setError(data.error || "Invalid pickup code")
        return
      }

      setPickupData(data.data)
      
      if (data.data.requiresPayment) {
        setView("payment")
      } else {
        // Free pickup - process immediately
        await processPickup()
      }
    } catch (err) {
      setError("Failed to verify code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const processPickup = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pickupCode,
          paymentMethod: pickupData?.requiresPayment ? paymentMethod : null,
        }),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error || "Failed to process pickup")
        return
      }

      setView("success")
    } catch (err) {
      setError("Failed to process pickup. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const resetPickup = () => {
    setView("home")
    setPickupCode("")
    setError(null)
    setPickupData(null)
    setPaymentMethod(null)
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/logo-icon.png" 
              alt="Pickup Logo" 
              className="h-14 w-14 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-[#111111] uppercase tracking-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
                PICK<span className="text-[#FFD439]">UP</span>
              </h1>
              <p className="text-xs text-gray-500">YOUR SMART LOCKER SYSTEM</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase">
                ADMIN DASHBOARD
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {view === "home" && (
        <>
          {/* Hero Section - Black Background */}
          <section className="bg-[#111111] py-20">
            <div className="container mx-auto px-4 text-center">
              <div className="inline-flex items-center gap-2 bg-[#FFD439] text-[#111111] rounded-full px-4 py-2 mb-6 font-bold text-sm uppercase">
                NOW LIVE AT UTECH CAMPUS
              </div>
              
              <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
                ORDER ONLINE.
              </h1>
              <h1 className="text-5xl md:text-6xl font-bold text-[#FFD439] mb-6 uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
                PICK UP 24/7
              </h1>
              
              <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-4">
                No waiting in lines. No missed deliveries. 
              </p>
              <p className="text-lg text-[#FFD439] mb-10 uppercase tracking-widest">
                SAFE • EASY • CONVENIENT
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
                <Button 
                  size="lg" 
                  className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 text-lg px-8 font-bold uppercase"
                  onClick={() => setView("pickup")}
                >
                  <QrCode className="mr-2 h-5 w-5" />
                  PICK UP PACKAGE
                </Button>
                <Link href="/dashboard?tab=orders">
                  <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-[#111111] text-lg px-8 font-bold uppercase bg-transparent">
                    <Package className="mr-2 h-5 w-5" />
                    DROP OFF PACKAGE
                  </Button>
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto py-8 border-t border-gray-800">
                <div className="text-center">
                  <div className="text-4xl font-bold text-[#FFD439] uppercase">24/7</div>
                  <div className="text-gray-400 uppercase text-sm">Availability</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-[#FFD439] uppercase">60</div>
                  <div className="text-gray-400 uppercase text-sm">Secure Lockers</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-[#FFD439] uppercase">&lt;30s</div>
                  <div className="text-gray-400 uppercase text-sm">Pickup Time</div>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-gray-100 py-20">
            <div className="container mx-auto px-4">
              <h2 className="text-3xl font-bold text-[#111111] text-center mb-4 uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>HOW IT WORKS</h2>
              <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">
                Simple, secure, and contactless package pickup in three easy steps
              </p>

              <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <Card className="bg-white border-0 shadow-lg">
                  <CardContent className="pt-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-[#111111]">1</span>
                    </div>
                    <h3 className="text-xl font-bold text-[#111111] mb-2 uppercase">RECEIVE CODE</h3>
                    <p className="text-gray-600">
                      Get a pickup code via SMS when your package arrives
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white border-0 shadow-lg">
                  <CardContent className="pt-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-[#111111]">2</span>
                    </div>
                    <h3 className="text-xl font-bold text-[#111111] mb-2 uppercase">VISIT LOCKER</h3>
                    <p className="text-gray-600">
                      Come to the Pickup locker at UTech Campus anytime, day or night
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-white border-0 shadow-lg">
                  <CardContent className="pt-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-[#111111]">3</span>
                    </div>
                    <h3 className="text-xl font-bold text-[#111111] mb-2 uppercase">ENTER CODE</h3>
                    <p className="text-gray-600">
                      Enter your 6-digit code - your locker opens instantly
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Storage Policy */}
          <section className="bg-[#111111] py-20">
            <div className="container mx-auto px-4">
              <h2 className="text-3xl font-bold text-white text-center mb-4 uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>STORAGE POLICY</h2>
              <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
                Transparent pricing with no hidden fees
              </p>
              
              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                <div className="text-center p-8 rounded-lg bg-[#1a1a1a]">
                  <div className="text-3xl font-bold text-[#FFD439] mb-2 uppercase">3 Days</div>
                  <div className="text-white font-bold mb-2 uppercase">FREE STORAGE</div>
                  <p className="text-gray-400 text-sm">No charge for the first 3 days</p>
                </div>
                
                <div className="text-center p-8 rounded-lg bg-[#1a1a1a]">
                  <div className="text-3xl font-bold text-[#FFD439] mb-2 uppercase">$100-200</div>
                  <div className="text-white font-bold mb-2 uppercase">DAILY FEE AFTER</div>
                  <p className="text-gray-400 text-sm">Tiered pricing for extended storage</p>
                </div>
                
                <div className="text-center p-8 rounded-lg bg-[#1a1a1a]">
                  <div className="text-3xl font-bold text-[#FFD439] mb-2 uppercase">30 Days</div>
                  <div className="text-white font-bold mb-2 uppercase">MAX STORAGE</div>
                  <p className="text-gray-400 text-sm">Items abandoned after 30 days</p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-gray-300 text-sm max-w-3xl mx-auto">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#FFD439]" />
                  Days 4-7: $100 JMD/day
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#FFD439]" />
                  Days 8-14: $150 JMD/day
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-[#FFD439]" />
                  Days 15-30: $200 JMD/day
                </div>
              </div>
            </div>
          </section>

          {/* Find Us */}
          <section className="bg-gray-100 py-20">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <div className="bg-white p-8 rounded-lg shadow-lg">
                  <h2 className="text-2xl font-bold text-[#111111] mb-6 uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>FIND US</h2>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#FFD439] flex items-center justify-center flex-shrink-0">
                        <MapPin className="h-5 w-5 text-[#111111]" />
                      </div>
                      <div>
                        <p className="text-[#111111] font-bold uppercase">UTech Campus</p>
                        <p className="text-gray-600">Kingston, Jamaica</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#FFD439] flex items-center justify-center flex-shrink-0">
                        <Clock className="h-5 w-5 text-[#111111]" />
                      </div>
                      <div>
                        <p className="text-[#111111] font-bold uppercase">Available 24 Hours</p>
                        <p className="text-gray-600">7 days a week</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-[#111111] p-8 rounded-lg shadow-lg">
                  <h3 className="text-2xl font-bold text-[#FFD439] mb-6 uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>NEED HELP?</h3>
                  <p className="text-gray-300 mb-6">
                    Scan the QR code on the locker for instant support or contact us:
                  </p>
                  <div className="space-y-3">
                    <p className="text-white">
                      <span className="text-[#FFD439] font-bold">WhatsApp:</span> 876-XXX-XXXX
                    </p>
                    <p className="text-white">
                      <span className="text-[#FFD439] font-bold">Email:</span> support@pickupja.com
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Partners */}
          <section className="bg-white py-12">
            <div className="container mx-auto px-4 text-center">
              <p className="text-gray-500 mb-4 uppercase text-sm">Powered by</p>
              <div className="flex items-center justify-center gap-6">
                <div className="text-lg font-bold text-gray-700">Dirty Hand Designs</div>
                <div className="text-[#FFD439] text-xl font-bold">+</div>
                <div className="text-lg font-bold text-gray-700">876OnTheGo</div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Pickup View */}
      {view === "pickup" && (
        <section className="bg-gray-100 min-h-[calc(100vh-80px)] py-12">
          <div className="container mx-auto px-4 max-w-md">
            <Button 
              variant="ghost" 
              className="mb-6 text-gray-600"
              onClick={resetPickup}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>

            <Card className="bg-white shadow-lg">
              <CardHeader className="text-center border-b">
                <div className="h-16 w-16 rounded-full bg-[#FFD439] flex items-center justify-center mx-auto mb-4">
                  <QrCode className="h-8 w-8 text-[#111111]" />
                </div>
                <CardTitle className="text-2xl text-[#111111] uppercase">PICK UP PACKAGE</CardTitle>
                <CardDescription>Enter your 6-digit pickup code</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handlePickupSubmit}>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-[#111111] uppercase text-sm font-bold">Pickup Code</Label>
                      <Input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        className="text-center text-2xl font-mono tracking-widest border-gray-200 mt-2"
                        value={pickupCode}
                        onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase py-6 text-lg"
                      disabled={loading || pickupCode.length !== 6}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        'Find My Package'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Payment View */}
      {view === "payment" && pickupData && (
        <section className="bg-gray-100 min-h-[calc(100vh-80px)] py-12">
          <div className="container mx-auto px-4 max-w-md">
            <Button 
              variant="ghost" 
              className="mb-6 text-gray-600"
              onClick={resetPickup}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Button>

            <Card className="bg-white shadow-lg mb-4">
              <CardHeader className="border-b">
                <CardTitle className="text-xl text-[#111111] uppercase">Package Found</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-[#111111]">{pickupData.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Location</span>
                  <span className="font-medium text-[#111111]">{pickupData.deviceName || 'Pickup Locker'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Box Number</span>
                  <span className="font-medium text-[#111111]">#{pickupData.boxNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Storage Days</span>
                  <Badge className="bg-gray-200 text-[#111111]">{pickupData.storageDays} days</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111111] shadow-lg mb-4">
              <CardContent className="pt-6 text-center">
                <p className="text-gray-400 uppercase text-sm mb-2">Storage Fee</p>
                <p className="text-4xl font-bold text-[#FFD439]">JMD ${pickupData.remainingFee}</p>
                <p className="text-gray-400 text-sm mt-2">
                  {pickupData.storageDays > 3 
                    ? `$${100} JMD/day (Days 4-7) • $${150} JMD/day (Days 8-14) • $${200} JMD/day (Days 15+)`
                    : 'Free storage period exceeded'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-xl text-[#111111] uppercase">Select Payment Method</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <Button
                  className={`w-full justify-start py-6 ${paymentMethod === 'CARD' ? 'bg-[#FFD439] text-[#111111]' : 'bg-gray-100 text-[#111111] hover:bg-gray-200'}`}
                  onClick={() => setPaymentMethod('CARD')}
                >
                  <CreditCard className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-bold uppercase">Pay with Card</div>
                    <div className="text-xs opacity-70">DimePay secure payment</div>
                  </div>
                </Button>

                <Button
                  className={`w-full justify-start py-6 ${paymentMethod === 'CASH' ? 'bg-[#FFD439] text-[#111111]' : 'bg-gray-100 text-[#111111] hover:bg-gray-200'}`}
                  onClick={() => setPaymentMethod('CASH')}
                >
                  <Banknote className="mr-3 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-bold uppercase">Pay with Cash</div>
                    <div className="text-xs opacity-70">Pay at the counter to staff</div>
                  </div>
                </Button>

                <Button
                  className="w-full bg-[#111111] text-white hover:bg-gray-800 font-bold uppercase py-6 mt-4"
                  disabled={!paymentMethod || loading}
                  onClick={processPickup}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Pay JMD $${pickupData.remainingFee} & Open Locker`
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Success View */}
      {view === "success" && pickupData && (
        <section className="bg-gray-100 min-h-[calc(100vh-80px)] py-12">
          <div className="container mx-auto px-4 max-w-md">
            <Card className="bg-white shadow-lg text-center">
              <CardContent className="pt-12 pb-8">
                <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-[#111111] uppercase mb-2">LOCKER OPENED!</h2>
                <p className="text-gray-600 mb-6">
                  Box #{pickupData.boxNumber} is now open. Please collect your package.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Box Number</p>
                      <p className="font-bold text-[#111111] text-lg">#{pickupData.boxNumber}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Storage Days</p>
                      <p className="font-bold text-[#111111] text-lg">{pickupData.storageDays}</p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mb-6">
                  A confirmation has been sent to your phone.
                </p>

                <Button
                  className="bg-[#FFD439] text-[#111111] hover:bg-[#FFD439]/90 font-bold uppercase"
                  onClick={resetPickup}
                >
                  Done
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-[#111111] py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img 
                src="/logo-icon.png" 
                alt="Pickup Logo" 
                className="h-8 w-auto object-contain"
              />
              <span className="text-gray-400">© 2025 <span className="text-white font-bold">PICK<span className="text-[#FFD439]">UP</span></span> Jamaica. All rights reserved.</span>
            </div>
            <div className="text-[#FFD439] font-bold uppercase tracking-widest">
              ORDER ONLINE. PICK UP 24/7
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
