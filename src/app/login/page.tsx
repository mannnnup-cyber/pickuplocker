"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Loader2, Lock, User } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username || !password) {
      setError("Please enter username and password")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (data.success) {
        router.push("/dashboard")
      } else {
        setError(data.error || "Invalid credentials")
      }
    } catch {
      setError("Failed to connect to server")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
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
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-md bg-white shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-[#FFD439] flex items-center justify-center">
            <Lock className="h-8 w-8 text-[#111111]" />
          </div>
          <CardTitle className="text-2xl font-bold text-[#111111] uppercase">Staff Login</CardTitle>
          <CardDescription className="text-gray-500">
            Enter your credentials to access the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <User className="h-4 w-4" />
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full h-14 px-4 rounded-xl border-2 border-gray-200 focus:border-[#FFD439] outline-none text-lg"
                autoComplete="username"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full h-14 px-4 rounded-xl border-2 border-gray-200 focus:border-[#FFD439] outline-none text-lg"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 rounded-xl flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full h-16 bg-[#FFD439] hover:bg-[#FFD439]/90 text-[#111111] font-bold text-xl uppercase rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                "LOGIN"
              )}
            </Button>
          </form>

          {/* Quick PIN Login Option */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-500 mb-4">Or login with Staff PIN</p>
            <PinLoginForm />
          </div>
        </CardContent>
      </Card>

      {/* Back to Kiosk Link */}
      <button
        onClick={() => window.location.href = "/"}
        className="mt-6 text-gray-400 hover:text-white transition-colors"
      >
        ← Back to Kiosk
      </button>
    </div>
  )
}

// PIN Login Component
function PinLoginForm() {
  const router = useRouter()
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePinLogin = async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })

      const data = await res.json()

      if (data.success) {
        router.push("/dashboard")
      } else {
        setError(data.error || "Invalid PIN")
      }
    } catch {
      setError("Failed to connect to server")
    } finally {
      setLoading(false)
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"]

  return (
    <div className="space-y-4">
      {/* PIN Display */}
      <div className="bg-gray-100 rounded-xl p-3">
        <div className="text-center text-2xl font-mono tracking-widest text-gray-800 min-h-[32px]">
          {pin.split("").map((_, i) => (
            <span key={i} className="inline-block w-5">•</span>
          ))}
          {Array(Math.max(0, 6 - pin.length)).fill(0).map((_, i) => (
            <span key={`empty-${i}`} className="inline-block w-5 text-gray-300">_</span>
          ))}
        </div>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === "clear") {
                setPin("")
              } else if (key === "backspace") {
                setPin(pin.slice(0, -1))
              } else if (pin.length < 6) {
                setPin(pin + key)
              }
            }}
            className={`
              h-12 rounded-xl text-lg font-bold transition-all active:scale-95
              ${key === "clear" || key === "backspace"
                ? "bg-gray-200 text-gray-600 hover:bg-gray-300"
                : "bg-[#111111] text-white hover:bg-gray-800"
              }
            `}
          >
            {key === "backspace" ? "⌫" : key === "clear" ? "CLR" : key}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={handlePinLogin}
        disabled={loading || pin.length < 4}
        className="w-full h-12 bg-[#111111] hover:bg-gray-800 text-white font-bold uppercase rounded-xl transition-all active:scale-95 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "LOGIN WITH PIN"
        )}
      </Button>
    </div>
  )
}
