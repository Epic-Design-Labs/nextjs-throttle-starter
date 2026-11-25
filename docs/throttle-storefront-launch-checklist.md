# Throttle storefront launch checklist

For whoever launches the next headless Throttle storefront, a Claude agent or a developer. It combines two launches:

- **OCO** (ocoindustrial.com, launched 2026-11-06) and its week of fixes.
- **Select Equipment** (selectequipment.net, prelaunch QA 2026-11-12 to 11-25).

Each item says what to do, **Why** it is here (the incident behind it), and **Check** (how to confirm it). Work top to
bottom. Load, SEO and monitoring work is cheapest before the domain goes live.

**How to use it**
- Copy this file into the project as `docs/launch-checklist.md`. Mark each item done with the PR number, or
  `n/a, because …`. A storefront without shipping, stock or a migration skips whole sections; say so once.
- Anything new you learn goes into `docs/STARTER-IMPROVEMENTS.md`, and the general lesson comes back here.
- **Not in the starter yet (2026-11-25):** several helpers named below were built in
  `Epic-Design-Labs/throttle-selectequipment`. Port them from there until they land here:
  - `openGraph()` and the default link-preview image (`src/lib/og.ts`, PR #25);
  - the legacy-redirect map and its test (`src/lib/legacy-redirects.ts`, PR #27);
  - `ProductLink`, `clampMetaDescription` and `npm run verify:throttle` (PR #28).

  The checkout and cart-safety items in §6 are tracked in that repo's `docs/STARTER-IMPROVEMENTS.md`, §S.

---

## 0. Ground rules for the agent

- [ ] Read `AGENTS.md`, `docs/STARTER-IMPROVEMENTS.md` and your memory directory before planning anything.
- [ ] Use the Node version the project pins (`.nvmrc`, `engines`), e.g. `24.x`, not `>=`.
  - **Why:** a range let Vercel build on the newest major. Vitest on the wrong Node fails at startup with `ERR_REQUIRE_ESM`, which looks like a broken test suite.
  - Regenerate lockfiles with the npm version CI uses; npm 11 lockfiles failed `npm ci` on npm 10.
- [ ] Never run a bare `next dev`.
  - **Why:** Next 16 leaks memory and has frozen machines.
  - Use the guarded `npm run dev`. Verify on `next build && next start`, never on dev: prefetching and caching only behave for real in production.
- [ ] Never print secrets: Throttle keys, quote tokens, webhook secrets, `CRON_SECRET`, Sentry tokens, PIM keys. Use `npm run verify:throttle`, which reports modes and statuses only.
- [ ] Test credentials and test payments only on localhost or a named test host, never on production.
- [ ] Ask before:
  - merging;
  - any outward-facing action (DNS, firewall publish, Search Console, emails to the client);
  - any change to Throttle production settings;
  - anything that writes to the client's live inventory.
- [ ] Back up every remote config (Throttle embed, shipping and tax config; DNS) before changing it. Save the JSON to the session scratchpad.
- [ ] **Check the Throttle workspace before every dashboard action.**
  - **Why:** the dashboard opens on the last workspace used. At Select it opened on another client's app, in **Production**.
  - Switch with the top-left workspace picker, and confirm the name and the Test/Production badge.
- [ ] Every change is a PR against `main`. Don't stack PRs.
  - **Why:** a stacked PR merged into its old base and never reached production.

## 1. Business decisions, in writing (T-2 weeks)

Ask once, record the answers in memory, and don't ask again. Where a platform is being replaced, **read its admin
before asking**; "copy what the old site does" is the usual answer.

- [ ] **Tax:** which states, which rate, and whether shipping is taxed.
  - **Why:** OCO charges Texas only (8.25%). Select charges Indiana only (7%, shipping untaxed). Both were read from the old BigCommerce admin (Settings → Tax → zones and rates). Sample a few products' tax class too; "Non-Taxable Products" exists in every BigCommerce store, so its presence means nothing.
  - Ask about tax-exempt customers.
- [ ] **Shipping rules:** carriers, freight threshold, international, or none.
  - **Why:**
    - OCO: US freight only at 65 lb or more; elsewhere UPS where available, otherwise freight.
    - Select: BigCommerce had every method off, so nothing is charged at checkout and freight is invoiced separately.
  - Confirm which one it is. Don't assume free shipping.
- [ ] **Return, warranty and free-shipping wording:** match the old site, or get the client's own text.
  - **Why:** the design and the starter claimed "30-day returns" and "free shipping over $75". Neither client offered either. The old site's own pages settled Select's warranty (2 years).
- [ ] **Old products and URLs that won't move:** dropped or redirected (§7).
- [ ] **Who records sales in the inventory system.**
  - **Why:** at OCO, Throttle sends orders to SkuVault, which feeds ShipStation. We nearly built a second recording path, which would have deducted stock twice.
- [ ] **Which inbox receives each form, and who checks it.**
- [ ] **Content source for every page:** copy from the old site, client supplies, or Epic drafts for approval. Drafts are marked as drafts (§4).
- [ ] **Domain:** apex or `www` as the canonical, who controls DNS, the launch date, and the date the old platform is cancelled. Hold DNS and SPF clean-up until after the cancellation.
- [ ] **Throttle subscription:** the trial end date, and who adds the payment method. Production must not lapse after launch.

## 2. Sweep for client requests (T-2 weeks, and again on launch day)

- [ ] Read every channel the client uses since the last sweep:
  - Slack (the client channel and internal project channels);
  - meeting notes (Gemini, Fathom, Claude meetings);
  - email from the client;
  - support tickets;
  - design comments, e.g. Figma "Ready for dev" frames and comments.
- **Why:** Select's request to carry their old series pages over arrived only in a Slack message two days before launch. A design built from meeting notes was replaced by the designer's final frame a day later. Wait for "Ready for dev".

## 3. Environments and keys (T-1 week)

- [ ] **Every Throttle value in Vercel Production belongs to the production store, not test:** `sk_live`, `pk_live`, store ID, quote form token.
  - **Why:** OCO's production quote token pointed at the test store's form for three days. The site answers `{submitted:true}` whichever store gets the request, so real buyer RFQs went to test unnoticed.
  - **Check:**
    1. Run `vercel env pull .env.production --environment=production`.
    2. Run `npm run verify:throttle -- .env.production`: modes match, the key authenticates, and the live origin is allowed.
    3. Submit one quote on production, find it in the production dashboard, and archive it.
- [ ] Production quote settings send notifications to the client's inbox.
- [ ] **Embed allowed origins include the live domain**, plus `storefrontBaseUrl` on the production embed config. The PUT body must omit `lineResolverInstallations`.
  - **Why:** an origin that isn't on the list gets `403 origin_not_allowed`, and the payment form never mounts. Test mode enforces the list too.
- [ ] **Customer accounts** turned on in the production environment.
- [ ] **Repeat the test environment's settings in production:** tax, shipping, payment methods, email templates.
  - **Why:** every setting is per environment, so production starts empty.
- [ ] Gotchas in Throttle's tax and shipping setup:
  - **Calculated tax** won't save until a shipping origin with a country is saved ("origin address with a countryCode is required").
  - Picking the origin country clears the street, city, state and postal fields, so fill them in after choosing the country.
  - The tax trigger is normally the shipping address.
- [ ] `NEXT_PUBLIC_BASE_URL` set to the canonical domain. `ALLOW_INDEXING` stays off until cutover.
- [ ] Secrets set in production:
  - `ORDER_CONFIRMATION_SECRET`;
  - the PIM webhook signing secret;
  - `THROTTLE_WEBHOOK_SECRET` if the Throttle webhook is registered (otherwise `/api/throttle/webhook` answers 500);
  - `CRON_SECRET` if crons exist.
- [ ] The PIM webhook is registered for the live domain.

## 4. Content and placeholders (T-1 week)

The starter ships demo content until something removes it.

- [ ] **No starter or demo content anywhere.** Scan for:
  - "starter", "Epic Design Labs" or the agency's email or GitHub on About or Contact;
  - demo blog posts;
  - the `/pages` demo, the retail FAQ and boilerplate policies;
  - placeholder prices, phone numbers and copy left in the design.
  - **Check:** a scripted text scan of every page in the sitemap, plus the header and footer.
- [ ] **Contact form really sends.** The starter's form showed "Message sent!" and sent nothing. File it as a Throttle quote request with a `source` (message-only requests are valid), with a `mailto:` fallback when quotes are off.
- [ ] **Policies, About and other legal pages:**
  - Use the client's copy, or an Epic draft based only on facts from the old site.
  - Show a visible "Draft — pending approval" notice, mark the page `noindex`, and leave it out of the sitemap until approved.
  - Don't invent rates, return windows or warranty lengths.
- [ ] **Marketing claims match the business:** the free-shipping threshold is `0` unless an offer exists; no "30-day returns" badge unless real; the warranty is as the client states it.
- [ ] **Content ported from the old site:**
  - Keep the old slugs where possible (e.g. blog posts).
  - Re-host every image: the old CDN goes away with the old platform. BigCommerce serves WebP under `.jpg` and `.png` names, so save files by their real type. `/stencil/original/` gives the full-size upload.
  - Check that the client's old content pages (series and landing pages) have a home on the new site.
- [ ] **Dead links:** the client decides whether each is hidden, linked to a placeholder or left as is. Record the decision.
- [ ] **Business details in one place** (`siteConfig`): phone (check against the live site), email, address.
- [ ] **Link previews:** every page has an Open Graph image. A page's `openGraph` replaces the layout's entirely, so use a shared `openGraph()` helper.

## 5. Catalog backend load: the launch-day outage

**What happened at OCO:** the PIM API, a single instance taking 3–9 s warm, went down within hours of
`ALLOW_INDEXING=true`. Scrapers sent about 1,500 page requests a minute, and every uncached page was a live API
call.

- [ ] **Measure the backend first:** warm and cold latency, a concurrent burst, the instance count. Record the numbers in `docs/`.
  - Select's MiniPim: product p50 about 150 ms; 20 concurrent reads at most 0.8 s.
- [ ] **Long cache windows with targeted purges:**
  - 24h for item detail and taxonomy, 1h for listings.
  - The PIM webhook purges by item, slug or SKU.
  - Never use a 60-second window, and never purge the whole catalog on one event.
  - Cart and checkout reads are fresh.
- [ ] **Product links prefetch on intent, not on sight** (`ProductLink`).
  - **Why:** Next prefetched every visible product card's full page (ISR pages count as static). One shopper scrolling 24 cards caused 24 uncached renders.
  - **Check:** in a production build, scroll a listing and see 0 product `_rsc` requests; hover one product and see that one only.
- [ ] **Build resilience:**
  - Prerender only navigation pages (categories and brands). Products render on first visit, then from cache.
  - A PIM failure at build ships with nothing prerendered instead of failing the deploy.
  - Never cache an empty shelf (`assertCatalogAvailable`).
  - Don't deploy while the backend is down: a new deployment starts with an empty page cache.
- [ ] **Bounded fan-out:** checkout re-pricing and listing reads are capped (e.g. 50 checkout lines), so no request can hit the PIM without limit.
- [ ] **robots.ts:** disallow `/*?*` and per-page-size variants; `Crawl-delay: 10` for heavy and AI crawlers; Googlebot and Bingbot unrestricted.
- [ ] **Firewall (Vercel WAF)**, staged before launch and published only with the user's OK:
  - a per-IP page limit of about 60 full page loads a minute, excluding `rsc` and verified Google and Bing;
  - a rate limit on `POST /api/throttle/checkout-session`;
  - log mode first.
  - Find abusive networks with `vercel metrics vercel.firewall_action.count --group-by asnName`. At OCO they were Tencent Cloud SG (AS132203) and Alibaba Cloud SG (AS45102).
- [ ] If the backend is slow, ask for capacity (a paid instance, a cache in front, a bulk endpoint) before adding workarounds.

## 6. Checkout, cart, shipping and stock

- [ ] **The server prices everything.**
  - **Why:** a $0.01 checkout request must still be charged the catalog price, and injected `unitPrice` or `name` on add-to-cart must be ignored. This was a critical bug at Select before the fix.
  - Re-check a reused cart at payment: lines that are gone or unpriced return a 400 naming them.
- [ ] **Carts are bound to the browser** with an HttpOnly, Secure, SameSite=Lax cookie scoped to `/api/throttle`.
  - **Check:** another browser's cart can't be read, changed, discounted or checked out; with no cookie or a forged one, those routes return 404.
- [ ] **Each cart line has the SKU as its `referenceId`, the weight in `metadata.weight` and the customer's name on the order.** Confirm it in the Throttle order view.
- [ ] **If carriers quote rates:**
  - Never ask a carrier for rates on an unweighted cart; answer 409 `cart_unweighted`.
  - **Why:** Throttle auto-disables a provider after 5 failed calculations. Stale pre-launch carts turned UPS off store-wide for about 2 hours.
  - **Check:** if a carrier disappears, look at its `consecutiveFailures` and re-verify it with `POST /shipping-tax/shipping-providers/{id}/verify`.
- [ ] Country picker only if the client ships internationally. UPS doesn't quote outside the US through Throttle yet.
- [ ] **Live stock check at checkout only**, never on page loads.
  - Respect the inventory API's rate limit (SkuVault allows 5 a minute), fall back to the catalog's stock, and never write sales from the site.
- [ ] **Checkout validation:**
  - a valid email and a 10-digit phone;
  - required address fields and a state dropdown;
  - a line cap and quantity at most 999;
  - unknown variants refused.
- [ ] **Guest orders** carry the email, billing address and customer, and the guest sees an itemized confirmation. Receipt and confirm requests are signed: forged, cross-site or malformed ones get 403 or 400.
- [ ] **The payment form shows a loading state.** Throttle's embed can take 10–15 s to appear.
- [ ] **No nested `<form>`s** (e.g. a discount input inside the checkout form). The browser drops the inner form, so "Apply" submits checkout.
- [ ] Handle `order.updated`; `order.completed` is retired. Log Throttle failures with Throttle's request ID.

## 7. SEO and migration

- [ ] **Redirect map 1: the old platform's URLs**, from:
  - the sitemap (pages, categories, brands);
  - its landing pages' links, because BigCommerce sitemaps leave out many category paths;
  - the old series and content pages.
  - Redirect only to a real equivalent: Google treats a redirect to an unrelated page as a soft 404.
  - Map catch-alls for old trees to the nearest landing page.
  - Never add a catch-all that shadows the new site's own routes, such as `/{slug}/page/2`.
  - Sources have no trailing slash: Next strips it first.
  - **Check:** every destination appears in the new sitemap, and a script follows sample old URLs to a 200.
- [ ] **Redirect map 2:** Search Console's "Not found (404)" export plus the old brand list, after launch. Old product URLs are looked up by SKU at request time, or fall back to search.
- [ ] **Sitemaps:**
  - `<lastmod>` on every URL;
  - each part under 50,000 URLs and valid XML;
  - no empty part when the backend is busy (fail and retry);
  - drafts and thin categories left out.
- [ ] **Thin categories** (5 items or fewer) are `noindex, follow`, unless they are designed as entry points (e.g. a series with 4 unit types). Decide per client.
- [ ] **Paged listings point canonical at themselves**, not page 1, and have their own titles. Pages past the end return a real 404.
  - **Why:** pointing pages 2 and beyond at page 1 hides their products from search.
  - Per-page-size variants are `noindex`.
- [ ] **Meta descriptions:** plain text, 160 characters or fewer (`clampMetaDescription`), on every data-driven page, the home page included.
  - **Why:** Bing flags anything longer, and PIM copy can carry HTML.
- [ ] **Every page** has a unique title, a description and a canonical. Private pages (`/cart`, `/wishlist`, `/search`, `/account`, quote links) are `noindex`.
- [ ] **Metadata in Next 16:** metadata is streamed to browsers but sent in `<head>` to bots, so test robots and meta tags with a bot user agent. `notFound()` in `generateMetadata` alone doesn't stop a 200; the page body must decide.
- [ ] **Internal links to categories:** related categories, a "Popular categories" block on the home page, and brand links.
  - **Why:** new category URLs sat at "Discovered – currently not indexed".
- [ ] **Structured data:**
  - Product data meets Google's merchant listing rules: an absolute image URL and no placeholder; price, availability, condition and brand; quote-only products have no `offers`.
  - `BreadcrumbList` matches the visible breadcrumbs; Organization and WebSite data is on the home page.
  - Every JSON-LD block goes through `serializeJsonLd`.
- [ ] **Search Console:**
  - Find the property type and the Google account that owns it.
  - Submit the sitemaps.
  - Request indexing for the top categories at about 10 a day, only with the user's OK.
- [ ] **Bing Webmaster Tools and IndexNow:**
  - Publish the key file.
  - Have the PIM webhook ping each changed product.
  - Run a daily cron for changed categories and brands (`CRON_SECRET`).
  - Do one full submission at launch. The first POST returns 403 until the key file is verified.
- [ ] Keep the old platform running until the redirects are confirmed in Search Console.

## 8. Monitoring (strongly recommended before DNS changes)

Not a launch blocker, but launching without it means diagnosing day-one problems blind. If it's skipped,
record that decision and who made it, and add it within the first week.

- [ ] **Sentry live before cutover.**
  - **Why:** at OCO it arrived on day 2, and the launch-day outage was diagnosed blind.
  - Use a production-only `/monitoring` tunnel (preview sites sit behind Vercel SSO), keep PII off, and upload source maps on production builds.
- [ ] **Alerts:** new or regressed production issues; 5 or more events in 15 minutes on `/checkout` or `/api/throttle/`. Filter known browser noise.
- [ ] **Reading errors:**
  - Check "users impacted" first; background revalidation and prefetches log errors that no visitor sees.
  - `/[slug].rsc` means a prefetch, not a page view.
  - Next 16 pages can't return a 503.

## 9. Security pass (T-3 days, scripted, against the preview)

- [ ] **Headers:**
  - HSTS (2 years, preload);
  - a CSP with `frame-ancestors 'none'` and no `unsafe-eval`;
  - `X-Frame-Options: DENY`, `nosniff` and `Referrer-Policy`;
  - HTTP redirects to HTTPS.
- [ ] **Probes, each returning the right refusal:**
  - price tampering (§6);
  - reading or changing another browser's cart (§6);
  - forged receipts (§6);
  - path traversal and query injection in IDs;
  - XSS in search;
  - cross-origin quote submissions;
  - bad PIM webhook signatures;
  - an open redirect after sign-in (`?next=//evil.example`).
- [ ] **Unknown URLs return a real 404,** including `/api/*`, with the site header and search. Quote and order links someone else holds are `noindex` and reveal nothing.

## 10. Functional QA pass (T-3 days on the preview with test keys; again on the live domain)

Run on `next build && next start` or the deployment. Record each result (pass, or the bug and its PR).

**Catalog and navigation**
- [ ] A script walks the category tree from the API, requests every `/{slug}`, and expects a 200 (or 200 with `noindex` for thin categories). Counts match.
- [ ] Every product is reachable (sitemaps, the A–Z directory, listings). Spot-check each sitemap part.
- [ ] No broken internal links or images, and every image has alt text. Record the speed (median and p95).
- [ ] **Search:**
  - relevant results for a SKU, a part number, a brand and a plain term;
  - Enter submits;
  - empty and no-results states;
  - measure cold and warm times with `curl -w %{time_total}`.
- [ ] **Sorting and filters** are correct, and combine and clear properly.
  - **Why:** at Select the products had no price of their own (prices live on the variants), so "Price: Low to High" put them in arbitrary order. Remove a sort the PIM can't support.
  - Filter URLs are not indexable.
- [ ] **Product options:**
  - Every combination resolves to the right SKU, price and stock, and unavailable ones are disabled.
  - The SKU added to the cart is the one selected.
  - On mobile, the price and the add/quote buttons stay visible.
- [ ] **Static and client pages** render real content (§4). Videos open in a privacy-respecting embed (`youtube-nocookie`). Library documents (PDFs) load and aren't huge on mobile.

**Cart and checkout**
- [ ] **Single-SKU and multi-SKU orders:** prices, tax and shipping are right on the confirmation page, and the Throttle order matches line by line: SKU references, quantities, unit prices, weights, shipping method, tax, address and customer name.
- [ ] **Discount codes** apply without reloading the page.
- [ ] **Tax:** a taxable address charges the configured rate, a non-taxable one charges $0, and exempt customers (if any) are handled.
- [ ] **Shipping:** each zone and weight band gets the expected options, a default is pre-selected, and a $0 freight option doesn't say "Free". If no shipping is charged, the copy says how freight is handled.
- [ ] **Stock:** more than the available quantity is capped or explained; checkout blocks oversold lines.

**Accounts**
- [ ] **Customer accounts:**
  - Sign up enforces the password rules and blocks invalid email.
  - Sign in shows a clear error for a wrong password.
  - Sign out works, and a protected page returns to sign-in with its return path kept.
  - Forgot, reset and verify-email pages work.
  - Every account tab renders, the profile and addresses save, and checkout prefills the signed-in buyer.
- [ ] **Order history** shows orders only after the email is verified, so test with a real inbox. Signed-out checkout still works.

**Quotes and forms**
- [ ] **Quotes:** single-SKU, multi-SKU and free-text requests each land in the right Throttle environment with their items and contact details, and notify the client's inbox.
- [ ] **Every form** (contact, quote, returns, newsletter, client-specific): submit each one and confirm it arrives with every field. Note who received each test.
- [ ] **Bot protection:** the honeypot stays empty and a minimum fill time is enforced. Invalid input is blocked, with clear messages.

**Layout and accessibility**
- [ ] **No horizontal scroll at 375 px** on key pages. The mobile menu opens, expands, navigates and closes.
- [ ] **Tap targets are at least 24 px**, including the footer links.
- [ ] **The `lang` attribute is set.**

## 11. Cutover day

- [ ] **Re-sweep client requests** (§2). Confirm the backend is healthy.
- [ ] **DNS:**
  - Apex A records plus a `www` CNAME, with the non-canonical host 308-redirecting to the canonical.
  - In Cloudflare, keep them DNS-only (grey cloud).
  - Never click "Add missing records" for the apex in Cloudflare Email Routing: it replaces the Google Workspace MX records.
- [ ] **Indexing:** `ALLOW_INDEXING=true` and redeploy (robots.txt is generated at build time).
- [ ] **Watch the first hour:**
  - Sentry;
  - firewall and traffic;
  - backend latency;
  - one category page, one product page, and add-to-cart through to payment.
- [ ] **Search engines:** submit the sitemaps to Search Console and Bing, and run the full IndexNow submission.
- [ ] **Live-domain smoke test:**
  - one real order, refunded;
  - one quote;
  - one contact message;
  - sign-in;
  - sample old URLs redirect;
  - `curl -sI https://<domain>/not-a-real-slug` returns 404;
  - robots.txt allows indexing.

## 12. Check-backs after launch

- [ ] **Day 1:**
  - new Sentry issues and how many users each affects;
  - firewall hits by network;
  - a real order end to end, through fulfillment;
  - shipping providers still enabled.
- [ ] **Day 3:**
  - the Search Console 404 report, which feeds redirect map 2;
  - Bing recommendations;
  - whether real form messages reached the client.
- [ ] **Day 7:**
  - indexing status of the requested categories;
  - remove any developer copies on form email;
  - resolve the Sentry noise.
- [ ] **Day 14, with the user's go-ahead:**
  - cancel the old platform;
  - tidy SPF, first checking which services send mail as the domain;
  - fold the project's findings into `docs/STARTER-IMPROVEMENTS.md` and this checklist.
