import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { ThrottleApiError, addCartItem } from "@/lib/throttle"
import { productRepository } from "@/lib/repositories"
import { requireUuid } from "@/lib/http/validate"

// Price and display name come from the server-side catalog, NEVER from
// the client. Accepting `unitPrice` from the request body would let
// anyone POST `{ unitPrice: 1 }` and check out a $129.99 product for a
// penny. The client only chooses *which* variant + how many.
const BodySchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(99),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  const { cartId: rawCartId } = await params
  // Validate before interpolating — @usethrottle/cart's SDK builds URLs
  // by string template without encoding, so a non-UUID segment could
  // redirect the upstream call into another endpoint.
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
          message: "Invalid body.",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    )
  }

  const resolved = await productRepository.findVariant(parsed.data.variantId)
  if (!resolved) {
    return NextResponse.json(
      {
        error: {
          code: "unknown_variant",
          message: `No variant with id "${parsed.data.variantId}".`,
        },
      },
      { status: 400 }
    )
  }
  const { product, variant } = resolved

  if (product.status !== "active") {
    return NextResponse.json(
      {
        error: {
          code: "variant_unavailable",
          message: "Product is not available for purchase.",
        },
      },
      { status: 400 }
    )
  }

  const variantLabel = variant.options
    .map((o) => o.value)
    .filter(Boolean)
    .join(" / ")
  const displayName = variantLabel
    ? `${product.name} — ${variantLabel}`
    : product.name
  const rawImageUrl = variant.images[0]?.url ?? product.images[0]?.url
  // Throttle validates imageUrl as an absolute http(s) URL. The starter's
  // seed data uses relative /images/* paths, so we drop those — better
  // than failing the cart sync. If the merchant supplies absolute CDN
  // URLs in products.json, they flow through.
  const imageUrl =
    rawImageUrl && /^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : undefined

  try {
    const item = await addCartItem(cartId, {
      name: displayName,
      unitPrice: variant.price,
      quantity: parsed.data.quantity,
      referenceId: variant.id,
      imageUrl,
      metadata: {
        productId: product.id,
        slug: product.slug,
        sku: variant.sku,
      },
    })
    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] add cart item failed:", error)
    return NextResponse.json(
      { error: { code: "add_failed", message: "Failed to add item." } },
      { status: 500 }
    )
  }
}
