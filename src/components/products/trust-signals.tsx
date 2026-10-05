import { Truck, RotateCcw, Shield } from "lucide-react"
import { formatPrice } from "@/lib/utils"
import { siteConfig } from "@/lib/config"
import { freeShippingOffered } from "@/lib/shipping-offer"

export function TrustSignals() {
  // With the threshold at 0 the offer is off, and the line would read "Free
  // shipping on orders over $0.00" on every product page. Say nothing instead.
  const showFreeShipping = freeShippingOffered()

  return (
    <div className="space-y-3">
      {showFreeShipping && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Truck className="h-4 w-4" />
          <span>
            Free shipping on orders over{" "}
            {formatPrice(siteConfig.freeShippingThreshold)}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <RotateCcw className="h-4 w-4" />
        <span>30-day hassle-free returns</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>Secure checkout</span>
      </div>
    </div>
  )
}
