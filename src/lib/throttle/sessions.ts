import "server-only"

import { callThrottle } from "./client"
import { getCheckoutClient, requireStoreId } from "./clients"
import type { ThrottleEmbedSession } from "./types"

export interface CreateCartBackedSessionInput {
  /** Throttle cart UUID to back the session — its line items, address and
   *  totals become the resulting order on payment. */
  cartId: string
  customerEmail?: string
  returnUrl: string
  cancelUrl: string
  /** Restrict the embed to specific payment rails (e.g. ["card"]). */
  allowedMethods?: string[]
}

/**
 * Create a **cart-backed** checkout session via `@usethrottle/checkout-sdk`.
 *
 * Unlike a standalone embed token (which only charges an amount and produces
 * a bare order), this binds the session to the cart, so the PaymentEmbed's
 * capture finalizes a single order carrying the cart's line items, address
 * and totals. The `PaymentEmbed` is driven by the returned session id and
 * mints its own embed token, so we don't need one inline here.
 */
export async function createCartBackedSession(
  input: CreateCartBackedSessionInput
): Promise<ThrottleEmbedSession> {
  const applicationId = requireStoreId()
  const result = await callThrottle(() =>
    getCheckoutClient().createSession({
      applicationId,
      cartId: input.cartId,
      customerEmail: input.customerEmail,
      // Payment-only <PaymentEmbed>: we collect the shipping address ourselves
      // and write it to the cart, so tell the session NOT to collect it in the
      // embed. Otherwise the session defaults to collectShipping:true and,
      // since the payment-only embed never collects an address, `complete`
      // 422s `address_required`. With collect:false, complete uses the cart's
      // address. (Verified end-to-end against the live checkout complete API.)
      collect: { shippingAddress: false, billingAddress: false },
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      allowedMethods: input.allowedMethods,
    })
  )
  return {
    checkoutSessionId: result.sessionId,
    embedToken: result.embedToken,
    hostedUrl:
      result.hostedUrl ?? (result as { checkoutUrl?: string }).checkoutUrl,
    embedUrl: result.embedUrl,
    expiresAt: result.expiresAt,
  }
}

/**
 * Cancel a checkout session (e.g. the buyer backed out of the PaymentEmbed).
 * Idempotent via the SDK — cancelling an already-cancelled session is a no-op,
 * and a completed session throws 422 `already_completed` (handled upstream).
 */
export async function cancelCheckoutSession(sessionId: string): Promise<void> {
  await callThrottle(() => getCheckoutClient().cancelSession(sessionId))
}
