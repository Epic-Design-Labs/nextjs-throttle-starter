// Throttle REST API response shapes — only the fields the starter touches.
// See https://docs.usethrottle.dev/developers/api-reference for the full
// surface. Field names match Throttle's wire format (camelCase).

export interface ThrottleEnvelope<T> {
  data: T
  meta?: {
    request_id?: string
    pagination?: { cursor: string | null; hasMore: boolean }
  }
}

export interface ThrottleErrorEnvelope {
  error: {
    code: string
    message: string
    details?: Array<{ path: string; message: string }>
  }
  meta?: { request_id?: string }
}

export interface ThrottleAddress {
  firstName?: string
  lastName?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
}

export type ThrottleCartStatus =
  | "open"
  | "checkout"
  | "converted"
  | "abandoned"

export interface ThrottleCart {
  id: string
  status: ThrottleCartStatus
  currency: string
  subtotal: number
  taxTotal: number
  discountTotal: number
  shippingTotal: number
  total: number
  shippingAddress: ThrottleAddress | null
  billingAddress: ThrottleAddress | null
  createdAt: string
  updatedAt: string
}

export type ThrottleLineItemType =
  | "product"
  | "subscription"
  | "service"
  | "ticket"
  | "donation"
  | "custom"

export interface ThrottleLineItem {
  id: string
  cartId: string | null
  orderId: string | null
  type: ThrottleLineItemType
  referenceId: string | null
  name: string
  description: string | null
  unitPrice: number
  quantity: number
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  imageUrl: string | null
  position: number
  metadata: Record<string, unknown>
}

export type ThrottleOrderStatus =
  | "draft"
  | "pending"
  | "processing"
  | "completed"
  | "cancelled"
  | "closed"

export type ThrottlePaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "voided"

export type ThrottleFulfillmentStatus =
  | "unfulfilled"
  | "partially_fulfilled"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "returned"

export interface ThrottleOrder {
  id: string
  cartId: string | null
  customerId: string | null
  orderNumber: string
  status: ThrottleOrderStatus
  paymentStatus: ThrottlePaymentStatus
  fulfillmentStatus: ThrottleFulfillmentStatus
  currency: string
  subtotal: number
  taxTotal: number
  discountTotal: number
  shippingTotal: number
  total: number
  shippingAddress: ThrottleAddress | null
  billingAddress: ThrottleAddress | null
  lineItems?: ThrottleLineItem[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
}

export interface ThrottleEmbedSession {
  checkoutSessionId: string
  embedToken?: string
  hostedUrl?: string
  embedUrl?: string
  expiresAt?: string
}

export type ThrottleWebhookEvent = {
  id: string
  type: string
  createdAt: string
  data: Record<string, unknown>
}
