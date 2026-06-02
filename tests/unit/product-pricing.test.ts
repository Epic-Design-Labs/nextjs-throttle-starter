import { describe, it, expect } from "vitest"
import { jsonProductRepository } from "@/lib/repositories/json-product-repository"

// The cart routes resolve a variant's price from the catalog (never the
// client) — these lock that the resolver returns the right variant so
// server-side pricing can't silently break.
describe("productRepository.findVariant (server-side pricing source)", () => {
  it("resolves a known variant with a numeric catalog price", async () => {
    const resolved = await jsonProductRepository.findVariant("var-1-1")
    expect(resolved).not.toBeNull()
    expect(resolved!.variant.id).toBe("var-1-1")
    expect(typeof resolved!.variant.price).toBe("number")
    expect(resolved!.variant.price).toBeGreaterThan(0)
    // the variant belongs to the returned product
    expect(resolved!.product.variants.some((v) => v.id === "var-1-1")).toBe(true)
  })

  it("returns null for an unknown variant id", async () => {
    expect(await jsonProductRepository.findVariant("does-not-exist")).toBeNull()
  })

  it("returns the same price the catalog holds", async () => {
    const resolved = await jsonProductRepository.findVariant("var-1-1")
    const direct = (
      await jsonProductRepository.getById(resolved!.product.id)
    )?.variants.find((v) => v.id === "var-1-1")
    expect(resolved!.variant.price).toBe(direct!.price)
  })
})
