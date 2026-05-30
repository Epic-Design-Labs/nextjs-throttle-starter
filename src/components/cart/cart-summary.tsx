"use client"

import { formatPrice } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { siteConfig } from "@/lib/config"
import { useCartStore } from "@/store/cart"

interface CartSummaryProps {
  subtotal: number
  /**
   * When true (default), the summary reads discount / shipping / tax
   * from the Throttle-synced cart store. Set false on surfaces that
   * only want the local subtotal estimate (e.g. cart drawer preview).
   */
  withTotals?: boolean
}

export function CartSummary({ subtotal, withTotals = true }: CartSummaryProps) {
  const discount = useCartStore((s) => s.appliedDiscount)
  const discountTotal = useCartStore((s) => s.getDiscountTotal)()
  const selectedShipping = useCartStore((s) => s.selectedShipping)
  const taxTotal = useCartStore((s) => s.taxTotal)

  // When shipping hasn't been calculated yet, fall back to the local
  // free-shipping threshold estimate so the cart drawer still tells
  // the buyer "you're $X away from free shipping" while browsing.
  const fallbackShipping =
    subtotal >= siteConfig.freeShippingThreshold ? 0 : 599
  const shipping = selectedShipping
    ? selectedShipping.rateAmount
    : withTotals
      ? 0 // unknown until address is entered
      : fallbackShipping
  const showEstimate = withTotals && !selectedShipping

  const tax = withTotals ? taxTotal : Math.round(subtotal * siteConfig.taxRate)

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
