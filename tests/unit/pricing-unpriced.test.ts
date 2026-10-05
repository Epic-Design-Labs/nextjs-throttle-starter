import { describe, it, expect } from "vitest"
import {
  PRICE_ON_REQUEST,
  formatVariantPrice,
  hasSalePrice,
  isUnpriced,
} from "@/lib/pricing"
import type { ProductVariant } from "@/types"

// "Exists, but not priced yet" is a real catalog state. Mapping it to 0 makes
// the storefront advertise a free product, which reads as data rather than as
// an error - so these lock the distinction at every decision point.

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "var-1",
    productId: "prod-1",
    sku: "SKU-1",
    name: "Default",
    price: 12999,
    currency: "USD",
    inventory: { quantity: 5, trackInventory: true, allowBackorder: false },
    options: [],
    images: [],
    ...overrides,
  } as ProductVariant
}

describe("isUnpriced", () => {
  it("is false for an ordinary priced variant", () => {
    expect(isUnpriced(variant())).toBe(false)
  })

  it("is true when the adapter sets the flag", () => {
    expect(isUnpriced(variant({ unpriced: true }))).toBe(true)
  })

  it("is true for a null or undefined price even without the flag", () => {
    // An adapter that forgets the flag still must not render "$0.00"/"$NaN".
    expect(isUnpriced(variant({ price: null as unknown as number }))).toBe(true)
    expect(isUnpriced(variant({ price: undefined as unknown as number }))).toBe(true)
  })

  it("treats a genuine zero price as a price, not as absence", () => {
    // A free item is a claim the merchant made. Absence is not.
    expect(isUnpriced(variant({ price: 0 }))).toBe(false)
  })

  it("is true for a missing variant", () => {
    expect(isUnpriced(null)).toBe(true)
    expect(isUnpriced(undefined)).toBe(true)
  })
})

describe("formatVariantPrice", () => {
  it("formats a real price", () => {
    expect(formatVariantPrice(variant({ price: 12999 }))).toBe("$129.99")
  })

  it("renders the request label instead of a figure when unpriced", () => {
    expect(formatVariantPrice(variant({ unpriced: true }))).toBe(PRICE_ON_REQUEST)
    expect(formatVariantPrice(variant({ unpriced: true }))).not.toContain("$")
  })

  it("never renders $0.00 for a null price", () => {
    expect(formatVariantPrice(variant({ price: null as unknown as number }))).toBe(
      PRICE_ON_REQUEST
    )
  })
})

describe("hasSalePrice", () => {
  it("is true when compareAtPrice is above the price", () => {
    expect(hasSalePrice(variant({ price: 8000, compareAtPrice: 10000 }))).toBe(true)
  })

  it("is false when compareAtPrice is absent or not higher", () => {
    expect(hasSalePrice(variant({ price: 10000 }))).toBe(false)
    expect(hasSalePrice(variant({ price: 10000, compareAtPrice: 9000 }))).toBe(false)
  })

  it("is false for an unpriced variant carrying a stray compareAtPrice", () => {
    // Otherwise the PDP shows a strikethrough and a "% off" badge computed
    // against a price that does not exist.
    expect(
      hasSalePrice(variant({ unpriced: true, compareAtPrice: 10000 }))
    ).toBe(false)
  })
})
