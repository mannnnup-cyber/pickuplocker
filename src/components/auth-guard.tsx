"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { Loader2 } from "lucide-react"

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { authenticated, loading, checkSession } = useAuth()
  const router = useRouter()

  useEffect(() => {
    checkSession()
  }, [checkSession])

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace("/login")
    }
  }, [loading, authenticated, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-[#FFD439]" />
        <p className="mt-4 text-white">Checking authentication...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-[#FFD439]" />
        <p className="mt-4 text-white">Redirecting to login...</p>
      </div>
    )
  }

  return <>{children}</>
}
