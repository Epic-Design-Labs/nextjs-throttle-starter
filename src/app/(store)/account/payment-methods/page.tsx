"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { CreditCard, Star, Trash2 } from "lucide-react"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { CardRowsSkeleton } from "@/components/account/account-skeletons"
import { toast } from "sonner"

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

interface ClientPaymentMethod {
  id: string
  processor: string
  type: "card" | "bank_account" | "wallet"
  cardBrand: string | null
  cardLast4: string | null
  cardExpMonth: number | null
  cardExpYear: number | null
  isDefault: boolean
}

function formatBrand(brand: string | null): string {
  if (!brand) return "Card"
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
}

function formatExpiry(month: number | null, year: number | null): string {
  if (!month || !year) return ""
  const mm = String(month).padStart(2, "0")
  const yy = String(year).slice(-2)
  return `${mm}/${yy}`
}

export default function PaymentMethodsPage() {
  const { isReady } = useAuthGuard()
  const [methods, setMethods] = useState<ClientPaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !clerkConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetch("/api/throttle/customer-payment-methods")
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(
            payload?.error?.message ?? "Failed to load payment methods."
          )
        }
        return (await res.json()) as { paymentMethods: ClientPaymentMethod[] }
      })
      .then(({ paymentMethods }) => {
        if (!cancelled) setMethods(paymentMethods)
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isReady])

  async function handleSetDefault(id: string) {
    setBusyId(id)
    const previous = methods
    // Optimistic — flip default flag locally, restore on error.
    setMethods((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === id }))
    )
    try {
      const res = await fetch(`/api/throttle/customer-payment-methods/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(payload?.error?.message ?? "Could not set default.")
      }
      toast.success("Default payment method updated")
    } catch (err) {
      setMethods(previous)
      toast.error(err instanceof Error ? err.message : "Update failed.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(id: string) {
    setBusyId(id)
    const previous = methods
    setMethods((prev) => prev.filter((m) => m.id !== id))
    try {
      const res = await fetch(`/api/throttle/customer-payment-methods/${id}`, {
        method: "DELETE",
      })
      if (!res.ok && res.status !== 204) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(payload?.error?.message ?? "Could not remove card.")
      }
      toast("Payment method removed")
    } catch (err) {
      setMethods(previous)
      toast.error(err instanceof Error ? err.message : "Remove failed.")
    } finally {
      setBusyId(null)
    }
  }

  if (!isReady) return null

  if (!clerkConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <PageHeader title="Payment Methods" />
        <EmptyState
          icon={CreditCard}
          title="Sign in to manage saved cards"
          description="Saved cards live on your Throttle customer record. Configure Clerk to enable this surface."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Payment Methods"
        description="Cards saved when you check out appear here. Set a default or remove cards you no longer use."
      />

      {loading ? (
        <CardRowsSkeleton rows={2} />
      ) : methods.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No saved payment methods"
          description="Your cards are vaulted during checkout. After your first purchase, you can manage them here."
          actionLabel="Start Shopping"
          actionHref="/shop"
        />
      ) : (
        <div className="mt-8 space-y-4">
          {methods.map((m) => {
            const busy = busyId === m.id
            const expiry = formatExpiry(m.cardExpMonth, m.cardExpYear)
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {formatBrand(m.cardBrand)}
                        {m.cardLast4 && (
                          <>
                            <span className="ml-2 font-mono text-muted-foreground">
                              •••• {m.cardLast4}
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {expiry ? `Expires ${expiry} · ` : ""}
                        {m.processor}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {m.isDefault ? (
                      <Badge variant="default">
                        <Star className="mr-1 h-3 w-3 fill-current" />
                        Default
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSetDefault(m.id)}
                        disabled={busy}
                      >
                        <Star className="mr-1.5 h-3.5 w-3.5" />
                        Set default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleRemove(m.id)}
                      disabled={busy}
                      aria-label="Remove payment method"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
