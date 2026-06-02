import "server-only"

import type {
  AddLineItemInput,
  Cart as SdkCart,
  LineItem as SdkLineItem,
  Order as SdkOrder,
} from "@usethrottle/cart"
import { callThrottle } from "./client"
import { getCartClient, requireStoreId } from "./clients"
import type { ThrottleAddress, ThrottleCart, ThrottleLineItem, ThrottleOrder } from "./types"

// Adapters between the SDK's shapes and the starter's existing types.
// Keeping a thin translation layer lets the public surface of this module
// (createCart, addCartItem, …) stay stable even if the SDK rev bumps its
// field names.

function sdkCartToThrottleCart(c: SdkCart): ThrottleCart {
  return {
    id: c.id,
    status: c.status,
    currency: c.currency,
    subtotal: c.subtotal,
    taxTotal: c.taxTotal,
    discountTotal: c.discountTotal,
    shippingTotal: c.shippingTotal,
    total: c.total,
    shippingAddress: (c.shippingAddress as ThrottleAddress) ?? null,
    billingAddress: (c.billingAddress as ThrottleAddress) ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

function sdkLineItemToThrottle(li: SdkLineItem): ThrottleLineItem {
  return {
    id: li.id,
    cartId: li.cartId ?? null,
    orderId: null, // SDK's LineItem type ties to carts only
    type: li.type,
    referenceId: li.referenceId,
    name: li.name,
    description: li.description,
    unitPrice: li.unitPrice,
    quantity: li.quantity,
    subtotal: li.subtotal,
    taxAmount: li.taxAmount,
    discountAmount: li.discountAmount,
    total: li.total,
    imageUrl: li.imageUrl,
    position: li.position,
    metadata: li.metadata,
  }
}

function sdkOrderToThrottleOrder(o: SdkOrder): ThrottleOrder {
  // cart-sdk's `Order` is intentionally thin (id/status/total/currency).
  // We hydrate the missing fields with zero/null sentinels so downstream
  // code can keep its existing shape; callers that need the full order
  // (e.g. success page) should re-fetch via getOrder() from sessions.ts
  // which uses the richer checkout-sdk shape.
  return {
    id: o.id,
    cartId: null,
    customerId: null,
    orderNumber: "",
    status: o.status as ThrottleOrder["status"],
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    currency: o.currency,
    subtotal: 0,
    taxTotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    total: o.total,
    shippingAddress: null,
    billingAddress: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    cancelledAt: null,
  }
}

export interface CreateCartInput {
  externalId?: string
  customerEmail?: string
  shippingAddress?: ThrottleAddress
  billingAddress?: ThrottleAddress
  metadata?: Record<string, unknown>
}

export async function createCart(input: CreateCartInput = {}): Promise<ThrottleCart> {
  // Carts belong to an application (store). THROTTLE_STORE_ID holds that
  // application's uuid.
  const sdk = await callThrottle(() =>
    getCartClient().carts.create({
      applicationId: requireStoreId(),
      currency: "USD",
      metadata: {
        ...(input.externalId ? { externalId: input.externalId } : {}),
        ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
        ...(input.metadata ?? {}),
      },
    })
  )
  // Addresses aren't part of the create payload — set them with a
  // follow-up update when the caller supplies them.
  if (input.shippingAddress || input.billingAddress) {
    const patched = await callThrottle(() =>
      getCartClient().carts.update(sdk.id, {
        shippingAddress: input.shippingAddress as Record<string, unknown> | undefined,
        billingAddress: input.billingAddress as Record<string, unknown> | undefined,
      })
    )
    return sdkCartToThrottleCart(patched)
  }
  return sdkCartToThrottleCart(sdk)
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

export async function addCartItem(
  cartId: string,
  item: AddCartItemInput
): Promise<ThrottleLineItem> {
  const sdkInput: AddLineItemInput = {
    name: item.name,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    referenceId: item.referenceId,
    description: item.description,
    imageUrl: item.imageUrl,
    metadata: item.metadata,
  }
  const li = await callThrottle(() => getCartClient().items.add(cartId, sdkInput))
  return sdkLineItemToThrottle(li)
}

export function addCartItems(
  cartId: string,
  items: AddCartItemInput[]
): Promise<ThrottleLineItem[]> {
  return Promise.all(items.map((item) => addCartItem(cartId, item)))
}

export interface UpdateCartItemInput {
  quantity?: number
  unitPrice?: number
}

export async function updateCartItem(
  cartId: string,
  itemId: string,
  input: UpdateCartItemInput
): Promise<ThrottleLineItem> {
  const li = await callThrottle(() =>
    getCartClient().items.update(cartId, itemId, input)
  )
  return sdkLineItemToThrottle(li)
}

export function removeCartItem(cartId: string, itemId: string): Promise<void> {
  return callThrottle(() => getCartClient().items.remove(cartId, itemId))
}

export async function checkoutCart(cartId: string): Promise<ThrottleOrder> {
  const order = await callThrottle(() => getCartClient().carts.checkout(cartId))
  return sdkOrderToThrottleOrder(order)
}

export async function getCart(cartId: string): Promise<ThrottleCart> {
  const sdk = await callThrottle(() => getCartClient().carts.get(cartId))
  return sdkCartToThrottleCart(sdk)
}

export interface AppliedDiscount {
  code: string
  amount: number
  currency: string
  type: "percentage" | "fixed_amount"
  freeShipping: boolean
}

function appliedDiscountFromCart(cart: SdkCart): AppliedDiscount | null {
  const d = cart.appliedDiscount
  if (!d) return null
  return {
    code: d.code,
    amount: d.amount,
    currency: d.currency,
    type: d.type,
    freeShipping: d.freeShipping,
  }
}

export async function applyDiscount(
  cartId: string,
  code: string
): Promise<{
  cart: ThrottleCart
  discount: AppliedDiscount | null
}> {
  const sdk = await callThrottle(() =>
    getCartClient().discounts.apply(cartId, code)
  )
  return {
    cart: sdkCartToThrottleCart(sdk),
    discount: appliedDiscountFromCart(sdk),
  }
}

export async function removeDiscount(cartId: string): Promise<ThrottleCart> {
  const sdk = await callThrottle(() => getCartClient().discounts.remove(cartId))
  return sdkCartToThrottleCart(sdk)
}
