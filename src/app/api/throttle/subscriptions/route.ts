import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { listSubscriptions } from "@/lib/throttle/subscriptions"
import { ThrottleApiError } from "@/lib/throttle"

export async function GET(req: NextRequest) {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  if (!isClerkConfigured) {
    return NextResponse.json(
      { error: { code: "auth_not_configured", message: "Auth not configured." } },
      { status: 501 }
    )
  }

  const user = await authProvider.getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Not signed in." } },
      { status: 401 }
    )
  }
  if (!user.throttleCustomerId) {
    return NextResponse.json({ subscriptions: [], nextCursor: null })
  }

  const url = new URL(req.url)
  const cursor = url.searchParams.get("cursor") ?? undefined
  const limitParam = url.searchParams.get("limit")
  const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 100) : 25

  try {
    const result = await listSubscriptions({
      customerId: user.throttleCustomerId,
      cursor,
      limit,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] list subscriptions failed:", error)
    return NextResponse.json(
      { error: { code: "list_failed", message: "Failed to list subscriptions." } },
      { status: 500 }
    )
  }
}
