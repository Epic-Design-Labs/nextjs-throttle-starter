import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import {
  removePaymentMethod,
  setDefaultPaymentMethod,
} from "@/lib/throttle/payment-methods"
import { ThrottleApiError } from "@/lib/throttle"
import { requireUuid } from "@/lib/http/validate"

// PATCH only accepts { isDefault: true } — there's no use case for
// flipping a card off-default (Throttle picks a new one automatically
// when you remove the current default or PATCH another to true).
// Keeping the schema tight prevents anything else slipping through.
const PatchSchema = z.object({
  isDefault: z.literal(true),
})

async function requireCustomerId(): Promise<string | NextResponse> {
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
  return user.throttleCustomerId
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const customerId = await requireCustomerId()
  if (customerId instanceof NextResponse) return customerId

  const { id: rawId } = await params
  const id = requireUuid(rawId, "paymentMethodId")
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
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Expected { isDefault: true }.",
        },
      },
      { status: 400 }
    )
  }

  try {
    const paymentMethod = await setDefaultPaymentMethod(customerId, id)
    return NextResponse.json({ paymentMethod })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] set default payment method failed:", error)
    return NextResponse.json(
      { error: { code: "update_failed", message: "Failed to set default." } },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const customerId = await requireCustomerId()
  if (customerId instanceof NextResponse) return customerId

  const { id: rawId } = await params
  const id = requireUuid(rawId, "paymentMethodId")
  if (id instanceof NextResponse) return id

  try {
    await removePaymentMethod(customerId, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] remove payment method failed:", error)
    return NextResponse.json(
      { error: { code: "delete_failed", message: "Failed to remove payment method." } },
      { status: 500 }
    )
  }
}
