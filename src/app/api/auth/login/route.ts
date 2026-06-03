import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { SignJWT } from "jose"

// Get secret key for JWT signing
// Falls back to a development-only key with a console warning
function getSecretKey() {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET environment variable is required in production")
    }
    console.warn(
      "⚠️ AUTH_SECRET not set — using development fallback. " +
      "Set AUTH_SECRET in your environment for production!"
    )
    return new TextEncoder().encode("dev-only-secret-key-change-in-production-please")
  }
  return new TextEncoder().encode(secret)
}

// Admin credentials from environment variables
// Falls back to default admin account in development mode
interface AdminUser {
  username: string
  password: string
  role: string
}

interface StaffPin {
  pin: string
  name: string
  role: string
}

function getAdminUsers(): AdminUser[] {
  const admins: AdminUser[] = []

  // Primary admin
  const adminUser = process.env.ADMIN_USERNAME || "admin"
  const adminPass = process.env.ADMIN_PASSWORD
  if (adminPass) {
    admins.push({ username: adminUser, password: adminPass, role: "ADMIN" })
  } else if (process.env.NODE_ENV !== "production") {
    // Development fallback: default admin password
    console.warn(
      "⚠️ ADMIN_PASSWORD not set — using development default. " +
      "Set ADMIN_PASSWORD in your environment for production!"
    )
    admins.push({ username: "admin", password: "pickup2024", role: "ADMIN" })
  }

  // Operator
  const opUser = process.env.OPERATOR_USERNAME
  const opPass = process.env.OPERATOR_PASSWORD
  if (opUser && opPass) {
    admins.push({ username: opUser, password: opPass, role: "OPERATOR" })
  }

  return admins
}

function getStaffPins(): StaffPin[] {
  const pins: StaffPin[] = []

  // Support multiple staff PINs via STAFF_PIN_1, STAFF_PIN_2, etc.
  for (let i = 1; i <= 10; i++) {
    const pin = process.env[`STAFF_PIN_${i}`]
    const name = process.env[`STAFF_PIN_${i}_NAME`]
    const role = process.env[`STAFF_PIN_${i}_ROLE`]
    if (pin && name) {
      pins.push({ pin, name, role: role || "OPERATOR" })
    }
  }

  // Development fallback: default staff PINs
  if (pins.length === 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      "⚠️ No STAFF_PIN_* set — using development defaults. " +
      "Set STAFF_PIN_1/STAFF_PIN_1_NAME in your environment for production!"
    )
    pins.push({ pin: "1111", name: "Staff", role: "OPERATOR" })
    pins.push({ pin: "1234", name: "Admin", role: "ADMIN" })
  }

  return pins
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password, pin } = body

    let user: { username: string; role: string; name?: string } | null = null

    // Check PIN login
    if (pin) {
      const staffPins = getStaffPins()
      const staffPin = staffPins.find(s => s.pin === pin)
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
      const admins = getAdminUsers()
      const admin = admins.find(
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
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) {
      return NextResponse.json(
        { success: false, error: "Server configuration error — AUTH_SECRET is missing. Please set it in your environment variables." },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    )
  }
}
