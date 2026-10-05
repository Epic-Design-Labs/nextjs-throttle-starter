import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { siteConfig } from "@/lib/config"
import { CategoryView } from "../../category-view"
import { BrandView } from "../../brand-view"
import { listingHref } from "../../listing-href"
import {
  listingPageParams,
  loadBrandListing,
  loadCategoryListing,
  resolveSlugKind,
} from "../../listing"

/**
 * Pages 2..N of a category or brand listing: /{slug}/page/{n}.
 *
 * Why a nested route instead of `/{slug}?page=n`: `[slug]` serves products,
 * categories AND brands from one route, and reading a search param anywhere in
 * it opts the ENTIRE route into dynamic rendering - every product page becomes
 * an on-demand render to pay for pagination it does not have. Path URLs also
 * give crawlers something stable to follow.
 *
 * Page 1 lives at /{slug}. /{slug}/page/1 is redirected there by a rule in
 * src/lib/redirects.ts - it cannot be handled here, because `dynamicParams`
 * is false and generateStaticParams only emits n >= 2, so the request 404s
 * before any page code runs.
 */

interface PageNProps {
  params: Promise<{ slug: string; n: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  return listingPageParams()
}

/** Parse `n` strictly: "2" is a page, "02", "2.5", "-2" and "abc" are not. */
function parsePageNumber(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) ? n : null
}

export async function generateMetadata({
  params,
}: PageNProps): Promise<Metadata> {
  const { slug, n } = await params
  const page = parsePageNumber(n)
  if (page === null) return { title: "Not Found" }

  const kind = await resolveSlugKind(slug)
  const listing =
    kind === "category"
      ? await loadCategoryListing(slug, page)
      : kind === "brand"
        ? await loadBrandListing(slug, page)
        : null

  if (!listing) return { title: "Not Found" }

  const name =
    "category" in listing ? listing.category.name : listing.brand.name
  const description =
    "category" in listing
      ? listing.category.description
      : listing.brand.description

  // Canonical points at this page, not at page 1: these are different sets of
  // products, and collapsing them hides pages 2..N from search entirely.
  return {
    title: `${name} - Page ${page}`,
    description,
    alternates: { canonical: listingHref(slug, page) },
    openGraph: {
      title: `${name} - Page ${page}`,
      description,
      type: "website",
      url: `${siteConfig.url}${listingHref(slug, page)}`,
    },
  }
}

export default async function ListingPage({ params }: PageNProps) {
  const { slug, n } = await params
  const page = parsePageNumber(n)
  if (page === null) notFound()

  const kind = await resolveSlugKind(slug)

  if (kind === "category") {
    const listing = await loadCategoryListing(slug, page)
    // An in-range slug with an out-of-range page is a 404, not an empty grid:
    // an empty page that returns 200 is a soft 404, and crawlers index it.
    if (listing && page <= listing.pagination.totalPages) {
      return (
        <CategoryView
          category={listing.category}
          products={listing.products}
          pagination={listing.pagination}
          subcategories={listing.subcategories}
          ancestors={listing.ancestors}
        />
      )
    }
  }

  if (kind === "brand") {
    const listing = await loadBrandListing(slug, page)
    if (listing && page <= listing.pagination.totalPages) {
      return (
        <BrandView
          brand={listing.brand}
          products={listing.products}
          pagination={listing.pagination}
        />
      )
    }
  }

  notFound()
}
