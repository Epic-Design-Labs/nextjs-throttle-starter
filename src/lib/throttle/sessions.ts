import "server-only"

import { callThrottle } from "./client"
import { getCheckoutClient, requireStoreId } from "./clients"
import type { ThrottleAddress, ThrottleEmbedSession } from "./types"

export interface CreateEmbedSessionInput {
  /** Amount in minor units (cents for USD). */
  amount: number
  currency: string
  country: string
  /** Local cart ID or any external reference the merchant wants to track. */
  externalCartId?: string
  customerEmail?: string
  shippingAddress?: ThrottleAddress
  billingAddress?: ThrottleAddress
  /** Restrict the embed to specific payment rails (e.g. ["card"]). */
  allowedMethods?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Mint a PaymentEmbed session via `@usethrottle/checkout-sdk`.
 *
 * `createEmbedToken` takes `{ amount, currency, country, externalCartId,
 * allowedMethods }`. Customer details and addresses live on the cart and
 * the embed flow, so they aren't passed here; the extra fields on
 * {@link CreateEmbedSessionInput} are accepted for caller convenience.
 */
export async function createEmbedSession(
  input: CreateEmbedSessionInput
): Promise<ThrottleEmbedSession> {
  // Validate configuration up front so an unconfigured workspace fails
  // with a clear message instead of a downstream 400.
  requireStoreId()
  const result = await callThrottle(() =>
    getCheckoutClient().createEmbedToken({
      amount: input.amount,
      currency: input.currency,
      country: input.country,
      externalCartId: input.externalCartId,
      allowedMethods: input.allowedMethods,
    })
  )
  return {
    checkoutSessionId: result.checkoutSessionId,
    embedToken: result.embedToken,
    hostedUrl: result.hostedUrl,
    embedUrl: result.embedUrl,
  }
}
