import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"

// Secret key for JWT signing (in production, use environment variable)
const getSecretKey = () => {
  const secret = process.env.AUTH_SECRET || "pickup-locker-secret-key-change-in-production"
  return new TextEncoder().encode(secret)
}

// Default admin credentials (in production, store in database)
const DEFAULT_ADMINS = [
  { username: "admin", password: "Pickup@2024", role: "ADMIN" },
  { username: "operator", password: "Operator@2024", role: "OPERATOR" },
]

// Staff PINs (in production, store in database)
const STAFF_PINS = [
  { pin: "123456", name: "Staff User", role: "OPERATOR" },
  { pin: "789012", name: "Manager", role: "ADMIN" },
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password, pin } = body

    let user: { username: string; role: string; name?: string } | null = null

    // Check PIN login
    if (pin) {
      const staffPin = STAFF_PINS.find(s => s.pin === pin)
      if (staffPin) {
        user = {
          username: staffPin.name,
          role: staffPin.role,
          name: staffPin.name,
        }
      }
    }
    // Check username/password login
    else if (username && password) {
      const admin = DEFAULT_ADMINS.find(
        a => a.username === username && a.password === password
      )
      if (admin) {
        user = {
          username: admin.username,
          role: admin.role,
        }
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      )
    }

    // Create JWT token
    const token = await new SignJWT({
      username: user.username,
      role: user.role,
      name: user.name || user.username,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h") // 8 hour session
      .sign(getSecretKey())

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8, // 8 hours
      path: "/",
    })

    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        name: user.name || user.username,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    )
  }
}
