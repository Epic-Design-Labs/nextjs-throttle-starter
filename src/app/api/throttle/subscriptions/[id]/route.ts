import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { requireUuid } from "@/lib/http/validate"
import {
  cancelSubscription,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
} from "@/lib/throttle/subscriptions"
import { ThrottleApiError } from "@/lib/throttle"

const ActionSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
  atPeriodEnd: z.boolean().optional(),
  reason: z.string().max(500).optional(),
})

async function requireCustomerSubscription(id: string) {
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
    return NextResponse.json(
      { error: { code: "customer_not_linked", message: "No customer link yet." } },
      { status: 409 }
    )
  }
  // Ownership check — fetch the subscription and compare its customerId
  // to the session's. Deny-by-default: a null/empty customerId on the
  // record is treated as "not yours" rather than "no link, so allow",
  // which closes the fail-open path if Throttle ever returns orphan
  // subscriptions.
  let sub
  try {
    sub = await getSubscription(id)
  } catch (err) {
    if (err instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      )
    }
    throw err
  }
  if (!sub.customerId || sub.customerId !== user.throttleCustomerId) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Subscription does not belong to this account." } },
      { status: 403 }
    )
  }
  return { user, sub }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params
  const id = requireUuid(rawId, "subscriptionId")
  if (id instanceof NextResponse) return id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Expected { action: 'pause' | 'resume' | 'cancel' }.",
        },
      },
      { status: 400 }
    )
  }

  const auth = await requireCustomerSubscription(id)
  if (auth instanceof NextResponse) return auth

  try {
    let updated
    switch (parsed.data.action) {
      case "pause":
        updated = await pauseSubscription(id)
        break
      case "resume":
        updated = await resumeSubscription(id)
        break
      case "cancel":
        updated = await cancelSubscription(id, {
          atPeriodEnd: parsed.data.atPeriodEnd,
          reason: parsed.data.reason,
        })
        break
    }
    return NextResponse.json({ subscription: updated })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] subscription action failed:", error)
    return NextResponse.json(
      { error: { code: "action_failed", message: "Subscription action failed." } },
      { status: 500 }
    )
  }
}
