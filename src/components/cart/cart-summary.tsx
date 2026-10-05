"use client"

import { formatPrice } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { siteConfig } from "@/lib/config"
import { freeShippingOffered } from "@/lib/shipping-offer"
import { useCartStore } from "@/store/cart"

interface CartSummaryProps {
  subtotal: number
  /**
   * When true (default), the summary shows real shipping/tax bound to a live
   * Throttle cart quote, passed in via `shipping`/`tax` (checkout). Set false
   * on browsing surfaces (cart page) that only want the local subtotal
   * estimate.
   */
  withTotals?: boolean
  /**
   * Server-truth shipping rate (cents) from the live cart quote. `null`/omitted
   * means no method is locked yet → the summary shows a "calculated at
   * checkout" placeholder. Ignored when `withTotals` is false.
   */
  shipping?: number | null
  /** Server-truth tax total (cents) from the live cart quote. */
  tax?: number
}

export function CartSummary({
  subtotal,
  withTotals = true,
  shipping: shippingProp = null,
  tax: taxProp,
}: CartSummaryProps) {
  const discount = useCartStore((s) => s.appliedDiscount)
  const discountTotal = useCartStore((s) => s.getDiscountTotal)()

  // Shipping and tax are only ever SHOWN when they come from the live cart
  // quote (checkout, withTotals + a locked method). Everywhere else they are
  // unknown, and the summary says so.
  //
  // It used to guess on browsing surfaces: shipping from a local threshold
  // comparison, tax from subtotal * taxRate, both rendered as plain figures
  // inside a Total. Two problems. The guessed total is one checkout can
  // contradict - and did, since the threshold comparison also made
  // `freeShippingThreshold: 0` (which means the offer is OFF) read as "every
  // order ships free". And the one honest marker, "(estimated)", rendered only
  // in the withTotals case, i.e. exactly where the numbers were real.
  const quoted = withTotals && shippingProp != null
  const shipping = quoted ? shippingProp! : 0
  const tax = quoted ? taxProp ?? 0 : 0

  // Without a quote this is a subtotal after discount, not a total. Labelled as
  // such below rather than dressed up as the amount they will pay.
  const total = Math.max(0, subtotal - discountTotal + shipping + tax)

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">{formatPrice(subtotal)}</span>
      </div>

      {discount && discountTotal > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Discount <span className="font-mono text-xs">{discount.code}</span>
          </span>
          <span className="tabular-nums text-success">
            −{formatPrice(discountTotal)}
          </span>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          Shipping
          {!quoted && (
            <span className="ml-1 text-xs">(calculated at checkout)</span>
          )}
        </span>
        <span className="tabular-nums">
          {/* An em dash, never "$0.00": "no charge" and "not worked out yet"
              are different claims, and only the server can make the first. */}
          {!quoted ? "—" : shipping === 0 ? "Free" : formatPrice(shipping)}
        </span>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          Tax
          {!quoted && (
            <span className="ml-1 text-xs">(calculated at checkout)</span>
          )}
        </span>
        <span className="tabular-nums">{!quoted ? "—" : formatPrice(tax)}</span>
      </div>

      <Separator />
      <div className="flex justify-between font-medium">
        <span>{quoted ? "Total" : "Subtotal"}</span>
        <span className="tabular-nums">{formatPrice(total)}</span>
      </div>

      {!quoted && (
        <p className="text-xs text-muted-foreground">
          Shipping and tax are calculated at checkout.
        </p>
      )}

      {/* The free-shipping nudge is an offer claim: it must not appear when the
          offer is switched off, or it reads "Add $0.00 more for free shipping". */}
      {!withTotals &&
        subtotal > 0 &&
        freeShippingOffered() &&
        subtotal < siteConfig.freeShippingThreshold && (
          <p className="text-xs text-muted-foreground">
            Add {formatPrice(siteConfig.freeShippingThreshold - subtotal)} more for free shipping
          </p>
        )}
    </div>
  )
}
