import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"

const getSecretKey = () => {
  const secret = process.env.AUTH_SECRET || "pickup-locker-secret-key-change-in-production"
  return new TextEncoder().encode(secret)
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value

    if (!token) {
      return NextResponse.json({ authenticated: false })
    }

    const { payload } = await jwtVerify(token, getSecretKey())

    return NextResponse.json({
      authenticated: true,
      user: {
        username: payload.username,
        role: payload.role,
        name: payload.name,
      },
    })
  } catch (error) {
    // Token invalid or expired
    return NextResponse.json({ authenticated: false })
  }
}
