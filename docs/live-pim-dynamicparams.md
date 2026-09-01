# Live-PIM catalogs: `dynamicParams` and the soft-404 trap

**TL;DR** — the starter ships `dynamicParams = false` on `src/app/(store)/[slug]/page.tsx`,
which returns correct 404s. If you flip it to `true` for live-PIM freshness, you
must also remove the route-level `loading.tsx` and verify existence *before*
streaming, or unknown URLs return **HTTP 200** with an empty product page.

## Why projects flip it

With `dynamicParams = false`, only the slugs returned by `generateStaticParams()`
exist; anything else 404s at request time. That is the right default for a
catalog you build from. But when the catalog lives in a PIM that editors update
all day, a product added after the last deploy 404s until the next build. So
projects set:

```ts
export const dynamicParams = true
```

…which lets an un-prerendered slug render on demand.

## The trap

`dynamicParams = true` plus a **route-level `loading.tsx`** produces soft-404s.
The sequence:

1. A request arrives for `/does-not-exist`.
2. Next matches the dynamic route and, because a `loading.tsx` exists, commits
   the response — **status 200, headers flushed** — and streams the skeleton.
3. Your resolver then fails to find the product and calls `notFound()`.
4. The 404 page content swaps in, but the status code is already 200.

Crawlers index the shell. Google reports soft-404s, and every typo'd URL becomes
an indexable empty page.

## The safe recipe

1. **Verify existence before streaming.** Resolve the slug in
   `generateMetadata()` (which runs before the response commits) and call
   `notFound()` there when the resolver returns null. Share one cached resolver
   between `generateMetadata` and the page — wrap it in React's `cache()` so the
   lookup happens once per request.

   ```ts
   const resolve = cache(async (slug: string) => productRepository.getBySlug(slug))

   export async function generateMetadata({ params }): Promise<Metadata> {
     const { slug } = await params
     const product = await resolve(slug)
     if (!product) notFound()          // real 404, before anything streams
     return { title: product.name }
   }
   ```

2. **Remove the route-level `loading.tsx`.** Delete
   `src/app/(store)/[slug]/loading.tsx`. Per-branch `<Suspense>` boundaries
   inside the page still give valid pages a streaming skeleton — you lose
   nothing except the premature 200.

3. **Keep the slow parts in Suspense.** Existence is cheap (one lookup);
   reviews, recommendations and inventory can stream behind their own
   boundaries.

## Verifying

```bash
curl -sI https://<preview-url>/definitely-not-a-real-slug | head -1
```

Must print `HTTP/2 404`. Do this on a **preview deploy**, not `next dev` — dev
and prod differ in when the response commits. Re-check after any change to
`loading.tsx`, `generateMetadata`, or the resolver.

## Trade-off

Verifying before streaming costs one blocking lookup on TTFB for every dynamic
page. That is the price of correct status codes; cache the resolver (React
`cache()` per request, plus a tagged Data Cache entry revalidated by PIM
webhooks) so it is a cache read in the common case.
