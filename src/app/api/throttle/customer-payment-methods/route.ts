import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { listPaymentMethods } from "@/lib/throttle/payment-methods"
import { ThrottleApiError } from "@/lib/throttle"

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

export async function GET() {
  const result = await requireCustomerId()
  if (result instanceof NextResponse) return result
  try {
    const paymentMethods = await listPaymentMethods(result)
    return NextResponse.json({ paymentMethods })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] list payment methods failed:", error)
    return NextResponse.json(
      { error: { code: "list_failed", message: "Failed to list payment methods." } },
      { status: 500 }
    )
  }
}
