import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// Verify admin
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

// PATCH /api/users/[id] — Update a user (change role, activate/deactivate, reset lockout)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized, user: requestor } = await verifyAdmin()
  if (!authorized || !requestor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { name, role, isActive, resetLockout, newPassword, newPin, phone } = body

    // Find the user
    const targetUser = await db.user.findUnique({ where: { id } })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Don't allow deactivating the last admin
    if (isActive === false && targetUser.role === "ADMIN") {
      const adminCount = await db.user.count({
        where: { role: "ADMIN", isActive: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot deactivate the last admin account" },
          { status: 400 }
        )
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone || null
    if (role !== undefined && ["ADMIN", "OPERATOR"].includes(role)) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive
    if (resetLockout) {
      updateData.failedLoginAttempts = 0
      updateData.lockedUntil = null
    }

    // Hash new password if provided
    if (newPassword) {
      const SALT_ROUNDS = 10
      updateData.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    }

    // Hash new PIN if provided
    if (newPin) {
      const SALT_ROUNDS = 10
      updateData.pinHash = await bcrypt.hash(newPin, SALT_ROUNDS)
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
    })

    // Activity log
    const changes = Object.keys(updateData).filter(k => k !== "passwordHash" && k !== "pinHash")
    await db.activity.create({
      data: {
        userId: targetUser.id,
        action: "USER_UPDATED",
        description: `User ${targetUser.username} updated by ${requestor.username}. Changes: ${changes.join(", ")}`,
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        hasPassword: !!updatedUser.passwordHash,
        hasPin: !!updatedUser.pinHash,
      },
    })
  } catch (error) {
    console.error("Update user error:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

// DELETE /api/users/[id] — Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized, user: requestor } = await verifyAdmin()
  if (!authorized || !requestor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    const targetUser = await db.user.findUnique({ where: { id } })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Don't allow deleting the last admin
    if (targetUser.role === "ADMIN") {
      const adminCount = await db.user.count({
        where: { role: "ADMIN", isActive: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin account" },
          { status: 400 }
        )
      }
    }

    // Don't allow self-deletion
    if (targetUser.id === requestor.userId) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      )
    }

    await db.user.delete({ where: { id } })

    // Activity log
    await db.activity.create({
      data: {
        action: "USER_DELETED",
        description: `User ${targetUser.username} (${targetUser.role}) deleted by ${requestor.username}`,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete user error:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
