import { env } from "@/lib/env"
import { throttleFetch } from "./client"
import type {
  ThrottleAddress,
  ThrottleCart,
  ThrottleLineItem,
  ThrottleOrder,
} from "./types"

function requireStoreId(): string {
  if (!env.THROTTLE_STORE_ID) {
    throw new Error(
      "THROTTLE_STORE_ID is not set. Set it to the UUID of the Throttle store you want carts/orders written to."
    )
  }
  return env.THROTTLE_STORE_ID
}

export interface CreateCartInput {
  externalId?: string
  customerEmail?: string
  shippingAddress?: ThrottleAddress
  billingAddress?: ThrottleAddress
  metadata?: Record<string, unknown>
}

export async function createCart(input: CreateCartInput = {}): Promise<ThrottleCart> {
  return throttleFetch<ThrottleCart>("/carts", {
    method: "POST",
    body: {
      storeId: requireStoreId(),
      currency: "USD",
      country: input.shippingAddress?.country ?? "US",
      externalId: input.externalId,
      customerEmail: input.customerEmail,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      metadata: input.metadata,
    },
  })
}

export interface AddCartItemInput {
  name: string
  unitPrice: number
  quantity: number
  referenceId?: string
  description?: string
  imageUrl?: string
  metadata?: Record<string, unknown>
}

export function addCartItem(
  cartId: string,
  item: AddCartItemInput
): Promise<ThrottleLineItem> {
  return throttleFetch<ThrottleLineItem>(`/carts/${cartId}/items`, {
    method: "POST",
    body: item,
  })
}

/**
 * Bulk add items by firing add requests in parallel. Throttle's API
 * supports concurrent writes against the same cart.
 */
export function addCartItems(
  cartId: string,
  items: AddCartItemInput[]
): Promise<ThrottleLineItem[]> {
  return Promise.all(items.map((item) => addCartItem(cartId, item)))
}

/**
 * Transition a cart into a draft order. Throttle returns the new order
 * (with line items copied across), and the cart's status flips to
 * `checked_out`. This does NOT capture payment — pay the resulting
 * order via createEmbedSession().
 */
export function checkoutCart(cartId: string): Promise<ThrottleOrder> {
  return throttleFetch<ThrottleOrder>(`/carts/${cartId}/checkout`, {
    method: "POST",
    body: {},
  })
}

export function getCart(cartId: string): Promise<ThrottleCart> {
  return throttleFetch<ThrottleCart>(`/carts/${cartId}`)
}
