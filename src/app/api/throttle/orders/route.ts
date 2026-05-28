import { NextResponse, type NextRequest } from "next/server"
import { ThrottleApiError, listOrders } from "@/lib/throttle"
import { env } from "@/lib/env"

// ─────────────────────────────────────────────────────────────────────────
// ⚠️  IDOR — starter scaffolding only.
//
// This route accepts the buyer's email/customerId from the query string
// and returns whatever orders match. A malicious caller can enumerate any
// buyer's order history.
//
// The starter ships with a client-only Zustand auth store (see
// `src/store/auth.ts`), so there is no server-readable session yet.
// Before exposing this route publicly, wire a real auth provider
// (Clerk, Auth0, Better-Auth, etc.) and derive the email server-side:
//
//   const session = await getServerSession()
//   if (!session?.user?.email) return new Response(null, { status: 401 })
//   const result = await listOrders({ email: session.user.email, ... })
//
// Until then this route is disabled outside development.
// ─────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: {
          code: "unauthenticated_route_disabled",
          message:
            "GET /api/throttle/orders is disabled in production because it does not authenticate the caller. Wire a real auth provider and derive the email server-side before re-enabling.",
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

  const url = new URL(req.url)
  const email = url.searchParams.get("email") ?? undefined
  const customerId = url.searchParams.get("customerId") ?? undefined
  const cursor = url.searchParams.get("cursor") ?? undefined
  const limitParam = url.searchParams.get("limit")
  const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10), 100) : 25

  if (!email && !customerId) {
    return NextResponse.json(
      {
        error: {
          code: "missing_filter",
          message: "Provide either ?email= or ?customerId=.",
        },
      },
      { status: 400 }
    )
  }

  try {
    const result = await listOrders({ email, customerId, limit, cursor })
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
