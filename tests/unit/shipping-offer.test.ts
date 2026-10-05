import { describe, it, expect } from "vitest"
import {
  freeShippingOffered,
  qualifiesForFreeShipping,
} from "@/lib/shipping-offer"
import { siteConfig } from "@/lib/config"

// `freeShippingThreshold: 0` means the offer is OFF. The bug this locks is a
// numeric comparison against it: `subtotal >= 0` is true for every order, so a
// disabled feature advertised itself as "free shipping on orders over $0.00"
// and promised free shipping the checkout would not honour.

describe("freeShippingOffered", () => {
  it("is false at 0 - that is disabled, not a threshold everyone clears", () => {
    expect(freeShippingOffered(0)).toBe(false)
  })

  it("is true for a real threshold", () => {
    expect(freeShippingOffered(7500)).toBe(true)
  })

  it("is false for a negative or non-numeric threshold", () => {
    expect(freeShippingOffered(-1)).toBe(false)
    expect(freeShippingOffered(null as unknown as number)).toBe(false)
    expect(freeShippingOffered("7500" as unknown as number)).toBe(false)
  })

  it("falls back to the configured threshold when called with no argument", () => {
    // Passing `undefined` triggers the default parameter, so this asserts the
    // fallback, NOT that undefined means disabled. (Written the other way
    // round first, it passed or failed purely on what siteConfig happened to
    // hold.)
    expect(freeShippingOffered()).toBe(
      freeShippingOffered(siteConfig.freeShippingThreshold)
    )
  })
})

describe("qualifiesForFreeShipping", () => {
  it("never qualifies while the offer is off, however large the order", () => {
    expect(qualifiesForFreeShipping(0, 0)).toBe(false)
    expect(qualifiesForFreeShipping(1_000_000, 0)).toBe(false)
  })

  it("qualifies at or above a real threshold", () => {
    expect(qualifiesForFreeShipping(7500, 7500)).toBe(true)
    expect(qualifiesForFreeShipping(9999, 7500)).toBe(true)
  })

  it("does not qualify below it", () => {
    expect(qualifiesForFreeShipping(7499, 7500)).toBe(false)
  })
})
