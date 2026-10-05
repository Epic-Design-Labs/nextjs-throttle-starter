import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { toCents } from "@/lib/repositories/api-product-repository.template"

// The template's job is to make the right thing the default thing. A previous
// build had fetchWithRetry sitting in the repo, tested, while the new adapter
// hand-rolled a bare fetch with no retry - the helper was present, correct and
// invisible. These lock the parts of "the documented path" that can rot
// silently: the wiring, and the money parsing it ships with.

const source = readFileSync(
  "src/lib/repositories/api-product-repository.template.ts",
  "utf8"
)

describe("adapter template wiring", () => {
  it("routes its fetches through fetchWithRetry, not bare fetch", () => {
    expect(source).toContain("fetchWithRetry(")
    expect(source).toContain('from "@/lib/http/fetch-with-retry"')
    // No bare `fetch(` call outside the helper import.
    expect(/[^a-zA-Z]fetch\(/.test(source.replace(/fetchWithRetry\(/g, ""))).toBe(
      false
    )
  })

  it("reads per-adapter retry tuning from the environment", () => {
    expect(source).toContain("fetchRetryOptionsFromEnv(")
  })

  it("tags its Data Cache entries so a webhook can purge them", () => {
    expect(source).toContain("CATALOG_CACHE_TAG")
    expect(source).toContain("tags: [CATALOG_CACHE_TAG]")
  })

  it("dedupes within a render with React cache()", () => {
    expect(source).toContain('from "react"')
    expect(source).toContain("cache(")
  })
})

describe("toCents", () => {
  it("parses a decimal string exactly", () => {
    // parseFloat("66.34") * 100 is 6633.999999999999.
    expect(toCents("66.34")).toBe(6634)
    expect(toCents("0.01")).toBe(1)
    expect(toCents("1234.5")).toBe(123450)
  })

  it("handles integers and numbers", () => {
    expect(toCents("10")).toBe(1000)
    expect(toCents(10)).toBe(1000)
    expect(toCents(66.34)).toBe(6634)
  })

  it("returns null for absence rather than 0", () => {
    // The caller turns null into an unpriced state. Returning 0 here is how a
    // storefront ends up advertising a free product.
    expect(toCents(null)).toBeNull()
    expect(toCents(undefined)).toBeNull()
    expect(toCents("")).toBeNull()
  })

  it("returns null for junk instead of guessing", () => {
    expect(toCents("call for pricing")).toBeNull()
    expect(toCents("12.34.56")).toBeNull()
    expect(toCents(Number.NaN)).toBeNull()
  })

  it("truncates beyond two decimal places rather than rounding up a charge", () => {
    expect(toCents("1.999")).toBe(199)
  })
})
