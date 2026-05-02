"use client"

import React, { useState, useEffect, Suspense, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Shield, Check, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"

// Separate component for PIN input to properly use hooks
function PinInput({ 
  value, 
  onChange, 
  showPin 
}: { 
  value: string
  onChange: (val: string) => void
  showPin: boolean 
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleBoxClick = () => {
    inputRef.current?.focus()
  }

  return (
    <div className="flex justify-center gap-3 mb-6 relative">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          onClick={handleBoxClick}
          className="w-14 h-14 border-2 rounded-xl flex items-center justify-center text-2xl font-bold bg-gray-50 cursor-pointer hover:border-[#FFD439] transition-colors"
        >
          {value[i] ? (showPin ? value[i] : '•') : ''}
        </div>
      ))}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="absolute opacity-0 w-full h-full top-0 left-0"
        autoFocus
      />
    </div>
  )
}

function CourierPinSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const courierIdParam = searchParams.get('courierId')

  const [step, setStep] = useState<'phone' | 'temp-pin' | 'new-pin' | 'confirm' | 'success'>('phone')
  const [phone, setPhone] = useState('')
  const [tempPin, setTempPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [courierInfo, setCourierInfo] = useState<{ id: string; name: string; hasTempPin: boolean } | null>(null)

  // If courierId is provided, skip to temp-pin step
  useEffect(() => {
    if (courierIdParam) {
      verifyCourier(courierIdParam)
    }
  }, [courierIdParam])

  const verifyCourier = async (id: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/courier/pin?courierId=${id}`)
      const data = await res.json()

      if (data.success) {
        setCourierInfo({ 
          id: data.courierId || id, 
          name: data.courierName || 'Courier', 
          hasTempPin: data.pinStatus.hasTempPin 
        })
        if (data.pinStatus.hasTempPin) {
          setStep('temp-pin')
        } else if (data.pinStatus.hasPin) {
          setError('PIN already set. Use the reset PIN option from your admin.')
        } else {
          setError('No temporary PIN found. Please contact admin.')
        }
      } else {
        setError(data.error || 'Courier not found')
      }
    } catch (err) {
      setError('Failed to verify courier')
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/courier/pin?phone=${encodeURIComponent(phone)}`)
      const data = await res.json()

      if (data.success) {
        setCourierInfo({ 
          id: data.courierId, 
          name: data.courierName || 'Courier', 
          hasTempPin: data.pinStatus.hasTempPin 
        })
        if (data.pinStatus.hasTempPin) {
          setStep('temp-pin')
        } else if (data.pinStatus.hasPin) {
          setError('PIN already set. Use the reset PIN option from your admin.')
        } else {
          setError('No temporary PIN found. Please contact admin to get your temporary PIN.')
        }
      } else {
        setError(data.error || 'Courier not found')
      }
    } catch (err) {
      setError('Failed to verify phone number')
    } finally {
      setLoading(false)
    }
  }

  const handleTempPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (tempPin.length !== 4) {
      setError('Please enter 4 digits')
      return
    }

    // Verify temp PIN by attempting to set new PIN
    setStep('new-pin')
    setError('')
  }

  const handleNewPinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (newPin.length !== 4) {
      setError('PIN must be 4 digits')
      return
    }

    if (newPin === tempPin) {
      setError('New PIN cannot be the same as temporary PIN')
      return
    }

    setStep('confirm')
    setError('')
  }

  const handleConfirmPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (confirmPin !== newPin) {
      setError('PINs do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/courier/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierId: courierInfo?.id,
          tempPin,
          newPin,
          confirmPin
        })
      })

      const data = await res.json()

      if (data.success) {
        setStep('success')
      } else {
        setError(data.error || 'Failed to set PIN')
      }
    } catch (err) {
      setError('Failed to set PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#FFD439] mb-4">
            <Shield className="w-10 h-10 text-[#111111]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Courier PIN Setup</h1>
          <p className="text-gray-600 mt-2">Set your 4-digit login PIN</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Step: Phone */}
          {step === 'phone' && (
            <form onSubmit={handlePhoneSubmit}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="876-555-1234"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg mb-4 focus:ring-2 focus:ring-[#FFD439] focus:border-transparent"
              />
              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Continue'}
              </button>
            </form>
          )}

          {/* Step: Temp PIN */}
          {step === 'temp-pin' && (
            <form onSubmit={handleTempPinSubmit}>
              <div className="text-center mb-4">
                <p className="text-lg font-semibold text-gray-900">{courierInfo?.name}</p>
                <p className="text-gray-600">
                  Enter your temporary PIN
                </p>
              </div>
              <p className="text-center text-sm text-gray-500 mb-6">
                This was sent to your phone by admin
              </p>
              <PinInput value={tempPin} onChange={setTempPin} showPin={showPin} />
              <div className="flex justify-center mb-4">
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-sm text-gray-500 flex items-center gap-1"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showPin ? 'Hide' : 'Show'} PIN
                </button>
              </div>
              <button
                type="submit"
                disabled={tempPin.length !== 4}
                className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 disabled:opacity-50"
              >
                Verify
              </button>
            </form>
          )}

          {/* Step: New PIN */}
          {step === 'new-pin' && (
            <form onSubmit={handleNewPinSubmit}>
              <div className="text-center mb-4">
                <p className="text-lg font-semibold text-gray-900">{courierInfo?.name}</p>
                <p className="text-gray-600">
                  Set your new 4-digit PIN
                </p>
              </div>
              <p className="text-center text-sm text-gray-500 mb-6">
                This will be your permanent PIN for kiosk login
              </p>
              <PinInput value={newPin} onChange={setNewPin} showPin={showPin} />
              <div className="flex justify-center mb-4">
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-sm text-gray-500 flex items-center gap-1"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showPin ? 'Hide' : 'Show'} PIN
                </button>
              </div>
              <button
                type="submit"
                disabled={newPin.length !== 4}
                className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          )}

          {/* Step: Confirm PIN */}
          {step === 'confirm' && (
            <form onSubmit={handleConfirmPinSubmit}>
              <div className="text-center mb-4">
                <p className="text-lg font-semibold text-gray-900">{courierInfo?.name}</p>
                <p className="text-gray-600">
                  Confirm your PIN
                </p>
              </div>
              <p className="text-center text-sm text-gray-500 mb-6">
                Enter your new PIN again
              </p>
              <PinInput value={confirmPin} onChange={setConfirmPin} showPin={showPin} />
              <div className="flex justify-center mb-4">
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-sm text-gray-500 flex items-center gap-1"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showPin ? 'Hide' : 'Show'} PIN
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || confirmPin.length !== 4}
                className="w-full py-4 bg-[#FFD439] text-[#111111] font-bold text-lg rounded-xl hover:bg-[#FFD439]/90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Set PIN'}
              </button>
            </form>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">PIN Set Successfully!</h2>
              <p className="text-gray-600 mb-6">
                You can now login at any Pickup locker kiosk using your phone number and PIN.
              </p>
              <button
                onClick={() => router.push('/')}
                className="w-full py-4 bg-[#111111] text-white font-bold text-lg rounded-xl hover:bg-gray-800"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Help */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Need help? Contact admin at <a href="tel:8765550123" className="text-[#111111] underline">876-555-0123</a>
        </p>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#FFD439] mb-4">
            <Shield className="w-10 h-10 text-[#111111]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Courier PIN Setup</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    </div>
  )
}

export default function CourierPinSetupPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CourierPinSetupContent />
    </Suspense>
  )
}
