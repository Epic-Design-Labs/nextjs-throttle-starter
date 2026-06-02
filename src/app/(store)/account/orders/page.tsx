"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Package, Pause, Play, Repeat, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { OrderStatusBadge } from "@/components/ui/order-status-badge"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useReorder } from "@/hooks/use-reorder"
import { CardRowsSkeleton } from "@/components/account/account-skeletons"
import { formatPrice, formatDate } from "@/lib/utils"
import type { ThrottleOrder } from "@/lib/throttle"

interface ClientSubscription {
  id: string
  status: "active" | "paused" | "cancelled" | "past_due" | "trialing"
  planReference: string
  planName: string | null
  interval: "weekly" | "monthly" | "quarterly" | "yearly"
  amount: number
  currency: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

function subBadgeVariant(s: ClientSubscription["status"]) {
  if (s === "active" || s === "trialing") return "default" as const
  if (s === "paused" || s === "past_due") return "secondary" as const
  return "outline" as const
}

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
  const { isReady } = useAuthGuard()
  const [orders, setOrders] = useState<ThrottleOrder[] | null>(null)
  const [subscriptions, setSubscriptions] = useState<ClientSubscription[]>([])
  const [busySubId, setBusySubId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { reorder, busyOrderId } = useReorder()

  async function runSubAction(
    id: string,
    action: "pause" | "resume" | "cancel"
  ) {
    setBusySubId(id)
    const previous = subscriptions
    try {
      const res = await fetch(`/api/throttle/subscriptions/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "cancel"
            ? { action, atPeriodEnd: true }
            : { action }
        ),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(payload?.error?.message ?? "Action failed.")
      }
      const { subscription } = (await res.json()) as {
        subscription: ClientSubscription
      }
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? subscription : s))
      )
      toast.success(
        action === "pause"
          ? "Subscription paused"
          : action === "resume"
            ? "Subscription resumed"
            : "Subscription will cancel at period end"
      )
    } catch (err) {
      setSubscriptions(previous)
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusySubId(null)
    }
  }

  useEffect(() => {
    if (!isReady) return
    let cancelled = false
    setError(null)
    // Orders + subscriptions in parallel — subscriptions failing is
    // not fatal to rendering orders.
    Promise.all([
      fetch(`/api/throttle/orders?limit=25`).then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(payload?.error?.message ?? "Failed to load orders.")
        }
        return (await res.json()) as ListResponse
      }),
      fetch(`/api/throttle/subscriptions?limit=25`)
        .then(async (res) => {
          if (!res.ok) return { subscriptions: [] }
          return (await res.json()) as { subscriptions: ClientSubscription[] }
        })
        .catch(() => ({ subscriptions: [] })),
    ])
      .then(([ordersPayload, subsPayload]) => {
        if (cancelled) return
        setOrders(ordersPayload.orders)
        setSubscriptions(subsPayload.subscriptions ?? [])
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
        <CardRowsSkeleton />
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

      {subscriptions.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              Active subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subscriptions.map((sub) => {
              const busy = busySubId === sub.id
              const canPause = sub.status === "active" || sub.status === "trialing"
              const canResume = sub.status === "paused"
              const canCancel =
                sub.status !== "cancelled" && !sub.cancelAtPeriodEnd
              return (
                <div
                  key={sub.id}
                  className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {sub.planName ?? sub.planReference}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(sub.amount, sub.currency)} / {sub.interval}
                      {sub.currentPeriodEnd && (
                        <> · next billing {formatDate(sub.currentPeriodEnd)}</>
                      )}
                      {sub.cancelAtPeriodEnd && (
                        <> · cancels at period end</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={subBadgeVariant(sub.status)}
                      className="capitalize"
                    >
                      {sub.status.replace("_", " ")}
                    </Badge>
                    {canPause && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runSubAction(sub.id, "pause")}
                        disabled={busy}
                      >
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                        Pause
                      </Button>
                    )}
                    {canResume && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runSubAction(sub.id, "resume")}
                        disabled={busy}
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Resume
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void runSubAction(sub.id, "cancel")}
                        disabled={busy}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
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
            <Card key={order.id} className="transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  >
                    <p className="text-sm font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-3">
                    <OrderStatusBadge status={toBadgeStatus(order)} />
                    <span className="text-sm font-medium tabular-nums">
                      {formatPrice(order.total, order.currency)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void reorder(order.id)}
                      disabled={busyOrderId === order.id}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      {busyOrderId === order.id ? "Adding…" : "Reorder"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
