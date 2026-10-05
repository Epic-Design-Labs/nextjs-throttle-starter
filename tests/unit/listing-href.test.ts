import { describe, it, expect } from "vitest"
import { listingHref } from "@/app/(store)/[slug]/listing-href"

describe("listingHref", () => {
  it("sends page 1 to the bare slug, not /page/1", () => {
    // A /{slug}/page/1 that duplicates /{slug} competes with it in search.
    expect(listingHref("home-kitchen", 1)).toBe("/home-kitchen")
  })

  it("puts later pages in the path, never a query string", () => {
    // A `?page=` read on the [slug] route would opt every product page into
    // dynamic rendering, which is the whole reason this helper exists.
    expect(listingHref("home-kitchen", 2)).toBe("/home-kitchen/page/2")
    expect(listingHref("home-kitchen", 11)).toBe("/home-kitchen/page/11")
  })

  it("treats 0 and negatives as page 1 rather than emitting a bad path", () => {
    expect(listingHref("brand-x", 0)).toBe("/brand-x")
    expect(listingHref("brand-x", -3)).toBe("/brand-x")
  })
})
