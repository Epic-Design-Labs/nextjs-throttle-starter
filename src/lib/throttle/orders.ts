import "server-only"

import { OpenAPI, OrdersService } from "@usethrottle/api-client"
import { callThrottle, toThrottleApiError } from "./client"
import { getCheckoutClient } from "./clients"
import { env } from "@/lib/env"
import type { ThrottleOrder } from "./types"

let _apiClientConfigured = false
function configureApiClient() {
  if (_apiClientConfigured) return
  // @usethrottle/api-client is the openapi-generated client. It reads
  // config off a module-scoped `OpenAPI` object. Configure once.
  OpenAPI.BASE = env.THROTTLE_API_BASE_URL
  OpenAPI.TOKEN = env.THROTTLE_API_KEY ?? ""
  OpenAPI.HEADERS = { "x-api-key": env.THROTTLE_API_KEY ?? "" }
  _apiClientConfigured = true
}

/**
 * Fetch a single order with line items, via the hand-written
 * checkout SDK. Richer payload than the api-client equivalent.
 */
export async function getOrder(orderId: string): Promise<ThrottleOrder> {
  const o = await callThrottle(() =>
    getCheckoutClient().getOrderWithPayments(orderId)
  )
  // The checkout-sdk's CheckoutOrder type is loosely typed
  // (`[key: string]: unknown`). Cast through unknown to land on our
  // domain shape — fields we depend on (id, orderNumber, status, total
  // etc.) are confirmed present from the API contract.
  return o as unknown as ThrottleOrder
}

export interface ListOrdersInput {
  /**
   * Note: Throttle's REST orders endpoint does not natively filter by
   * email. The starter caller passes the customer's email and we look
   * up the matching customer first — but customer creation is out of
   * scope for this starter, so this falls back to listing all orders
   * for now. See feedback.
   */
  email?: string
  customerId?: string
  storeId?: string
  limit?: number
  cursor?: string
}

export async function listOrders(
  input: ListOrdersInput = {}
): Promise<{ orders: ThrottleOrder[]; nextCursor: string | null }> {
  configureApiClient()
  try {
    const result = await OrdersService.getApiV1Orders(
      input.cursor,
      input.limit ?? 25,
      undefined, // status
      undefined, // paymentStatus
      undefined, // type
      undefined, // source
      undefined, // q
      input.customerId,
      input.storeId ?? env.THROTTLE_STORE_ID
    )
    // api-client's TypeScript types are snake_case but Throttle's REST
    // actually returns camelCase, so the types lie. Read both keys with
    // a fallback so we work regardless of which side gets fixed.
    type LooseOrder = Record<string, unknown>
    const pick = <T,>(o: LooseOrder, snake: string, camel: string): T | undefined =>
      (o[camel] as T | undefined) ?? (o[snake] as T | undefined)

    const orders: ThrottleOrder[] = (result.data ?? []).map((raw) => {
      const o = raw as LooseOrder
      return {
        id: (o.id as string) ?? "",
        cartId: null,
        customerId: null,
        orderNumber: pick<string>(o, "order_number", "orderNumber") ?? "",
        status: (pick<string>(o, "status", "status") ?? "draft") as ThrottleOrder["status"],
        paymentStatus: (pick<string>(o, "payment_status", "paymentStatus") ?? "pending") as ThrottleOrder["paymentStatus"],
        fulfillmentStatus: (pick<string>(o, "fulfillment_status", "fulfillmentStatus") ?? "unfulfilled") as ThrottleOrder["fulfillmentStatus"],
        currency: (o.currency as string) ?? "USD",
        subtotal: (o.subtotal as number) ?? 0,
        taxTotal: pick<number>(o, "tax_total", "taxTotal") ?? 0,
        discountTotal: pick<number>(o, "discount_total", "discountTotal") ?? 0,
        shippingTotal: pick<number>(o, "shipping_total", "shippingTotal") ?? 0,
        total: (o.total as number) ?? 0,
        shippingAddress: null,
        billingAddress: null,
        metadata: (o.metadata as Record<string, unknown>) ?? {},
        createdAt: pick<string>(o, "created_at", "createdAt") ?? new Date().toISOString(),
        updatedAt: pick<string>(o, "updated_at", "updatedAt") ?? new Date().toISOString(),
        completedAt: null,
        cancelledAt: null,
      }
    })
    return {
      orders,
      nextCursor: result.meta?.pagination?.cursor ?? null,
    }
  } catch (err) {
    throw toThrottleApiError(err)
  }
}
