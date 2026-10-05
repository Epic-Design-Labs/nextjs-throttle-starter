export const PLACEHOLDER_IMAGE = "/images/products/placeholder.png"

/**
 * At or below this on-hand quantity, the storefront shows an "Only N left"
 * low-stock nudge (for inventory-tracked variants that don't allow
 * backorder). Tune to taste.
 */
export const LOW_STOCK_THRESHOLD = 10

/**
 * Products per page on a category or brand listing.
 *
 * Pagination for those listings lives in the path (/{slug}/page/{n}), never in
 * a search param: `[slug]` serves products, categories and brands from one
 * route, and a single `searchParams` read there would opt every product page
 * into dynamic rendering.
 */
export const LISTING_PAGE_SIZE = 40
