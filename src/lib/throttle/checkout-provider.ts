import { env } from "@/lib/env"
import type {
  Address,
  Cart,
  CheckoutProvider,
  CheckoutSession,
  WebhookResult,
} from "@/types"
import { addCartItems, checkoutCart, createCart, getCart } from "./cart"
import { createEmbedSession } from "./sessions"
import { getOrder } from "./orders"
import {
  THROTTLE_SIGNATURE_HEADER,
  verifyThrottleSignature,
} from "./webhook"
import type { ThrottleAddress, ThrottleWebhookEvent } from "./types"

function toThrottleAddress(addr?: Address): ThrottleAddress | undefined {
  if (!addr) return undefined
  return {
    firstName: addr.firstName,
    lastName: addr.lastName,
    line1: addr.line1,
    line2: addr.line2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
    phone: addr.phone,
  }
}

/**
 * CheckoutProvider implementation backed by Throttle.
 *
 * createSession runs the full server-side flow:
 *   1. Create a Throttle cart with the buyer's shipping address.
 *   2. Add every local cart line as a Throttle line item.
 *   3. Transition the cart into a draft order via /carts/:id/checkout.
 *   4. Mint a PaymentEmbed session against that order's total.
 *
 * The returned `id` is the Throttle order id (durable across reloads).
 * `url` is the embedded checkout URL — useful as a fallback if the
 * React PaymentEmbed cannot mount.
 */
export const throttleCheckoutProvider: CheckoutProvider = {
  async createSession(
    cart: Cart,
    customer?: { email: string; shippingAddress?: Address; throttleCartId?: string }
  ): Promise<CheckoutSession> {
    if (cart.items.length === 0) {
      throw new Error("Cannot create a checkout session for an empty cart.")
    }

    const shippingAddress = toThrottleAddress(customer?.shippingAddress)

    // Reuse the cart the buyer's been adding to all session if the
    // client passed it; only fall back to building from local items
    // when there isn't one yet (first-time flow / cart was cleared).
    let throttleCartId: string
    if (customer?.throttleCartId) {
      // Verify the cart is still in `open` status. A "checked_out" cart
      // would already have an order — re-running /checkout would 4xx.
      const existing = await getCart(customer.throttleCartId).catch(() => null)
      if (existing && existing.status === "open") {
        throttleCartId = existing.id
      } else {
        // Cart went away or already converted; build a fresh one.
        const fresh = await createCart({
          externalId: cart.id,
          customerEmail: customer.email,
          shippingAddress,
        })
        await addCartItems(
          fresh.id,
          cart.items.map((item) => ({
            name: item.variantName
              ? `${item.name} — ${item.variantName}`
              : item.name,
            unitPrice: item.price,
            quantity: item.quantity,
            referenceId: item.variantId,
            imageUrl: item.image.url,
            description: item.image.alt,
            metadata: { productId: item.productId, slug: item.slug },
          }))
        )
        throttleCartId = fresh.id
      }
    } else {
      const throttleCart = await createCart({
        externalId: cart.id,
        customerEmail: customer?.email,
        shippingAddress,
      })
      await addCartItems(
        throttleCart.id,
        cart.items.map((item) => ({
          name: item.variantName
            ? `${item.name} — ${item.variantName}`
            : item.name,
          unitPrice: item.price,
          quantity: item.quantity,
          referenceId: item.variantId,
          imageUrl: item.image.url,
          description: item.image.alt,
          metadata: { productId: item.productId, slug: item.slug },
        }))
      )
      throttleCartId = throttleCart.id
    }

    const order = await checkoutCart(throttleCartId)
    const session = await createEmbedSession({
      amount: order.total,
      currency: order.currency,
      country: shippingAddress?.country ?? "US",
      externalCartId: cart.id,
      customerEmail: customer?.email,
      shippingAddress,
      metadata: { orderId: order.id, throttleCartId },
    })

    const status: CheckoutSession["status"] =
      order.status === "completed"
        ? "complete"
        : order.status === "cancelled"
          ? "expired"
          : "open"

    return {
      id: session.checkoutSessionId,
      url:
        session.embedUrl ??
        session.hostedUrl ??
        `${env.NEXT_PUBLIC_THROTTLE_CHECKOUT_URL}/c/${session.checkoutSessionId}`,
      status,
      orderId: order.id,
      metadata: {
        throttleCartId,
        orderNumber: order.orderNumber,
        embedToken: session.embedToken ?? "",
        hostedUrl: session.hostedUrl ?? "",
        total: String(order.total),
        currency: order.currency,
      },
    }
  },

  async getSession(sessionId: string): Promise<CheckoutSession> {
    // For payment-embed sessions, the merchant-facing source of truth is
    // the underlying order. Treat `sessionId` as the order id (which is
    // what createSession returns into the session.orderId field, and
    // also stamps as the session metadata).
    const order = await getOrder(sessionId)
    const status: CheckoutSession["status"] =
      order.status === "completed" ? "complete" : order.status === "cancelled" ? "expired" : "open"
    return {
      id: order.id,
      url: `${env.NEXT_PUBLIC_THROTTLE_CHECKOUT_URL}/orders/${order.id}`,
      status,
      orderId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        total: String(order.total),
        currency: order.currency,
      },
    }
  },

  async handleWebhook(
    payload: unknown,
    signature: string
  ): Promise<WebhookResult> {
    if (!env.THROTTLE_WEBHOOK_SECRET) {
      return {
        success: false,
        error:
          "THROTTLE_WEBHOOK_SECRET is not set — cannot verify Throttle webhook signatures.",
      }
    }

    // payload is the *raw* string body from the request — DO NOT JSON.parse
    // it before passing here; the hash is computed over the raw bytes.
    const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload)
    const valid = verifyThrottleSignature({
      rawBody,
      header: signature,
      secret: env.THROTTLE_WEBHOOK_SECRET,
    })
    if (!valid) {
      return { success: false, error: "Invalid Throttle webhook signature." }
    }

    let event: ThrottleWebhookEvent
    try {
      event = JSON.parse(rawBody) as ThrottleWebhookEvent
    } catch {
      return { success: false, error: "Webhook body was not valid JSON." }
    }

    // The data shape varies by event type. Order events carry the order
    // payload; payment events carry { payment, orderId }. Pull the order
    // id off either shape so the caller can fan out from one field.
    const data = event.data as { id?: string; orderId?: string }
    const orderId = data.orderId ?? data.id

    return { success: true, orderId }
  },
}

export { THROTTLE_SIGNATURE_HEADER }
