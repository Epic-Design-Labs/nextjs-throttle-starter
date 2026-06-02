import { NextResponse, after, type NextRequest } from "next/server"
import { z } from "zod"
import { checkoutProvider } from "@/lib/checkout"
import { ThrottleApiError } from "@/lib/throttle"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { saveAddressIfNew } from "@/lib/throttle/customer-addresses"
import type { Cart, CartItem } from "@/types"

const ItemSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  productId: z.string(),
  name: z.string(),
  variantName: z.string(),
  image: z.object({
    url: z.string(),
    alt: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  slug: z.string(),
  price: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  lineTotal: z.number().int().nonnegative(),
})

const AddressSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2),
  phone: z.string().optional(),
})

const BodySchema = z.object({
  cartId: z.string().optional(),
  /** Throttle cart UUID built up incrementally by useCartStore. */
  throttleCartId: z.string().uuid().optional(),
  items: z.array(ItemSchema).min(1),
  customer: z.object({
    email: z.string().email(),
    shippingAddress: AddressSchema,
  }),
})

export async function POST(req: NextRequest) {
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
          message: "Invalid request body.",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    )
  }

  const items = parsed.data.items as CartItem[]
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  const cart: Cart = {
    id: parsed.data.cartId ?? crypto.randomUUID(),
    items,
    subtotal,
    tax: 0,
    shipping: 0,
    total: subtotal,
    itemCount,
  }

  try {
    const session = await checkoutProvider.createSession(cart, {
      email: parsed.data.customer.email,
      shippingAddress: {
        id: "shipping",
        type: "shipping",
        ...parsed.data.customer.shippingAddress,
        isDefault: true,
      },
      throttleCartId: parsed.data.throttleCartId,
    })

    // Remember the buyer's shipping address on their Throttle customer
    // so it prefills next time. Runs after the response is sent (no
    // checkout latency), best-effort, and only for signed-in buyers —
    // the customer id comes from the session, never the request body,
    // so a guest can't write to someone else's customer.
    if (isClerkConfigured) {
      const shippingAddress = parsed.data.customer.shippingAddress
      after(async () => {
        try {
          const user = await authProvider.getCurrentUser()
          if (!user?.throttleCustomerId) return
          await saveAddressIfNew(user.throttleCustomerId, {
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            line1: shippingAddress.line1,
            line2: shippingAddress.line2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
            phone: shippingAddress.phone,
          })
        } catch (err) {
          console.warn("[throttle] checkout address auto-save skipped:", err)
        }
      })
    }

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.status }
      )
    }
    const message =
      error instanceof Error ? error.message : "Unknown checkout error."
    console.error("[throttle] checkout session failed:", error)
    return NextResponse.json(
      { error: { code: "checkout_failed", message } },
      { status: 500 }
    )
  }
}
