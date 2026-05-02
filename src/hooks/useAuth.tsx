"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface User {
  username: string
  role: string
  name: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  authenticated: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/session")
      const data = await res.json()
      
      if (data.authenticated && data.user) {
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error("Session check error:", error)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkSession()
  }, [])

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (data.success && data.user) {
        setUser(data.user)
        return { success: true }
      }
      
      return { success: false, error: data.error || "Invalid credentials" }
    } catch (error) {
      return { success: false, error: "Failed to connect to server" }
    }
  }

  const loginWithPin = async (pin: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()

      if (data.success && data.user) {
        setUser(data.user)
        return { success: true }
      }
      
      return { success: false, error: data.error || "Invalid PIN" }
    } catch (error) {
      return { success: false, error: "Failed to connect to server" }
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      setUser(null)
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authenticated: !!user,
        login,
        loginWithPin,
        logout,
        checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
