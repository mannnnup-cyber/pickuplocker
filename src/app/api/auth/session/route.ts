import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"

const getSecretKey = () => {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET environment variable is required in production")
    }
    return new TextEncoder().encode("dev-only-secret-key-change-in-production-please")
  }
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
