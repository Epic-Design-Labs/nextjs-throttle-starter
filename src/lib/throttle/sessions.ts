import { env } from "@/lib/env"
import { throttleFetch } from "./client"
import type { ThrottleAddress, ThrottleEmbedSession } from "./types"

function requireStoreId(): string {
  if (!env.THROTTLE_STORE_ID) {
    throw new Error(
      "THROTTLE_STORE_ID is not set. Set it to the UUID of the Throttle store you want carts/orders written to."
    )
  }
  return env.THROTTLE_STORE_ID
}

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
 * Mint a checkout session for the Throttle PaymentEmbed. The embed
 * mounts checkout.usethrottle.dev with this session id, and Throttle's
 * iframe handles PCI capture against the workspace's connected
 * payment provider.
 */
export function createEmbedSession(
  input: CreateEmbedSessionInput
): Promise<ThrottleEmbedSession> {
  return throttleFetch<ThrottleEmbedSession>(
    "/checkout-sessions/embed-token",
    {
      method: "POST",
      body: {
        storeId: requireStoreId(),
        amount: input.amount,
        currency: input.currency,
        country: input.country,
        externalCartId: input.externalCartId,
        customerEmail: input.customerEmail,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        allowedMethods: input.allowedMethods,
        metadata: input.metadata,
      },
    }
  )
}
