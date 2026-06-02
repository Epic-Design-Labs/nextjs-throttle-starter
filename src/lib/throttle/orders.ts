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
  customerId?: string
  limit?: number
  cursor?: string
}

interface RawListOrder {
  id?: string
  orderNumber?: string
  status?: ThrottleOrder["status"]
  paymentStatus?: ThrottleOrder["paymentStatus"]
  fulfillmentStatus?: ThrottleOrder["fulfillmentStatus"]
  currency?: string
  subtotal?: number
  taxTotal?: number
  discountTotal?: number
  shippingTotal?: number
  total?: number
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export async function listOrders(
  input: ListOrdersInput = {}
): Promise<{ orders: ThrottleOrder[]; nextCursor: string | null }> {
  configureApiClient()
  try {
    // No store/application filter arg — the API key already scopes the
    // query to the workspace. (api-client ≥1.4.2 dropped that param.)
    const result = await OrdersService.getApiV1Orders(
      input.cursor,
      input.limit ?? 25,
      undefined, // status
      undefined, // paymentStatus
      undefined, // type
      undefined, // source
      undefined, // q
      input.customerId
    )
    // The list endpoint does not embed line items — fetch the full
    // order via getOrder() when you need them. api-client ≥1.4.2
    // returns camelCase fields matching its types, so we read directly.
    const now = new Date().toISOString()
    const orders: ThrottleOrder[] = (result.data ?? []).map((raw) => {
      const o = raw as RawListOrder
      return {
        id: o.id ?? "",
        cartId: null,
        customerId: null,
        orderNumber: o.orderNumber ?? "",
        status: o.status ?? "draft",
        paymentStatus: o.paymentStatus ?? "pending",
        fulfillmentStatus: o.fulfillmentStatus ?? "unfulfilled",
        currency: o.currency ?? "USD",
        subtotal: o.subtotal ?? 0,
        taxTotal: o.taxTotal ?? 0,
        discountTotal: o.discountTotal ?? 0,
        shippingTotal: o.shippingTotal ?? 0,
        total: o.total ?? 0,
        shippingAddress: null,
        billingAddress: null,
        metadata: o.metadata ?? {},
        createdAt: o.createdAt ?? now,
        updatedAt: o.updatedAt ?? now,
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
