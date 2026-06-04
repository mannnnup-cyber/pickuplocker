import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { SignJWT } from "jose"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

// Get secret key for JWT signing
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

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MINUTES = 15

// ============================================
// DATABASE AUTHENTICATION (primary)
// ============================================

async function authenticateWithDatabase(
  username: string,
  password: string
): Promise<{ user: { username: string; role: string; name: string }; userId: string } | null> {
  // Find user by username OR email
  const dbUser = await db.user.findFirst({
    where: {
      OR: [
        { username },
        { email: username },
      ],
      isActive: true,
      role: { in: ["ADMIN", "OPERATOR"] },
    },
  })

  if (!dbUser || !dbUser.passwordHash) {
    return null
  }

  // Check if account is locked
  if (dbUser.lockedUntil && new Date() < dbUser.lockedUntil) {
    const remainingMinutes = Math.ceil(
      (dbUser.lockedUntil.getTime() - Date.now()) / (1000 * 60)
    )
    throw new Error(
      `Account locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`
    )
  }

  // Compare password with bcrypt hash
  const passwordMatch = await bcrypt.compare(password, dbUser.passwordHash)
  if (!passwordMatch) {
    // Increment failed attempts
    const newAttempts = dbUser.failedLoginAttempts + 1
    const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS

    await db.user.update({
      where: { id: dbUser.id },
      data: {
        failedLoginAttempts: newAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null,
      },
    })

    return null
  }

  // Successful login — reset failed attempts and update last login
  await db.user.update({
    where: { id: dbUser.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  })

  return {
    user: {
      username: dbUser.username || dbUser.email,
      role: dbUser.role,
      name: dbUser.name || dbUser.username || dbUser.email,
    },
    userId: dbUser.id,
  }
}

async function authenticatePinWithDatabase(
  pin: string
): Promise<{ user: { username: string; role: string; name: string }; userId: string } | null> {
  // Find users with PINs (staff and admins)
  const staffUsers = await db.user.findMany({
    where: {
      pinHash: { not: null },
      isActive: true,
      role: { in: ["ADMIN", "OPERATOR"] },
    },
  })

  for (const staffUser of staffUsers) {
    // Check if account is locked
    if (staffUser.lockedUntil && new Date() < staffUser.lockedUntil) {
      continue // Skip locked accounts
    }

    // Compare PIN with bcrypt hash
    const pinMatch = await bcrypt.compare(pin, staffUser.pinHash!)
    if (pinMatch) {
      // Reset failed attempts and update last login
      await db.user.update({
        where: { id: staffUser.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      })

      return {
        user: {
          username: staffUser.username || staffUser.email,
          role: staffUser.role,
          name: staffUser.name || staffUser.username || staffUser.email,
        },
        userId: staffUser.id,
      }
    }
  }

  // If we got here, no PIN matched — increment failed attempts on all staff (optional)
  // For security, we don't reveal which accounts exist, so we don't increment on all
  return null
}

// ============================================
// ENV VAR FALLBACK (for migration period)
// ============================================

interface EnvAdminUser {
  username: string
  password: string
  role: string
}

interface EnvStaffPin {
  pin: string
  name: string
  role: string
}

function getEnvAdminUsers(): EnvAdminUser[] {
  const admins: EnvAdminUser[] = []
  const adminUser = process.env.ADMIN_USERNAME || "admin"
  const adminPass = process.env.ADMIN_PASSWORD
  if (adminPass) {
    admins.push({ username: adminUser, password: adminPass, role: "ADMIN" })
  }
  const opUser = process.env.OPERATOR_USERNAME
  const opPass = process.env.OPERATOR_PASSWORD
  if (opUser && opPass) {
    admins.push({ username: opUser, password: opPass, role: "OPERATOR" })
  }
  return admins
}

function getEnvStaffPins(): EnvStaffPin[] {
  const pins: EnvStaffPin[] = []
  for (let i = 1; i <= 10; i++) {
    const pin = process.env[`STAFF_PIN_${i}`]
    const name = process.env[`STAFF_PIN_${i}_NAME`]
    const role = process.env[`STAFF_PIN_${i}_ROLE`]
    if (pin && name) {
      pins.push({ pin, name, role: role || "OPERATOR" })
    }
  }
  // Development fallback
  if (pins.length === 0 && process.env.NODE_ENV !== "production") {
    pins.push({ pin: "1111", name: "Staff", role: "OPERATOR" })
    pins.push({ pin: "1234", name: "Admin", role: "ADMIN" })
  }
  return pins
}

function authenticateWithEnvVars(
  username: string,
  password: string
): { user: { username: string; role: string; name: string } } | null {
  const admins = getEnvAdminUsers()
  const admin = admins.find(
    a => a.username === username && a.password === password
  )
  if (admin) {
    return { user: { username: admin.username, role: admin.role, name: admin.username } }
  }
  return null
}

function authenticatePinWithEnvVars(
  pin: string
): { user: { username: string; role: string; name: string } } | null {
  const pins = getEnvStaffPins()
  const staffPin = pins.find(s => s.pin === pin)
  if (staffPin) {
    return { user: { username: staffPin.name, role: staffPin.role, name: staffPin.name } }
  }
  return null
}

// ============================================
// MAIN LOGIN HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password, pin } = body

    let user: { username: string; role: string; name: string } | null = null
    let userId: string | undefined

    // ---- PIN login ----
    if (pin) {
      // Step 1: Try database authentication
      try {
        const dbResult = await authenticatePinWithDatabase(pin.trim())
        if (dbResult) {
          user = dbResult.user
          userId = dbResult.userId
        }
      } catch (dbError) {
        // DB error — log and fall through to env vars
        console.warn("[Auth] DB PIN auth failed, falling back to env vars:", 
          dbError instanceof Error ? dbError.message : dbError)
        if (dbError instanceof Error && dbError.message.includes("locked")) {
          return NextResponse.json(
            { success: false, error: dbError.message },
            { status: 403 }
          )
        }
      }

      // Step 2: Fallback to env vars if DB didn't find a match
      if (!user) {
        const envResult = authenticatePinWithEnvVars(pin.trim())
        if (envResult) {
          user = envResult.user
        }
      }
    }

    // ---- Username/Password login ----
    else if (username && password) {
      // Step 1: Try database authentication
      try {
        const dbResult = await authenticateWithDatabase(username.trim(), password)
        if (dbResult) {
          user = dbResult.user
          userId = dbResult.userId
        }
      } catch (dbError) {
        // DB error — log and fall through to env vars
        console.warn("[Auth] DB username auth failed, falling back to env vars:", 
          dbError instanceof Error ? dbError.message : dbError)
        if (dbError instanceof Error && dbError.message.includes("locked")) {
          return NextResponse.json(
            { success: false, error: dbError.message },
            { status: 403 }
          )
        }
      }

      // Step 2: Fallback to env vars if DB didn't find a match
      if (!user) {
        const envResult = authenticateWithEnvVars(username.trim(), password)
        if (envResult) {
          user = envResult.user
        }
      }
    }

    // No valid credentials provided
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
      name: user.name,
      ...(userId ? { userId } : {}),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(getSecretKey())

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    })

    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        name: user.name,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) {
      return NextResponse.json(
        { success: false, error: "Server configuration error — AUTH_SECRET is missing." },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    )
  }
}
