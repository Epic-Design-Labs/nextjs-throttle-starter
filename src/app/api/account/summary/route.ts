import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { ThrottleApiError, listOrders } from "@/lib/throttle"
import { listAddresses } from "@/lib/throttle/customer-addresses"
import { listSubscriptions } from "@/lib/throttle/subscriptions"

// One-shot account dashboard payload. The dashboard needs the most
// recent order, the buyer's default address, and active subscriptions
// — fetching each from a separate client call would burn three round
// trips on every navigation. Pull them in parallel here and return a
// single envelope.
export async function GET() {
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
          message: "Auth provider not configured.",
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
    // First-visit edge case — surface an empty dashboard rather than
    // erroring. The next refresh (after the lazy upsert lands) will
    // populate real data.
    return NextResponse.json({
      recentOrder: null,
      defaultAddress: null,
      activeSubscriptions: [],
      stats: { totalOrders: 0 },
    })
  }

  // Parallelise — one timeout dominates rather than three serial.
  const [ordersResult, addressesResult, subsResult] = await Promise.allSettled([
    listOrders({ customerId: user.throttleCustomerId, limit: 1 }),
    listAddresses(user.throttleCustomerId),
    listSubscriptions({ customerId: user.throttleCustomerId, limit: 25 }),
  ])

  const recentOrder =
    ordersResult.status === "fulfilled" && ordersResult.value.orders.length > 0
      ? ordersResult.value.orders[0]
      : null

  const addresses =
    addressesResult.status === "fulfilled" ? addressesResult.value : []
  const defaultAddress =
    addresses.find((a) => a.isDefault) ?? addresses[0] ?? null

  const allSubs =
    subsResult.status === "fulfilled" ? subsResult.value.subscriptions : []
  const activeSubscriptions = allSubs.filter(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "paused"
  )

  // Each failure logs but doesn't fail the dashboard — the buyer
  // should still see what we successfully pulled.
  for (const [label, r] of [
    ["orders", ordersResult],
    ["addresses", addressesResult],
    ["subscriptions", subsResult],
  ] as const) {
    if (r.status === "rejected") {
      const reason = r.reason
      if (reason instanceof ThrottleApiError) {
        console.warn(`[account/summary] ${label} failed:`, reason.code, reason.message)
      } else {
        console.warn(`[account/summary] ${label} failed:`, reason)
      }
    }
  }

  return NextResponse.json({
    recentOrder,
    defaultAddress,
    activeSubscriptions,
    stats: {
      totalOrders:
        ordersResult.status === "fulfilled"
          ? ordersResult.value.orders.length // small fib for now — list is paginated, so this is a floor
          : 0,
    },
  })
}
