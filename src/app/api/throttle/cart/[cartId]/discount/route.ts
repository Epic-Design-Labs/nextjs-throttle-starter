import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import {
  ThrottleApiError,
  applyDiscount,
  removeDiscount,
} from "@/lib/throttle"
import { requireUuid } from "@/lib/http/validate"

const BodySchema = z.object({
  code: z.string().trim().min(1).max(128),
})

function notConfigured() {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const guard = notConfigured()
  if (guard) return guard

  const { cartId: rawCartId } = await params
  const cartId = requireUuid(rawCartId, "cartId")
  if (cartId instanceof NextResponse) return cartId

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
      {
        error: {
          code: "validation_error",
          message: "Expected { code: string }.",
        },
      },
      { status: 400 }
    )
  }

  try {
    const result = await applyDiscount(cartId, parsed.data.code)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] apply discount failed:", error)
    return NextResponse.json(
      { error: { code: "apply_failed", message: "Failed to apply discount." } },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const guard = notConfigured()
  if (guard) return guard

  const { cartId: rawCartId } = await params
  const cartId = requireUuid(rawCartId, "cartId")
  if (cartId instanceof NextResponse) return cartId

  try {
    const cart = await removeDiscount(cartId)
    return NextResponse.json({ cart })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] remove discount failed:", error)
    return NextResponse.json(
      { error: { code: "remove_failed", message: "Failed to remove discount." } },
      { status: 500 }
    )
  }
}
