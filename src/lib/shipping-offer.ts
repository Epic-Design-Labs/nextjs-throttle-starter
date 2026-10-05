import { siteConfig } from "@/lib/config"

/**
 * Is there a free-shipping offer to advertise at all?
 *
 * `freeShippingThreshold: 0` means the offer is OFF, not "every order
 * qualifies" - but `subtotal >= 0` is always true, so a numeric comparison
 * turns a disabled feature into two false claims: "Free shipping on orders over
 * $0.00" on every product page, and "Shipping: Free" plus a total the checkout
 * will not honour in the cart.
 *
 * General rule, worth applying beyond this one setting: a default of 0 or null
 * that means *disabled* must be checked for disabled-ness, never compared
 * numerically.
 */
export function freeShippingOffered(
  threshold: number = siteConfig.freeShippingThreshold
): boolean {
  return typeof threshold === "number" && threshold > 0
}

/** Does this subtotal clear the threshold? False whenever the offer is off. */
export function qualifiesForFreeShipping(
  subtotal: number,
  threshold: number = siteConfig.freeShippingThreshold
): boolean {
  return freeShippingOffered(threshold) && subtotal >= threshold
}
