"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/ui/page-header"
import { OrderStatusBadge } from "@/components/ui/order-status-badge"
import {
  ChevronRight,
  CreditCard,
  Heart,
  LogOut,
  MapPin,
  Package,
  Repeat,
  RotateCcw,
  Settings,
} from "lucide-react"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useReorder } from "@/hooks/use-reorder"
import { DashboardCardSkeleton } from "@/components/account/account-skeletons"
import { formatPrice, formatDate } from "@/lib/utils"
import type { ThrottleOrder } from "@/lib/throttle"

interface DashboardAddress {
  id: string
  label?: string
  firstName?: string
  lastName?: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  isDefault: boolean
}

interface DashboardSubscription {
  id: string
  status: "active" | "paused" | "cancelled" | "past_due" | "trialing"
  planName: string | null
  planReference: string
  amount: number
  currency: string
  interval: "weekly" | "monthly" | "quarterly" | "yearly"
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

interface DashboardPayload {
  recentOrder: ThrottleOrder | null
  defaultAddress: DashboardAddress | null
  activeSubscriptions: DashboardSubscription[]
  stats: { totalOrders: number }
}

function badgeStatusFor(order: ThrottleOrder) {
  if (order.status === "cancelled") return "cancelled" as const
  if (order.fulfillmentStatus === "delivered") return "delivered" as const
  if (order.fulfillmentStatus === "shipped") return "shipped" as const
  if (order.paymentStatus === "refunded") return "refunded" as const
  if (order.paymentStatus === "captured") return "processing" as const
  return "pending" as const
}

function subBadgeVariant(s: DashboardSubscription["status"]) {
  if (s === "active" || s === "trialing") return "default" as const
  if (s === "paused" || s === "past_due") return "secondary" as const
  return "outline" as const
}

const quickLinks = [
  { name: "All orders", href: "/account/orders", icon: Package },
  { name: "Addresses", href: "/account/addresses", icon: MapPin },
  { name: "Payment methods", href: "/account/payment-methods", icon: CreditCard },
  { name: "Wishlist", href: "/wishlist", icon: Heart },
  { name: "Settings", href: "/account/settings", icon: Settings },
]

export default function AccountPage() {
  const { user, isReady } = useAuthGuard()
  const { signOut } = useCurrentUser()
  const { reorder, busyOrderId } = useReorder()
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return
    let cancelled = false
    fetch("/api/account/summary")
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(payload?.error?.message ?? "Failed to load dashboard.")
        }
        return (await res.json()) as DashboardPayload
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [isReady])

  if (!isReady) return null

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? "friend"}`}
        description={user?.email ?? undefined}
      >
        <Button variant="outline" onClick={() => { void signOut() }}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </PageHeader>

      {error && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      {/* Primary surfaces ─ recent order + default address ───── */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <RecentOrderCard
          order={data?.recentOrder ?? null}
          loading={data === null && !error}
          onReorder={(id) => void reorder(id)}
          busyOrderId={busyOrderId}
        />
        <DefaultAddressCard
          address={data?.defaultAddress ?? null}
          loading={data === null && !error}
        />
      </div>

      {/* Subscriptions ────────────────────────────────────────── */}
      {data && data.activeSubscriptions.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              Active subscriptions
              <Link
                href="/account/orders"
                className="ml-auto inline-flex items-center text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                Manage <ChevronRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.activeSubscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
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
                  </p>
                </div>
                <Badge
                  variant={subBadgeVariant(sub.status)}
                  className="capitalize"
                >
                  {sub.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Compact secondary nav ───────────────────────────────── */}
      <Separator className="my-8" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="flex items-center gap-3 rounded-md border border-border/60 px-4 py-3 text-sm transition hover:bg-accent"
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{item.name}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function RecentOrderCard({
  order,
  loading,
  onReorder,
  busyOrderId,
}: {
  order: ThrottleOrder | null
  loading: boolean
  onReorder: (orderId: string) => void
  busyOrderId: string | null
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-muted-foreground" />
          Most recent order
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <DashboardCardSkeleton />}
        {!loading && !order && (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t placed an order yet.
            </p>
            <Button size="sm" asChild>
              <Link href="/shop">Start shopping</Link>
            </Button>
          </div>
        )}
        {order && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{order.orderNumber || "Order"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <OrderStatusBadge status={badgeStatusFor(order)} />
            </div>
            {order.lineItems && order.lineItems.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {order.lineItems
                  .slice(0, 3)
                  .map((li) => `${li.name} × ${li.quantity}`)
                  .join(" · ")}
                {order.lineItems.length > 3 && ` · +${order.lineItems.length - 3} more`}
              </div>
            )}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium tabular-nums">
                {formatPrice(order.total, order.currency)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReorder(order.id)}
                  disabled={busyOrderId === order.id}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {busyOrderId === order.id ? "Adding…" : "Reorder"}
                </Button>
                <Button size="sm" asChild>
                  <Link href={`/account/orders/${order.id}`}>View</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DefaultAddressCard({
  address,
  loading,
}: {
  address: DashboardAddress | null
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Default shipping address
          <Link
            href="/account/addresses"
            className="ml-auto inline-flex items-center text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            Manage <ChevronRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <DashboardCardSkeleton />}
        {!loading && !address && (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              No saved addresses yet.
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/account/addresses">Add an address</Link>
            </Button>
          </div>
        )}
        {address && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {[address.firstName, address.lastName].filter(Boolean).join(" ") ||
                address.label ||
                "Default"}
            </p>
            <p>
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
            </p>
            <p>
              {address.city}
              {address.state ? `, ${address.state}` : ""} {address.postalCode}
            </p>
            <p className="uppercase">{address.country}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
