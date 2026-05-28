import { NextResponse, type NextRequest } from "next/server"
import { ThrottleApiError, getOrder } from "@/lib/throttle"
import { env } from "@/lib/env"

// ─────────────────────────────────────────────────────────────────────────
// ⚠️  IDOR — starter scaffolding only.
//
// This route fetches an order by id with no ownership check. Any caller
// who can guess or enumerate an order id can read its contents (line
// items, shipping address, totals).
//
// The starter ships with a client-only Zustand auth store, so there is
// no server-readable session yet. Before exposing this route publicly,
// wire a real auth provider and verify ownership before returning:
//
//   const session = await getServerSession()
//   if (!session?.user?.email) return new Response(null, { status: 401 })
//   const order = await getOrder(id)
//   if (order.shippingAddress?.email !== session.user.email) {
//     return new Response(null, { status: 403 })
//   }
//
// Until then this route is disabled outside development.
// ─────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: {
          code: "unauthenticated_route_disabled",
          message:
            "GET /api/throttle/orders/[id] is disabled in production because it does not verify ownership. Wire a real auth provider and check ownership before re-enabling.",
        },
      },
      { status: 501 }
    )
  }

  if (!env.THROTTLE_API_KEY) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }

  const { id } = await params
  try {
    const order = await getOrder(id)
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
