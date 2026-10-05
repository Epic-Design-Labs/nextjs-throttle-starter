import "server-only"

import {
  brandRepository,
  categoryRepository,
  productRepository,
} from "@/lib/repositories"
import { LISTING_PAGE_SIZE } from "@/lib/constants"
export { listingHref } from "./listing-href"
import type { Brand, Category, PaginatedResult, PaginationMeta, Product } from "@/types"

/**
 * Shared loaders for the two routes that render a catalog listing:
 *
 *   /{slug}            -> page 1        (app/(store)/[slug]/page.tsx)
 *   /{slug}/page/{n}   -> pages 2..N    (app/(store)/[slug]/page/[n]/page.tsx)
 *
 * Pagination lives in the PATH, never in a search param. `[slug]` serves
 * products, categories and brands from one route, and reading `searchParams`
 * anywhere in it would opt the WHOLE route into dynamic rendering - every
 * product page would become an on-demand render to pay for pagination it does
 * not have. Measured on a client build: 0 catalog paths prerendered with a
 * `?page=` read, all of them without it.
 *
 * Keeping the loaders here means the two routes cannot drift: same page size,
 * same slug resolution, same shape handed to the views.
 */

export type SlugKind = "product" | "category" | "brand"

/**
 * Decide what a slug refers to before fetching anything expensive.
 *
 * Category and brand lookups are served from a cached list - an in-memory
 * find, no network. Product detail may be a live backend call. Asking the
 * expensive question first means every category page view fires a
 * guaranteed-404 product lookup, twice per request (generateMetadata and the
 * page).
 *
 * Falls through to "product" when the slug is neither: only then is a network
 * call worth making, and a miss there is a genuine 404.
 *
 * Precedence note: a slug matching BOTH a category and a product resolves to
 * the category. Preserving the other precedence would mean always paying for
 * the product lookup, which is the cost being avoided.
 */
export async function resolveSlugKind(slug: string): Promise<SlugKind> {
  const [category, brand] = await Promise.all([
    categoryRepository.getBySlug(slug),
    brandRepository.getBySlug(slug),
  ])
  if (category) return "category"
  if (brand) return "brand"
  return "product"
}

function emptyMeta(page: number): PaginationMeta {
  return {
    total: 0,
    page,
    limit: LISTING_PAGE_SIZE,
    totalPages: 0,
    hasNext: false,
    hasPrev: page > 1,
  }
}

export interface CategoryListing {
  category: Category
  products: Product[]
  pagination: PaginationMeta
  subcategories: Category[]
  ancestors: Category[]
}

export async function loadCategoryListing(
  slug: string,
  page: number
): Promise<CategoryListing | null> {
  const category = await categoryRepository.getBySlug(slug)
  if (!category) return null

  const [result, subcategories, ancestors] = await Promise.all([
    productRepository.getByCategory(slug, {
      page,
      limit: LISTING_PAGE_SIZE,
    }),
    categoryRepository.getChildren(category.id),
    categoryRepository.getAncestors(category.id),
  ])

  return {
    category,
    products: result.items,
    pagination: result.pagination,
    subcategories,
    ancestors,
  }
}

export interface BrandListing {
  brand: Brand
  products: Product[]
  pagination: PaginationMeta
}

export async function loadBrandListing(
  slug: string,
  page: number
): Promise<BrandListing | null> {
  const brand = await brandRepository.getBySlug(slug)
  if (!brand) return null

  // ProductFilters has no `brand` field, so the brand's products are selected
  // here rather than by the repository. That means asking for a page large
  // enough to hold the whole catalog and slicing locally.
  //
  // This is fine for a file-backed catalog and WRONG against a real API, which
  // will cap the page size and return page 1 with a 200 - the same silent
  // truncation that affects app/sitemap.ts. Adding a brand filter (or a cursor)
  // to ProductRepository is the real fix; see the enumeration item in
  // docs/STARTER-IMPROVEMENTS.md.
  const all: PaginatedResult<Product> = await productRepository.list(
    undefined,
    undefined,
    { page: 1, limit: 10_000 }
  )
  const brandProducts = all.items.filter((p) => p.brandId === brand.id)

  const total = brandProducts.length
  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE))
  const start = (page - 1) * LISTING_PAGE_SIZE

  if (total === 0) {
    return { brand, products: [], pagination: emptyMeta(page) }
  }

  return {
    brand,
    products: brandProducts.slice(start, start + LISTING_PAGE_SIZE),
    pagination: {
      total,
      page,
      limit: LISTING_PAGE_SIZE,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}

/**
 * Every /{slug}/page/{n} worth prerendering: one entry per category and brand
 * per page BEYOND the first (page 1 lives at /{slug}). Returns nothing on a
 * catalog small enough to fit one page, which is the demo data's case.
 */
export async function listingPageParams(): Promise<
  { slug: string; n: string }[]
> {
  const [categories, brands, all] = await Promise.all([
    categoryRepository.list(),
    brandRepository.list(),
    productRepository.list(undefined, undefined, { page: 1, limit: 10_000 }),
  ])

  const params: { slug: string; n: string }[] = []

  for (const category of categories) {
    const { pagination } = await productRepository.getByCategory(category.slug, {
      page: 1,
      limit: LISTING_PAGE_SIZE,
    })
    for (let n = 2; n <= pagination.totalPages; n++) {
      params.push({ slug: category.slug, n: String(n) })
    }
  }

  for (const brand of brands) {
    const count = all.items.filter((p) => p.brandId === brand.id).length
    const totalPages = Math.ceil(count / LISTING_PAGE_SIZE)
    for (let n = 2; n <= totalPages; n++) {
      params.push({ slug: brand.slug, n: String(n) })
    }
  }

  return params
}
