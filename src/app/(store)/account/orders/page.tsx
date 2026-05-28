"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Package } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { OrderStatusBadge } from "@/components/ui/order-status-badge"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { formatPrice, formatDate } from "@/lib/utils"
import type { ThrottleOrder } from "@/lib/throttle"

// Map Throttle's richer status surface onto the starter's OrderStatusBadge
// which only knows the legacy storefront statuses. payment_status is a
// better proxy for "what does the buyer see" than the merchant-side
// order status (draft/processing/closed/etc).
function toBadgeStatus(order: ThrottleOrder) {
  if (order.status === "cancelled") return "cancelled" as const
  if (order.fulfillmentStatus === "delivered") return "delivered" as const
  if (order.fulfillmentStatus === "shipped") return "shipped" as const
  if (order.paymentStatus === "refunded") return "refunded" as const
  if (order.paymentStatus === "captured") return "processing" as const
  return "pending" as const
}

interface ListResponse {
  orders: ThrottleOrder[]
  nextCursor: string | null
}

export default function OrdersPage() {
  const { user, isReady } = useAuthGuard()
  const [orders, setOrders] = useState<ThrottleOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return
    let cancelled = false
    setError(null)
    // The server route derives the customer id from the Clerk session
    // — no client-supplied filter needed (and accepting one would
    // reopen the IDOR that earlier dev-only guard was hiding).
    fetch(`/api/throttle/orders?limit=25`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(payload?.error?.message ?? "Failed to load orders.")
        }
        return (await res.json()) as ListResponse
      })
      .then((payload) => {
        if (!cancelled) setOrders(payload.orders)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setOrders([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [isReady])

  if (!isReady) return null
  if (orders === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <PageHeader title="Order History" />
        <p className="mt-8 text-sm text-muted-foreground">Loading orders…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Order History"
        description={
          orders.length > 0
            ? `${orders.length} ${orders.length === 1 ? "order" : "orders"}`
            : undefined
        }
      />

      {error && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="When you place an order, it will appear here."
          actionLabel="Start Shopping"
          actionHref="/shop"
        />
      ) : (
        <div className="mt-8 space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={toBadgeStatus(order)} />
                    <span className="text-sm font-medium">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>
                {order.lineItems && order.lineItems.length > 0 && (
                  <div className="mt-4 text-sm text-muted-foreground">
                    {order.lineItems.map((item) => (
                      <span key={item.id} className="mr-3">
                        {item.name} &times; {item.quantity}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
