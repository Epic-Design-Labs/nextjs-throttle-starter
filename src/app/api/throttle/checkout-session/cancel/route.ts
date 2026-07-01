import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { checkoutProvider } from "@/lib/checkout"
import { ThrottleApiError } from "@/lib/throttle"
import { assertSameOrigin } from "@/lib/http/validate"

const BodySchema = z.object({
  // Throttle session ids are `cs_`/`sess_` + an opaque token. Restrict the
  // charset so an unvalidated id can't smuggle path segments into the SDK's
  // URL template (same rationale as requireUuid for UUID route params).
  sessionId: z.string().regex(/^[A-Za-z0-9_]{8,128}$/, "Invalid sessionId."),
})

/**
 * Release a checkout session when the buyer abandons the PaymentEmbed (P5).
 * Best-effort from the client's side — it's fire-and-forget there — but we
 * still return clean statuses for observability.
 *
 * Auth note: like the rest of the guest checkout flow (create-session, cart,
 * shipping-tax), this isn't user-authenticated — checkout works for anonymous
 * buyers and there's no per-user owner to bind to. The opaque, high-entropy
 * session id acts as the capability (you can only cancel a session you were
 * handed), and the worst case is griefing an in-progress checkout (the cart
 * stays open; a completed session is a 422 no-op). We add a same-origin guard
 * and strict id validation below; full ownership-binding doesn't apply here.
 */
export async function POST(req: NextRequest) {
  const crossOrigin = assertSameOrigin(req)
  if (crossOrigin) return crossOrigin

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Expected { sessionId }." } },
      { status: 400 }
    )
  }

  try {
    await checkoutProvider.cancelSession(parsed.data.sessionId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      // A completed session can't be cancelled (422 already_completed). The
      // buyer backing out after capture is harmless — treat it as a no-op
      // success rather than surfacing an error.
      if (error.status === 422) return new NextResponse(null, { status: 204 })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] cancel checkout session failed:", error)
    return NextResponse.json(
      { error: { code: "cancel_failed", message: "Could not cancel session." } },
      { status: 500 }
    )
  }
}
