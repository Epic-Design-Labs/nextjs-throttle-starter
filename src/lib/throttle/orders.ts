import { throttleFetch, throttleFetchEnvelope } from "./client"
import type { ThrottleOrder } from "./types"

export function getOrder(orderId: string): Promise<ThrottleOrder> {
  return throttleFetch<ThrottleOrder>(`/orders/${orderId}`)
}

export interface ListOrdersInput {
  email?: string
  customerId?: string
  limit?: number
  cursor?: string
}

export async function listOrders(
  input: ListOrdersInput = {}
): Promise<{ orders: ThrottleOrder[]; nextCursor: string | null }> {
  const envelope = await throttleFetchEnvelope<ThrottleOrder[]>("/orders", {
    query: {
      email: input.email,
      customerId: input.customerId,
      limit: input.limit,
      cursor: input.cursor,
    },
  })
  return {
    orders: envelope.data,
    nextCursor: envelope.meta?.pagination?.cursor ?? null,
  }
}
