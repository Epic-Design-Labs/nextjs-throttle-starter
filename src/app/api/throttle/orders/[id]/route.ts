import { NextResponse, type NextRequest } from "next/server"
import { ThrottleApiError, getOrder } from "@/lib/throttle"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { requireUuid } from "@/lib/http/validate"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }

  if (!isClerkConfigured) {
    return NextResponse.json(
      {
        error: {
          code: "auth_not_configured",
          message:
            "Cannot read orders without a configured auth provider. Add CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to .env.local.",
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

  const { id: rawId } = await params
  const id = requireUuid(rawId, "orderId")
  if (id instanceof NextResponse) return id

  try {
    const order = await getOrder(id)
    // Ownership check — never return an order whose customer doesn't
    // match the authenticated user. Falls back to the externalId
    // metadata when the live record lacks a customerId (older orders).
    const orderCustomerId = (order as { customerId?: string | null }).customerId
    if (
      user.throttleCustomerId &&
      orderCustomerId &&
      orderCustomerId !== user.throttleCustomerId
    ) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Order does not belong to this account." } },
        { status: 403 }
      )
    }
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] get order failed:", error)
    return NextResponse.json(
      { error: { code: "get_failed", message: "Failed to load order." } },
      { status: 500 }
    )
  }
}
