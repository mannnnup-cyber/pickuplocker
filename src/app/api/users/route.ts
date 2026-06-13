import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { sendStaffInviteEmail } from "@/lib/email"

// Verify that the requesting user is an admin or operator
async function verifyAdmin(): Promise<{
  authorized: boolean
  user?: { username: string; role: string; userId?: string }
}> {
  try {
    const secret = process.env.AUTH_SECRET
    if (!secret) {
      if (process.env.NODE_ENV !== "production") {
        return { authorized: true, user: { username: "dev", role: "ADMIN" } }
      }
      return { authorized: false }
    }

    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (!token) return { authorized: false }

    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    if (payload.role !== "ADMIN" && payload.role !== "OPERATOR") {
      return { authorized: false }
    }

    return {
      authorized: true,
      user: {
        username: payload.username as string,
        role: payload.role as string,
        userId: payload.userId as string | undefined,
      },
    }
  } catch {
    return { authorized: false }
  }
}

// GET /api/users — List all staff/admin users
export async function GET() {
  const { authorized } = await verifyAdmin()
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const users = await db.user.findMany({
      where: {
        role: { in: ["ADMIN", "OPERATOR"] },
      },
      orderBy: { createdAt: "asc" },
    })

    // Strip sensitive fields, add computed fields
    const result = users.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      hasPassword: !!u.passwordHash,
      hasPin: !!u.pinHash,
      failedLoginAttempts: u.failedLoginAttempts,
      lockedUntil: u.lockedUntil,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }))

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error("List users error:", error)
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 })
  }
}

// POST /api/users — Create a new staff/admin user
export async function POST(request: NextRequest) {
  const { authorized, user: requestor } = await verifyAdmin()
  if (!authorized || !requestor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { username, name, email, password, pin, role, phone, sendInvite } = body

    // Validate required fields
    if (!username || !name || !email) {
      return NextResponse.json(
        { error: "Username, name, and email are required" },
        { status: 400 }
      )
    }

    if (!role || !["ADMIN", "OPERATOR"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be ADMIN or OPERATOR" },
        { status: 400 }
      )
    }

    if (!password && !pin) {
      return NextResponse.json(
        { error: "Either a password or PIN must be provided" },
        { status: 400 }
      )
    }

    // Check for existing username or email
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { username },
          { email },
        ],
      },
    })

    if (existing) {
      const field = existing.username === username ? "Username" : "Email"
      return NextResponse.json(
        { error: `${field} already exists` },
        { status: 409 }
      )
    }

    // Hash credentials
    const SALT_ROUNDS = 10
    const passwordHash = password ? await bcrypt.hash(password, SALT_ROUNDS) : null
    const pinHash = pin ? await bcrypt.hash(pin, SALT_ROUNDS) : null

    // Create user
    const newUser = await db.user.create({
      data: {
        username,
        name,
        email,
        phone: phone || null,
        passwordHash,
        pinHash,
        role,
        isActive: true,
      },
    })

    // Create activity log
    await db.activity.create({
      data: {
        userId: newUser.id,
        action: "USER_CREATED",
        description: `User ${username} (${role}) created by ${requestor.username}`,
      },
    })

    // Send invite email if requested
    let inviteSent = false
    if (sendInvite && email) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : 'https://pickupja.com'
        const loginUrl = `${baseUrl}/login`
        const result = await sendStaffInviteEmail(email, name || username, username, role, loginUrl)
        inviteSent = result.success
        if (!result.success) {
          console.error('Failed to send invite email:', result.error)
        }
      } catch (emailError) {
        console.error('Failed to send invite email:', emailError)
      }
    }

    return NextResponse.json({
      success: true,
      inviteSent,
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        hasPassword: !!passwordHash,
        hasPin: !!pinHash,
      },
    })
  } catch (error) {
    console.error("Create user error:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}
