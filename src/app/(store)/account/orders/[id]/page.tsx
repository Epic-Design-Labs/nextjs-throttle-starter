"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/ui/page-header"
import { OrderStatusBadge } from "@/components/ui/order-status-badge"
import { ChevronLeft, Plus, RotateCcw } from "lucide-react"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useReorder } from "@/hooks/use-reorder"
import { OrderDetailSkeleton } from "@/components/account/account-skeletons"
import { formatPrice, formatDate } from "@/lib/utils"
import type { ThrottleOrder } from "@/lib/throttle"

// Map Throttle's richer status surface onto the starter's badge enum.
function badgeStatusFor(order: ThrottleOrder) {
  if (order.status === "cancelled") return "cancelled" as const
  if (order.fulfillmentStatus === "delivered") return "delivered" as const
  if (order.fulfillmentStatus === "shipped") return "shipped" as const
  if (order.paymentStatus === "refunded") return "refunded" as const
  if (order.paymentStatus === "captured") return "processing" as const
  return "pending" as const
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { isReady } = useAuthGuard()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [order, setOrder] = useState<ThrottleOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { reorder, busyOrderId } = useReorder()
  const reordering = busyOrderId !== null

  useEffect(() => {
    let cancelled = false
    params.then((p) => {
      if (!cancelled) setOrderId(p.id)
    })
    return () => {
      cancelled = true
    }
  }, [params])

  useEffect(() => {
    if (!isReady || !orderId) return
    let cancelled = false
    fetch(`/api/throttle/orders/${orderId}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(payload?.error?.message ?? "Could not load order.")
        }
        return (await res.json()) as { order: ThrottleOrder }
      })
      .then(({ order }) => {
        if (!cancelled) setOrder(order)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [isReady, orderId])

  function handleReorder() {
    if (order) void reorder(order.id)
  }

  if (!isReady) return null
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/account/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to orders
        </Link>
        <p className="mt-8 text-sm text-destructive">{error}</p>
      </div>
    )
  }
  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Link
          href="/account/orders"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to orders
        </Link>
        <OrderDetailSkeleton />
      </div>
    )
  }

  const ship = order.shippingAddress
  const lineItems = order.lineItems ?? []

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <Link
        href="/account/orders"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="mr-1 h-4 w-4" /> Back to orders
      </Link>

      <PageHeader
        title={order.orderNumber || "Order"}
        description={`Placed ${formatDate(order.createdAt)}`}
      >
        <Button onClick={handleReorder} disabled={reordering}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {reordering ? "Adding…" : "Reorder"}
        </Button>
      </PageHeader>

      <div className="mt-4 flex items-center gap-3">
        <OrderStatusBadge status={badgeStatusFor(order)} />
        <span className="text-sm text-muted-foreground">
          Payment {order.paymentStatus} · Fulfillment {order.fulfillmentStatus}
        </span>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No line items.</p>
          ) : (
            lineItems.map((li) => (
              <div key={li.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{li.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU {li.referenceId ?? "—"} · Qty {li.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium tabular-nums">
                    {formatPrice(li.total, order.currency)}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void reorder(order.id, li.id)}
                    disabled={busyOrderId === li.id}
                    aria-label={`Add ${li.name} to cart`}
                    title="Add to cart"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {busyOrderId === li.id ? "…" : ""}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipping address</CardTitle>
          </CardHeader>
          <CardContent>
            {ship ? (
              <p className="text-sm text-muted-foreground">
                {[ship.firstName, ship.lastName].filter(Boolean).join(" ")}<br />
                {ship.line1}{ship.line2 ? `, ${ship.line2}` : ""}<br />
                {ship.city}
                {ship.state ? `, ${ship.state}` : ""} {ship.postalCode}<br />
                {ship.country}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No shipping address on this order.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="tabular-nums">
                {order.shippingTotal === 0 ? "Free" : formatPrice(order.shippingTotal, order.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatPrice(order.taxTotal, order.currency)}</span>
            </div>
            {order.discountTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">−{formatPrice(order.discountTotal, order.currency)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(order.total, order.currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
