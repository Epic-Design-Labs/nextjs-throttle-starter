import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { ThrottleApiError, removeCartItem, updateCartItem } from "@/lib/throttle"
import { requireUuid } from "@/lib/http/validate"

// Quantity is the ONLY field the client may mutate. unitPrice / name /
// referenceId are intentionally not editable from the request body —
// allowing them would let anyone PATCH a $129.99 line item to $1 and
// check out.
const PatchSchema = z.object({
  quantity: z.number().int().positive().max(99),
})

function configured() {
  return Boolean(env.THROTTLE_API_KEY && env.THROTTLE_STORE_ID)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cartId: string; itemId: string }> }
) {
  if (!configured()) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  const { cartId: rawCartId, itemId: rawItemId } = await params
  const cartId = requireUuid(rawCartId, "cartId")
  if (cartId instanceof NextResponse) return cartId
  const itemId = requireUuid(rawItemId, "itemId")
  if (itemId instanceof NextResponse) return itemId

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
          message: "Invalid body.",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    )
  }

  try {
    const item = await updateCartItem(cartId, itemId, parsed.data)
    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] update cart item failed:", error)
    return NextResponse.json(
      { error: { code: "update_failed", message: "Failed to update item." } },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cartId: string; itemId: string }> }
) {
  if (!configured()) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  const { cartId: rawCartId, itemId: rawItemId } = await params
  const cartId = requireUuid(rawCartId, "cartId")
  if (cartId instanceof NextResponse) return cartId
  const itemId = requireUuid(rawItemId, "itemId")
  if (itemId instanceof NextResponse) return itemId

  try {
    await removeCartItem(cartId, itemId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] remove cart item failed:", error)
    return NextResponse.json(
      { error: { code: "remove_failed", message: "Failed to remove item." } },
      { status: 500 }
    )
  }
}
