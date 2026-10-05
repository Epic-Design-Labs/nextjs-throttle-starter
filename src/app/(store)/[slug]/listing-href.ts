/**
 * Path for page `n` of a category or brand listing.
 *
 * Page 1 is the bare slug: a /{slug}/page/1 that duplicates /{slug} splits its
 * own ranking and gives crawlers two URLs for one thing.
 *
 * Kept in its own module (no `server-only`) because the listing views import it
 * to build pagination links, while the data loaders in ./listing.ts are
 * server-only.
 */
export function listingHref(slug: string, page: number): string {
  return page <= 1 ? `/${slug}` : `/${slug}/page/${page}`
}
