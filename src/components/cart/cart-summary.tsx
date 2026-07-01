"use client"

import { formatPrice } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { siteConfig } from "@/lib/config"
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

  // Browsing surfaces (withTotals=false) show a local free-shipping-threshold
  // estimate. Checkout (withTotals=true) binds to the live cart quote passed in
  // as props — those are the server's numbers, so there's no client-side copy
  // to drift. A null shipping means no method is locked yet.
  const fallbackShipping =
    subtotal >= siteConfig.freeShippingThreshold ? 0 : 599
  const shipping = withTotals ? shippingProp ?? 0 : fallbackShipping
  const showEstimate = withTotals && shippingProp == null

  const tax = withTotals ? taxProp ?? 0 : Math.round(subtotal * siteConfig.taxRate)

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
          {showEstimate && (
            <span className="ml-1 text-xs">(calculated at checkout)</span>
          )}
        </span>
        <span className="tabular-nums">
          {showEstimate
            ? "—"
            : shipping === 0
              ? "Free"
              : formatPrice(shipping)}
        </span>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          Tax{showEstimate && <span className="ml-1 text-xs">(estimated)</span>}
        </span>
        <span className="tabular-nums">{formatPrice(tax)}</span>
      </div>

      <Separator />
      <div className="flex justify-between font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatPrice(total)}</span>
      </div>

      {!withTotals &&
        subtotal > 0 &&
        subtotal < siteConfig.freeShippingThreshold && (
          <p className="text-xs text-muted-foreground">
            Add {formatPrice(siteConfig.freeShippingThreshold - subtotal)} more for free shipping
          </p>
        )}
    </div>
  )
}
