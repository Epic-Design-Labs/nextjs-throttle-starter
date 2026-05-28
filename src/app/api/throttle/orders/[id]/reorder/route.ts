import { NextResponse, type NextRequest } from "next/server"
import { ThrottleApiError, getOrder } from "@/lib/throttle"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { requireUuid } from "@/lib/http/validate"
import { productRepository } from "@/lib/repositories"

interface ResolvedItem {
  variantId: string
  productId: string
  name: string
  variantName: string
  image: { url: string; alt: string }
  slug: string
  price: number
  quantity: number
}

// Walk a past order's line items, resolve each to a current catalog
// variant, and return enrich-for-cart payloads. Variants that no
// longer exist or whose product is archived are silently skipped and
// counted as `missing` so the UI can surface a "N items aren't
// available anymore" notice.
//
// Pricing is *not* preserved from the historical order — the client
// will call useCartStore.addItem, which routes through the
// price-tampering-safe /api/throttle/cart/{id}/items endpoint that
// reads unitPrice from the catalog. So a reorder gets today's prices,
// not the old ones. Intentional.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: rawId } = await params
  const id = requireUuid(rawId, "orderId")
  if (id instanceof NextResponse) return id

  // Optional: ?lineItemId= restricts the reorder to a single line.
  // Lets the UI render a per-item "Add to cart" button on the order
  // detail page without having to do client-side filtering.
  const url = new URL(_req.url)
  const onlyLineItemId = url.searchParams.get("lineItemId") ?? undefined

  try {
    const order = await getOrder(id)

    // Ownership check — never let one buyer reorder another's items.
    const orderCustomerId = (order as { customerId?: string | null }).customerId
    if (
      user.throttleCustomerId &&
      orderCustomerId &&
      orderCustomerId !== user.throttleCustomerId
    ) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Order does not belong to this account." } },
        { status: 403 }
      )
    }

    const lineItems = order.lineItems ?? []
    const targets = onlyLineItemId
      ? lineItems.filter((li) => li.id === onlyLineItemId)
      : lineItems

    if (onlyLineItemId && targets.length === 0) {
      return NextResponse.json(
        { error: { code: "line_item_not_found", message: "Line item not on this order." } },
        { status: 404 }
      )
    }

    const items: ResolvedItem[] = []
    let missing = 0
    for (const li of targets) {
      if (!li.referenceId) {
        missing++
        continue
      }
      const resolved = await productRepository.findVariant(li.referenceId)
      if (!resolved || resolved.product.status !== "active") {
        missing++
        continue
      }
      const { product, variant } = resolved
      const variantLabel = variant.options
        .map((o) => o.value)
        .filter(Boolean)
        .join(" / ")
      const image =
        variant.images[0] ?? product.images[0] ?? { url: "", alt: product.name }
      items.push({
        variantId: variant.id,
        productId: product.id,
        name: product.name,
        variantName: variantLabel,
        image: { url: image.url, alt: image.alt },
        slug: product.slug,
        price: variant.price,
        quantity: li.quantity,
      })
    }

    return NextResponse.json({ items, missing })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] reorder failed:", error)
    return NextResponse.json(
      { error: { code: "reorder_failed", message: "Reorder failed." } },
      { status: 500 }
    )
  }
}
