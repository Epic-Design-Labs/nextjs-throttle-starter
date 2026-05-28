import { NextResponse, type NextRequest } from "next/server"
import { ThrottleApiError, listOrders } from "@/lib/throttle"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"

export async function GET(req: NextRequest) {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }

  // The route is gated behind clerkMiddleware (see src/middleware.ts).
  // Even so, double-check the auth context on the server so we never
  // serve another buyer's orders if middleware is mis-configured.
  if (!isClerkConfigured) {
    return NextResponse.json(
      {
        error: {
          code: "auth_not_configured",
          message:
            "Cannot list orders without a configured auth provider. Add CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to .env.local.",
        },
      },
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
    // No Throttle customer link yet — the buyer just signed up and the
    // first lookup hasn't reconciled with Throttle. Surface empty list
    // instead of erroring; the next refresh will populate.
    return NextResponse.json({ orders: [], nextCursor: null })
  }

  const url = new URL(req.url)
  const cursor = url.searchParams.get("cursor") ?? undefined
  const limitParam = url.searchParams.get("limit")
  const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 100) : 25

  try {
    const result = await listOrders({
      customerId: user.throttleCustomerId,
      limit,
      cursor,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] list orders failed:", error)
    return NextResponse.json(
      { error: { code: "list_failed", message: "Failed to list orders." } },
      { status: 500 }
    )
  }
}
