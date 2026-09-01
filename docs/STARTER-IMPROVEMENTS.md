# Starter Improvements — work list

> **What it is:** a living, actionable backlog of starter changes distilled from real client builds.
> **How to use it (Claude Code or a dev):** work top-down by priority; for each task, make the change in the
> listed files, satisfy the **Done-when** check, then tick the box and note the PR. Append new findings after
> every project (see "Feeding this file" at the bottom).
> **First source:** the *throttle-exponetusa* (ExpoNet USA) engagement, 2026.

**Status legend:** `MISSING` (not in starter) · `PARTIAL` (present but incomplete) · `HAVE` (already correct — kept for the record).
**Guardrail:** the starter must stay **vendor-neutral** — core = commerce/catalog/checkout; every vendor integration is an **optional, env-gated, removable module** (see §C). Don't bake a connector in as an always-on default.

**Review pass 2026-09-01:** the whole list was checked against the repo before any code was written; corrections
are inline below and the blocking findings are in [§F Review notes](#f-review-notes-2026-09-01). §A, §B2–B4, §D
and §E landed in that pass. §B1 and §C are **deferred with decisions recorded** — read §F before starting them.

---

## A. P0 — connector-agnostic fixes (do first)

- [x] **A1 · Migrate `middleware.ts` → `proxy.ts`** — status: **DONE** (2026-09-01)
  - Why: Next 16 renamed the convention; `next build` warns on `middleware`. Clerk ≥7.4 accepts `proxy` on Next 16.
  - Done: `src/middleware.ts` → `src/proxy.ts` (`config.matcher` and the `clerkMiddleware` default export
    unchanged); references updated in `src/app/api/throttle/orders/route.ts`, `README.md`, `docs/CUSTOMIZATION.md`.
  - Verified: `next build` completes with no middleware-deprecation warning. Auth gating on a preview still
    needs a deploy check.
  - Note: a codemod exists — `npx @next/codemod@canary middleware-to-proxy .`

- [x] **A2 · Drop `'unsafe-eval'` + make the CSP connector-composed (+ `media-src`)** — status: **DONE (base)** (2026-09-01)
  - Why: nothing in the prod bundle needs `unsafe-eval`; and the CSP should grow only for **enabled** connectors,
    not ship a fixed superset. A missing `media-src` blocked a Zendesk `.mp3` on the source project.
  - Done in `src/proxy.ts`: `'unsafe-eval'` removed; `media-src 'self' data: blob: https:` added; `vercel.live`
    moved into a preview-only fragment gated on `VERCEL_ENV !== "production"`; the header is now **composed** by
    `composeCsp()` from a `baseCsp` directive map plus fragments, with an empty `connectorCsp: CspDirectives[]`
    array where each module registers its origins.
  - **Constraint for module authors:** a module's CSP fragment must live in a leaf `csp.ts` with **zero imports**.
    Next's docs are explicit that proxy runs separately from render code and "should not attempt relying on
    shared modules or globals" — importing anything that reaches `server-only` or a vendor SDK breaks or bloats
    the proxy bundle.
  - Done-when (remaining): `curl -sI` a preview and confirm the composed header; re-check after the first
    connector registers a fragment.

- [x] **A3 · SSG concurrency throttle in `next.config.ts`** — status: **DONE (documented; concurrency commented)** (2026-09-01)
  - Why: mass `generateStaticParams` over a large catalog saturates the PIM at build → 60s timeouts, failed
    builds, and live React #419/#441.
  - Done: `staticPageGenerationTimeout: 120` is **active** (a ceiling, harmless with local demo data);
    `experimental.staticGenerationMaxConcurrency: 3` ships **commented** with a "tune per project" note —
    throttling to 3 only slows builds while the repositories read local JSON, and the option is experimental.
    Uncomment it in the project PR that points the repositories at a live API.
  - Flag names verified against `node_modules/next/dist/docs/.../staticGeneration.md` (16.2.3).

- [x] **A4 · Shared adapter `fetchWithRetry` (retry + timeout + backoff)** — status: **DONE** (2026-09-01)
  - Done: `src/lib/http/fetch-with-retry.ts` — retries 408/425/429/5xx and network errors, exponential backoff
    with jitter, **per-attempt** `AbortController` timeout, `Retry-After` support (seconds or HTTP-date, capped),
    `FetchRetryError` on exhausted network failures, and `fetchRetryOptionsFromEnv("PREFIX")` reading
    `<PREFIX>_FETCH_MAX_ATTEMPTS` / `<PREFIX>_FETCH_TIMEOUT_MS`.
  - **Non-idempotent methods are not retried** unless the caller passes `retryNonIdempotent: true` — retrying a
    POST can double-charge or duplicate an order. The source project's inline loop had no such guard.
  - Covered by `tests/unit/fetch-with-retry.test.ts` (12 cases: transient 503 recovers, persistent 503 surfaces,
    404 not retried, `Retry-After` honoured and capped, per-attempt timeout, caller-abort propagated, POST guard).
  - **It has no callers yet** — the demo repositories read local files, so there is no outbound HTTP in the
    starter. Route the first real adapter's fetches through it (§C1) and document it in the §13.1 adapter contract.
  - Note: **empty-but-200 is NOT retried** (a tested, documented non-behaviour) — it is indistinguishable from a
    legitimately empty collection. For *critical* data (nav categories) the caller must treat an unexpected empty
    as retryable or serve last-good, or an SSG page bakes an empty nav.

---

## B. P1 — hardening & optional capability modules

- [ ] **B1 · Order-security route hardening** — status: **PARTIAL — deferred, see §F.1/§F.2**
  - Why: prevent IDOR and stale/altered prices; support guest receipts.
  - **This is not a mechanical backport.** The source project creates the order *before* the embed
    (`checkoutCart()`), so `session.orderId` exists at session-creation time. This starter uses **cart-backed
    sessions** (commit 466ea02) where the order does not exist until payment capture. Decision recorded:
    **re-implement on the cart-backed flow**, do not revert the checkout architecture.
  - Landing order matters — all three in one PR:
    1. **Customer linking.** `CreateCartInput` has no `customerId`, there is no `setCartCustomer()`, and
       `createSession` never passes one, so orders placed through the starter are unlinked. Add all three
       (`carts.update(cartId, { customerId })`), taking the id from the session, never the request body.
    2. **Guest receipt.** Port `signConfirmationToken` / `verifyConfirmationToken` plus a public
       `/api/checkout/confirmation` returning receipt-safe fields only. The token must be bound to the
       **checkout session** (server resolves session → order) or minted from the `order.completed` webhook —
       minting from a client-supplied order id would let anyone mint a token for any order. Keep the starter's
       `getOrderConfirmation()` (it hydrates line items from the backing cart); the source project's `getOrder()`
       would drop line items here.
    3. **Deny-by-default ownership** on `/api/throttle/orders/[id]` → 404 unless `orderCustomerId` equals
       `user.throttleCustomerId`. Tightening this *before* (1) and (2) would 404 buyers out of their own orders
       and break the success page for everyone.
  - Price preservation is largely **HAVE**: `/api/throttle/cart/[cartId]/items` already prices from the
    server-side catalog and never accepts a client `unitPrice`. The source project's additions there are
    modifier pricing, which this starter has no concept of — do not port.
  - Done-when: a second user cannot fetch another's order; an altered client price is rejected; a guest can view
    a receipt only with a valid token; a signed-in buyer still sees their own fresh order and their order history.

- [x] **B2 · Soft-404 recipe for live-PIM (`dynamicParams=true`)** — status: **HAVE (default) + DOCUMENTED** (2026-09-01)
  - Done: default `dynamicParams = false` kept; `docs/live-pim-dynamicparams.md` documents the safe variant
    (verify existence in `generateMetadata` before streaming; delete the route-level `loading.tsx`; keep
    per-branch `<Suspense>`), and `src/app/(store)/[slug]/page.tsx` points at it.
  - Done-when (remaining): with the recipe applied on a project, an unknown slug returns a real **404** on a
    preview deploy (`curl -sI`), not in `next dev`.

- [x] **B3 · `MarkdownContent` — add `gfm={false}` option** — status: **was MISSING, DONE** (2026-09-01)
  - Done: `src/components/content/markdown-content.tsx` takes `gfm?: boolean` (default `true`) toggling
    `remark-gfm`. Explicit `[text](url)` links still work with it off.
  - The source project's version also adds heading ids and Vimeo/Sketchfab embed upgrades — project-specific,
    deliberately not ported.

- [x] **B4 · HTML `/sitemap` page** — status: **was MISSING, DONE** (2026-09-01)
  - Done: `src/app/(store)/sitemap/page.tsx` (main links, info, account, policies, and shop-by-category from
    `categoryRepository` with a `.catch(() => [])` degrade, plus a link to `/sitemap.xml`); "Sitemap" added to
    the footer's company column (it was missing entirely) and to `app/sitemap.ts`'s static paths.
  - Verified: `/sitemap` returns 200 and lists the sections; no route collision with `app/sitemap.ts`
    (`/sitemap.xml`).

---

## C. P1 (core structural) — reusable **optional connector modules**

**Status: deferred as a set.** Projects keep re-hand-rolling the same EDL connectors (the source project rebuilt
MiniPim, Evident, Zendesk, quotes, mailer from scratch → hardcoding plus "baked-in-and-left" risk). Ship them as
**first-party opt-in modules**.

**Module contract (every connector must follow):**
1. **Self-contained:** `src/lib/<connector>/` (plus its components and its API routes) — no entanglement with core cart/catalog/checkout.
2. **Env-gated:** presence of its keys enables it; absence = fully off (no errors, no console noise, no half-rendered UI).
3. **CSP fragment:** each module **exports its CSP additions** from a leaf `csp.ts` with **zero imports**;
   `proxy.ts` composes the final CSP from enabled modules only (A2).
4. **Removable:** ships with a one-paragraph **"To remove this connector"** note (files, env, and CSP to delete).
5. **Adapter-conformant** where applicable (implements the §13.1 SOP contract).
6. **Dependency policy (decided 2026-09-01):** vendor SDKs go in **`optionalDependencies`** and are reached via
   dynamic `import()` behind the env gate — a fresh clone must not install MiniPim/Resend/quotes SDKs for
   modules that are off. Each module's note states the `npm i` line that enables it.

- [ ] **C1 · MiniPim PIM adapter module** — status: **MISSING** (starter ships json/markdown demo repos only)
  - `@minipim/sdk`, `MINIPIM_API_KEY` / `MINIPIM_ORGANIZATION_ID` / `MINIPIM_CHANNEL`, two-layer cache (React
    `cache()` plus tagged Data Cache plus webhook `revalidateTag`), `fetchWithRetry` (A4), `CATEGORY_SCOPE`.
    Implements `getProducts` / `getProductBySlug` / `getMenu`. (Port from *throttle-exponetusa*
    `src/lib/minipim/*` plus `repositories/minipim-*` — roughly 1,500 LOC across client/catalog/content/mappers/cache.)
  - Land A4's first real caller here: replace the source project's inline retry loop in `minipim/client.ts` with
    `fetchWithRetry(url, init, fetchRetryOptionsFromEnv("MINIPIM"))`.
- [ ] **C2 · Evident reviews/UGC module** — status: **MISSING**
  - Async loader (in layout when enabled), PDP mounts by SKU, `order.completed` review request; **exports CSP
    fragment** (`app.evidentugc.com`); **runbook note:** allow-list the site's origins in the Evident dashboard
    (CORS) — stable prod plus preview alias, not per-deploy hashes. (Roughly 310 LOC plus components.)
- [ ] **C3 · Zendesk chat module** — status: **MISSING**
  - Lazy loader; **exports CSP fragment** (`static.zdassets.com ekr.zdassets.com *.zdassets.com *.zendesk.com
    *.zopim.com` across script/style/font/frame, plus **`media-src`** for the notification sound — `media-src` is
    now in the base policy, so the module only adds its origins).
- [ ] **C4 · Throttle Quote/RFQ module** — status: **MISSING**
  - `@usethrottle/api-client` plus `@usethrottle/quotes` plus `@usethrottle/errors`; `lib/throttle/quotes.ts`,
    shared quote-cart (`createQuoteCart` plus `useSyncExternalStore`), drawer, `/request-a-quote`, buyer
    `/quote/[token]` behind `/api/quote-proxy`; env `THROTTLE_QUOTE_FORM_TOKEN` (the `qrf_` value is in the
    form's dashboard URL). Degrades to `/contact` when unset.
  - Correction: no api-client bump needed — the starter's `^2.6.0` already resolves 2.18, and
    `postApiV1Customers` / `getApiV1Customers1` / `getApiV1CustomersByExternal` are unchanged there. Raising the
    floor is cosmetic.
- [ ] **C5 · Resend mailer + contact/returns module** — status: **MISSING**
  - `src/lib/email/mailer.ts` (Resend; graceful log-fallback when unconfigured) plus `/api/contact` plus
    `/api/returns`; env `RESEND_API_KEY`, `EMAIL_FROM` (verified domain), `CONTACT_FORM_TO`, `RETURNS_TO`.
  - Bigger than it looks: the starter's `/contact` page is **static prose with no form**, and there is no returns
    form page at all (only the `/policies/returns` prose). Porting the routes means porting the client form
    components too.

---

## D. `.env.local.example` additions [P0]

- [x] **DONE** (2026-09-01) — added: the `sk_test_` vs `sk_live_` mode warning on `THROTTLE_API_KEY` (a
  mismatched mode makes every subsystem look independently broken); `NEXT_PUBLIC_BASE_URL` with prod-domain
  guidance; the A4 `<PREFIX>_FETCH_*` tuning vars; and the §C connector vars under an explicit
  **"NOT IMPLEMENTED IN THIS STARTER YET"** banner pointing here, so the names are reusable without implying the
  features exist.

---

## E. P2 — nice to have

- [ ] Tighten CSP via a nonce pipeline (drop `'unsafe-inline'`); scope `connect-src` / `img-src` off the `https:`
      wildcard. (TODO comment left in `src/proxy.ts`.)
- [x] `engines` in `package.json` to surface the Node-20-vs-22 vitest failure early — **DONE** (`"node": ">=22"`).
      Confirmed live during this pass: on Node 20.18.1 vitest dies with `ERR_REQUIRE_ESM` from
      `vite/dist/node/index.js`, which reads as a broken suite rather than a wrong runtime.
- [x] Note in `AGENTS.md`: `next dev` regenerates the agent-rules block — commit or revert before committing —
      **DONE**, plus two corrections: it only happens on **Next ≥16.3** (this repo pins 16.2.3), and our
      `AGENTS.md` was carrying that text **without** the `<!-- BEGIN:nextjs-agent-rules -->` / `<!-- END: -->`
      markers, so the first 16.3 `next dev` would have appended a duplicate block. The markers are now in place.

---

## F. Review notes (2026-09-01)

Findings from checking this list against the repo. §F.1 and §F.2 are the reason §B1 is deferred rather than
"just" backported.

1. **The two repos have different checkout architectures.** Source: `checkoutCart()` creates the order before
   the embed, so `session.orderId` exists and the guest token is minted inline. Starter: cart-backed session,
   order created on capture, so there is no order id at session time. Any guest-receipt design must derive the
   order from the session server-side.
2. **Customer linking is missing entirely in the starter** (`CreateCartInput` has no `customerId`, there is no
   `setCartCustomer`, and `createSession` passes none). Two live consequences today: `/account/orders` lists by
   `customerId` and so is likely empty for orders placed through this starter, and the success page fetches the
   auth-gated `/api/throttle/orders/[id]`, so **guest receipts are already broken**.
3. **CSP composition has no precedent to copy** — the source project hardcodes every connector origin inline.
   The `composeCsp` seam in `src/proxy.ts` is new; the zero-imports rule for module fragments comes from Next's
   own proxy docs.
4. **A4 ships without callers.** Tested, but it will drift until §C1 uses it. Don't add more uncalled
   infrastructure ahead of the module that needs it.
5. **Unverifiable "Done-when" checks.** The composed-header `curl`, "large-catalog build without PIM timeouts",
   real-404-on-unknown-slug, and Evident's dashboard CORS allow-list all need a preview deploy or a live
   backend. They are marked "remaining" above rather than ticked.
6. **`node_modules` was absent** when this pass started, so the AGENTS.md rule (read the version-matched docs in
   `node_modules/next/dist/docs/`) could not be satisfied until `npm install` ran. Install first.

---

## Feeding this file (after every project)

1. At handoff, add findings here as new checkboxes with a status tag plus target files.
2. Land them as small PRs (one per theme); reference the PR next to the box.
3. Promote cross-project lessons into the SOP (see the SOP change file). Keep this list the single backlog for
   starter evolution.
