import "server-only"

import { cache } from "react"
import {
  fetchRetryOptionsFromEnv,
  fetchWithRetry,
} from "@/lib/http/fetch-with-retry"
import type {
  PaginatedResult,
  PaginationParams,
  Product,
  ProductFilters,
  ProductRepository,
  ProductVariant,
  SortOption,
} from "@/types"

/**
 * TEMPLATE: ProductRepository backed by an HTTP catalog API.
 *
 * COPY THIS FILE when you point the storefront at a real catalog (PIM, CMS,
 * database-behind-an-API). Rename it to `<vendor>-product-repository.ts`, fill
 * in the three marked sections, and export it from `./index.ts` in place of the
 * JSON repository. Nothing imports this file as it stands, so it costs nothing
 * until you use it - but it compiles and type-checks with the rest of the app,
 * so it cannot rot silently.
 *
 * It exists because the opposite happened on a client build: the retry helper
 * in src/lib/http/ was already in the repo, with tests, and the new adapter
 * hand-rolled a bare `fetch` with no retry against a cold-starting instance.
 * The helper was present, correct, and invisible. So the default path now has
 * it wired in, and opting OUT is the thing that takes a decision.
 *
 * ---------------------------------------------------------------------------
 * ASK THE CATALOG TEAM ON DAY 0. All four changed type definitions on previous
 * builds, and all four are cheap to ask and expensive to discover:
 *
 *   1. Can an item exist with NO price?   -> map it to `unpriced: true`, never
 *      to 0 (see src/lib/pricing.ts). A 0 makes the store advertise a free
 *      product, and it reads as data rather than as an error.
 *   2. What does a REMOVED item return?   -> 404 and 410 mean different things.
 *      A sold one-off is a URL that was indexed and linked.
 *   3. Is money a number or a string?     -> "66.34" needs an exact parse, not
 *      `parseFloat * 100`. See toCents() below.
 *   4. Is long-form copy HTML or text?    -> `Product.body` is rendered with
 *      dangerouslySetInnerHTML and must only ever hold TRUSTED html. Plain text
 *      from an upstream system does not belong there.
 *
 * Also worth settling before you write the client: is CORS origin-locked (so
 * this must stay server-only), and is there a feed or cursor endpoint for
 * ENUMERATION? `list(..., { limit: 10_000 })` is not enumeration - a real API
 * caps the page size and returns page 1 with a 200, so the sitemap silently
 * ends up holding a fraction of the catalog.
 * ---------------------------------------------------------------------------
 */

const API_BASE = process.env.CATALOG_API_URL ?? ""
const API_KEY = process.env.CATALOG_API_KEY ?? ""

/** Per-adapter tuning: CATALOG_FETCH_MAX_ATTEMPTS / CATALOG_FETCH_TIMEOUT_MS. */
const retryOptions = fetchRetryOptionsFromEnv("CATALOG")

/** How long the Data Cache may serve a catalog response, in seconds. */
const REVALIDATE_SECONDS = Number(
  process.env.CATALOG_REVALIDATE_SECONDS ?? 300
)

/** Tag every catalog response so a webhook can purge them with revalidateTag. */
export const CATALOG_CACHE_TAG = "catalog"

/**
 * The single place this adapter talks to the network.
 *
 * Two layers of caching, and they do different jobs: React `cache()` dedupes
 * repeat calls within ONE render (generateMetadata and the page asking the same
 * question), while the Data Cache (`next: { revalidate, tags }`) persists across
 * requests and is what `revalidateTag(CATALOG_CACHE_TAG)` purges from a webhook.
 *
 * Every request goes through fetchWithRetry: bounded retries on 429/5xx and
 * network errors, exponential backoff with jitter, and a per-attempt timeout.
 * A transient upstream hiccup must not fail a page render or, worse, a whole
 * static build.
 */
const fetchCatalog = cache(async function fetchCatalog<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  if (!API_BASE) {
    throw new Error(
      "CATALOG_API_URL is not set - the catalog adapter cannot reach its backend."
    )
  }

  const response = await fetchWithRetry(
    `${API_BASE}${path}`,
    {
      ...init,
      headers: {
        accept: "application/json",
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
        ...init.headers,
      },
      // Tagged + revalidated, so a webhook can purge precisely.
      next: { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_CACHE_TAG] },
    },
    retryOptions
  )

  if (!response.ok) {
    // Surface the status: a 404 is a legitimate "no such product" the caller
    // turns into notFound(), while a 500 is an outage worth logging loudly.
    throw new CatalogHttpError(response.status, `${path} -> ${response.status}`)
  }

  return (await response.json()) as T
})

export class CatalogHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "CatalogHttpError"
  }
}

/**
 * Money, exactly. `parseFloat(x) * 100` is right for today's catalog and wrong
 * in general: 66.34 * 100 is 6633.999999999999, and a price one cent out is
 * invisible until an invoice disagrees with a cart.
 *
 * Returns null when the source says "no price", which the mapper turns into
 * `unpriced: true` rather than 0.
 */
export function toCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : null
  }
  const match = /^-?(\d+)(?:\.(\d{1,}))?$/.exec(value.trim())
  if (!match) return null
  const whole = match[1]
  const fraction = (match[2] ?? "").padEnd(2, "0").slice(0, 2)
  const cents = Number(whole) * 100 + Number(fraction)
  return value.trim().startsWith("-") ? -cents : cents
}

// ---------------------------------------------------------------------------
// SECTION 1 of 3: the shape your API actually returns. Replace it.
// ---------------------------------------------------------------------------

interface ApiProduct {
  id: string
  slug: string
  name: string
  description?: string
  /** Long-form copy. See Day-0 question 4 before mapping this to `body`. */
  longDescription?: string
  priceFinal: string | number | null
  currency?: string
  images?: { url: string; alt?: string }[]
  categoryIds?: string[]
  brandId?: string
}

interface ApiList<T> {
  items: T[]
  total: number
}

// ---------------------------------------------------------------------------
// SECTION 2 of 3: map their shape onto ours. This is where the Day-0 answers
// show up in code.
// ---------------------------------------------------------------------------

function toVariant(api: ApiProduct): ProductVariant {
  const cents = toCents(api.priceFinal)
  return {
    id: `${api.id}-default`,
    productId: api.id,
    sku: api.id,
    // "Default" is the sentinel the cart lines suppress. Filling this with the
    // product title prints the name twice in the drawer, cart and checkout.
    name: "Default",
    price: cents ?? 0,
    // The whole point of Day-0 question 1: absence is not zero. Uncomment the
    // next line once the `unpriced` state lands on ProductVariant (backlog A4);
    // until then an unpriced item from this adapter renders as $0.00, which is
    // precisely the bug that item exists to close.
    // unpriced: cents === null,
    currency: api.currency ?? "USD",
    inventory: { quantity: 0, trackInventory: false, allowBackorder: true },
    options: [],
    images: [],
  }
}

function toProduct(api: ApiProduct): Product {
  const now = new Date().toISOString()
  return {
    id: api.id,
    slug: api.slug,
    name: api.name,
    description: api.description ?? "",
    // `api.longDescription` is deliberately NOT mapped to `body`. `body` is
    // rendered with dangerouslySetInnerHTML and must hold TRUSTED HTML only -
    // mapping an upstream plain-text field into it makes it an XSS vector and
    // eats its newlines besides. Until the model grows a plain-text field
    // (longDescription, tracked in docs/STARTER-IMPROVEMENTS.md), either render
    // it yourself with `whitespace-pre-line` or escape it before assigning.
    images: (api.images ?? []).map((image) => ({
      url: image.url,
      alt: image.alt ?? api.name,
    })),
    categoryIds: api.categoryIds ?? [],
    brandId: api.brandId ?? "",
    variants: [toVariant(api)],
    status: "active",
    tags: [],
    rating: 0,
    reviewCount: 0,
    featured: false,
    createdAt: now,
    updatedAt: now,
  }
}

function emptyPage<T>(pagination?: PaginationParams): PaginatedResult<T> {
  const page = pagination?.page ?? 1
  const limit = pagination?.limit ?? 24
  return {
    items: [],
    pagination: {
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNext: false,
      hasPrev: page > 1,
    },
  }
}

// ---------------------------------------------------------------------------
// SECTION 3 of 3: the repository itself. Each method is one endpoint call plus
// the mapper above; none of them should need its own fetch logic.
// ---------------------------------------------------------------------------

export const apiProductRepository: ProductRepository = {
  async list(
    filters?: ProductFilters,
    sort?: SortOption,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Product>> {
    const page = pagination?.page ?? 1
    const limit = pagination?.limit ?? 24
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (filters?.category) query.set("category", filters.category)
    if (filters?.search) query.set("q", filters.search)
    if (sort) query.set("sort", String(sort))

    const data = await fetchCatalog<ApiList<ApiProduct>>(
      `/products?${query.toString()}`
    )
    const totalPages = Math.max(1, Math.ceil(data.total / limit))

    return {
      items: data.items.map(toProduct),
      pagination: {
        total: data.total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }
  },

  async getBySlug(slug: string): Promise<Product | null> {
    try {
      const data = await fetchCatalog<ApiProduct>(
        `/products/${encodeURIComponent(slug)}`
      )
      return toProduct(data)
    } catch (error) {
      // A missing product is an answer, not a failure. Anything else is an
      // outage and must keep throwing, or an empty page gets cached as truth.
      if (error instanceof CatalogHttpError && error.status === 404) return null
      throw error
    }
  },

  async getById(id: string): Promise<Product | null> {
    return this.getBySlug(id)
  },

  async getFeatured(limit = 8): Promise<Product[]> {
    const { items } = await this.list(undefined, undefined, { page: 1, limit })
    return items
  },

  async getByCategory(
    categorySlug: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Product>> {
    return this.list({ category: categorySlug }, undefined, pagination)
  },

  async search(
    query: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Product>> {
    if (!query.trim()) return emptyPage<Product>(pagination)
    return this.list({ search: query }, undefined, pagination)
  },

  async findVariant(variantId: string) {
    // Server-side pricing depends on this: the cart routes resolve the price
    // here and never trust the client. If your API has no variant endpoint,
    // derive the product id from the variant id as below rather than accepting
    // a price from the request body.
    const productId = variantId.replace(/-default$/, "")
    const product = await this.getById(productId)
    if (!product) return null
    const variant =
      product.variants.find((v) => v.id === variantId) ?? product.variants[0]
    return variant ? { product, variant } : null
  },
}
