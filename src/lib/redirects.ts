// ============================================================================
// Redirects — Single source of truth for URL redirects.
// Consumed by next.config.ts at build/runtime.
//
// Use `permanent: true` for 301 (SEO — search engines will update their index).
// Use `permanent: false` for 302 (temporary redirects).
//
// Patterns use path-to-regexp syntax, same as Next.js rewrites.
// See: https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects
// ============================================================================

export interface RedirectRule {
  source: string
  destination: string
  permanent: boolean
}

export const redirects: RedirectRule[] = [
  // Page 1 of a listing lives at the bare slug, so /{slug}/page/1 would be a
  // duplicate of /{slug} competing with it in search. It is handled here rather
  // than in the route because app/(store)/[slug]/page/[n] sets
  // `dynamicParams = false` and only generates n >= 2 - an in-route redirect
  // for page 1 could never run, the request 404s first.
  {
    source: "/:slug/page/1",
    destination: "/:slug",
    permanent: true,
  },

  // Legacy URL patterns from earlier ecommerce platforms — these are common
  // paths that Shopify, WooCommerce, etc. use. Uncomment as needed when
  // migrating from another platform.

  // Shopify-style product and collection URLs
  // {
  //   source: "/products/:slug",
  //   destination: "/:slug",
  //   permanent: true,
  // },
  // {
  //   source: "/collections/:slug",
  //   destination: "/:slug",
  //   permanent: true,
  // },
  // {
  //   source: "/collections/:category/products/:product",
  //   destination: "/:product",
  //   permanent: true,
  // },

  // WooCommerce-style
  // {
  //   source: "/product/:slug",
  //   destination: "/:slug",
  //   permanent: true,
  // },
  // {
  //   source: "/product-category/:slug",
  //   destination: "/:slug",
  //   permanent: true,
  // },

  // Generic common paths
  // {
  //   source: "/store",
  //   destination: "/shop",
  //   permanent: true,
  // },
  // {
  //   source: "/catalog",
  //   destination: "/shop",
  //   permanent: true,
  // },

  // One-off product renames — add your own as SKUs change
  // {
  //   source: "/old-product-name",
  //   destination: "/new-product-name",
  //   permanent: true,
  // },
]
