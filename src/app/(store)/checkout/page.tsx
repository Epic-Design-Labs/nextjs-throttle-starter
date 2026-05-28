"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCartStore } from "@/store/cart"
import { CartSummary } from "@/components/cart/cart-summary"
import { ThrottlePaymentEmbed } from "@/components/checkout/throttle-payment-embed"
import { formatPrice } from "@/lib/utils"
import { toast } from "sonner"
import type { CheckoutSession } from "@/types"

const CHECKOUT_BASE_URL =
  process.env.NEXT_PUBLIC_THROTTLE_CHECKOUT_URL ?? "https://checkout.usethrottle.dev"
const PARENT_ORIGIN_OVERRIDE = process.env.NEXT_PUBLIC_THROTTLE_PARENT_ORIGIN

interface ShippingForm {
  email: string
  firstName: string
  lastName: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

const EMPTY_FORM: ShippingForm = {
  email: "",
  firstName: "",
  lastName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
}

export default function CheckoutPage() {
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const getSubtotal = useCartStore((s) => s.getSubtotal)
  const clearCart = useCartStore((s) => s.clearCart)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<ShippingForm>(EMPTY_FORM)
  const [session, setSession] = useState<CheckoutSession | null>(null)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
      </div>
    )
  }

  if (items.length === 0 && !session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            Your cart is empty. Add some products before checking out.
          </p>
          <Button className="mt-8" asChild>
            <Link href="/shop">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    )
  }

  const subtotal = getSubtotal()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !form.email ||
      !form.firstName ||
      !form.lastName ||
      !form.line1 ||
      !form.city ||
      !form.state ||
      !form.postalCode
    ) {
      toast.error("Please fill in all required fields")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/throttle/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items,
          customer: {
            email: form.email,
            shippingAddress: {
              firstName: form.firstName,
              lastName: form.lastName,
              line1: form.line1,
              line2: form.line2 || undefined,
              city: form.city,
              state: form.state,
              postalCode: form.postalCode,
              country: form.country,
            },
          },
        }),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(
          payload?.error?.message ??
            "Could not create the Throttle checkout session."
        )
      }

      const checkoutSession = (await res.json()) as CheckoutSession
      setSession(checkoutSession)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Checkout failed."
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order {session.metadata?.orderNumber ?? session.orderId}
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <ThrottlePaymentEmbed
              sessionId={session.id}
              baseUrl={CHECKOUT_BASE_URL}
              parentOrigin={PARENT_ORIGIN_OVERRIDE}
              onSucceeded={({ orderId }) => {
                clearCart()
                router.push(`/checkout/success?order_id=${orderId}`)
              }}
              onFailed={({ message }) => toast.error(message)}
              onCanceled={() => {
                setSession(null)
                toast.info("Payment cancelled.")
              }}
            />
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={() => setSession(null)}
          className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Edit shipping details
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-5">
        <div className="space-y-8 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shipping Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" name="firstName" value={form.firstName} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" name="lastName" value={form.lastName} onChange={handleChange} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="line1">Address</Label>
                <Input id="line1" name="line1" value={form.line1} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line2">Apartment, suite, etc. (optional)</Label>
                <Input id="line2" name="line2" value={form.line2} onChange={handleChange} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" value={form.city} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" value={form.state} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">ZIP code</Label>
                  <Input id="postalCode" name="postalCode" value={form.postalCode} onChange={handleChange} required />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Card details are collected by Throttle&apos;s PCI-scoped iframe
                on the next step. Submit your shipping details to continue.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <div key={item.variantId} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.name} &times; {item.quantity}
                  </span>
                  <span>{formatPrice(item.lineTotal)}</span>
                </div>
              ))}
              <Separator />
              <CartSummary subtotal={subtotal} />
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? "Creating session..." : "Continue to Payment"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  )
}
