# Throttle Integration Feedback

A running report from building the `nextjs-throttle-starter` against
the live Throttle workspace and SDKs. Captures every API, SDK, docs,
and DX issue we hit during the integration so the Throttle team has
one document to triage instead of fishing through commit messages.

**Integration scope:** Next.js 16 + App Router storefront + Clerk
auth. Used `@usethrottle/cart`, `@usethrottle/checkout-sdk`,
`@usethrottle/checkout-react`, and `@usethrottle/api-client`. Wired
cart sync, checkout sessions, embed-token + PaymentEmbed, orders,
order detail, reorder, customer mirror, addresses, payment methods,
discounts, shipping/tax calculation, subscriptions (list + pause /
resume / cancel), and webhook receivers for both Throttle and Clerk.

**Demo workspace:** Planet Express (`e7efb0a6-892e-46b2-97ab-296bb04c5b29`).

---

## TL;DR — the five highest-priority items

1. **`@usethrottle/api-client` PATCH/DELETE endpoints for nested resources are non-functional.** The URL template `/customers/{customerId}/addresses/{id}` only fills `{id}` at runtime — `{customerId}` stays as a literal in the path. Affects customer-addresses *and* customer-payment-methods. Two whole resource families' mutation APIs broken in the SDK. We worked around with direct fetch; any consumer relying on the SDK gets silent failures.

2. **api-client TypeScript types declare snake_case but the live API answers camelCase.** Caused `orderNumber`, `paymentStatus`, and other fields to silently return `undefined` from typed SDK calls. We had to write defensive `pick(snake, camel)` mappers in every normaliser. Fixing this is a one-line generator config change but it'd retire a whole class of starter bugs.

3. **Mid-week breaking change to a stable `v1` endpoint with no deprecation header.** `POST /api/v1/carts` accepted `storeId` on 2026-05-28, rejected it as an unknown field on 2026-05-30. No `Deprecation:` header, no `Sunset:` header, no changelog entry on `docs.usethrottle.dev`. Field renamed to `applicationId`. For a stable v1 API, breakage like this on stale field references is the kind of thing that ships an integration and then breaks production silently.

4. **`@usethrottle/cart` SDK builds URLs by string template without `encodeURIComponent`.** Any consumer that passes user-controlled IDs through the SDK has an SSRF vector: `addressId = "../subscriptions/cancel-all"` would redirect the fetch into a different endpoint. We patched our own code with boundary UUID validation + `encodeURIComponent`, but every SDK consumer has the same exposure until the SDK encodes at its own boundary.

5. **`externalId` is silently dropped on customer create AND update**, even though `GET /customers/by-external/{id}` exists as the documented way to find a customer by their auth provider's id. Makes the entire recovery path unreachable in practice. The only working customer↔auth link is via the auth provider's own metadata store (we used Clerk `privateMetadata`).

---

## Critical (data loss / security risk)

### API-1: `POST /api/v1/orders` silently ignores snake_case `customer_id` and `line_items`

Only the camelCase variants (`customerId`, `lineItems`) are honored. Sending the snake_case fields the api-client TS schema declares produces **draft orders with `customerId: null` and empty line items** — i.e. unattached orders with $0 totals. No validation error. The api-client SDK, by virtue of generating snake_case bodies from its types, is therefore broken for order creation by default.

**Repro:**
```bash
curl -X POST https://api.usethrottle.dev/api/v1/orders \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"store_id":"…","customer_id":"…","currency":"USD","line_items":[…]}'
# → 201 with data.customerId=null, data.subtotal=0, data.lineItems empty
```

**Suggested fix:** Either accept both shapes consistently, or reject unknown snake_case fields with the same `Unsupported field(s): …` error the carts endpoint produces. Don't silently drop — silent-drop is the worst failure mode.

### API-2: `externalId` silently dropped on `POST /api/v1/customers` and `PATCH /api/v1/customers/{id}`

The field is documented (it's in the response shape) and there's an endpoint to *look up* customers by it (`GET /customers/by-external/{externalId}`), but the value sent on create/update is silently ignored. The customer's `externalId` always comes back `null`.

**Impact:** Any integrator who wants to mirror their auth provider's user id onto the Throttle customer (the standard "link buyer to Clerk/Auth0/etc.") cannot. We had to fall back to storing `throttleCustomerId` in Clerk's `privateMetadata` because the reverse link is unreachable.

**Suggested fix:** Honor `externalId` on create and PATCH, with the existing `GET /by-external` becoming actually useful.

### SDK-1: `@usethrottle/api-client` PATCH/DELETE for `/customers/{cid}/addresses/{id}` and `/customers/{cid}/payment-methods/{id}` is broken

Generated code:
```js
static patchApiV1CustomersAddresses(id, requestBody) {
  return __request(OpenAPI, {
    method: 'PATCH',
    url: '/api/v1/customers/{customerId}/addresses/{id}',
    path: { 'id': id },   // ← {customerId} never filled
    body: requestBody,
    ...
  })
}
```

The URL template references `{customerId}` and `{id}` but only `{id}` is populated at runtime. The request goes to `/api/v1/customers/{customerId}/addresses/<real-id>` literally, which 404s. Same generated bug exists for the payment-methods sibling methods.

**Workaround we shipped:** Replaced both with direct `fetch()` calls that interpolate the customer id ourselves, with `encodeURIComponent` on both segments as defense in depth. See `src/lib/throttle/customer-addresses.ts` and `src/lib/throttle/payment-methods.ts`.

**Suggested fix:** Generator config issue. The OpenAPI spec needs `customerId` as a path parameter on these methods, or the generator needs to be re-run after a spec fix.

### SDK-2: `@usethrottle/cart` SDK does not `encodeURIComponent` URL path segments

```js
items.update = (cartId, itemId, input) =>
  this.request("PATCH", `/api/v1/carts/${cartId}/items/${itemId}`, input)
```

Every endpoint builds the URL by string template. A consumer passing a user-controlled `cartId` or `itemId` (e.g. from a route param) is one path-traversal payload away from redirecting the upstream request into a different Throttle endpoint. This is a real CVE-eligible issue if it ships in production storefronts.

**Workaround we shipped:** `requireUuid()` validation at every dynamic-route boundary in our app routes, plus our own URL builders use `encodeURIComponent`. See `src/lib/http/validate.ts`.

**Suggested fix:** `encodeURIComponent` at the SDK boundary. Cheap, defends every consumer by default.

### API-3: Mid-week breaking field rename on a stable v1 endpoint

`POST /api/v1/carts` accepted `storeId` on 2026-05-28 and rejected it as an unknown field on 2026-05-30. The field is now `applicationId`. No `Deprecation:` header on the prior responses, no changelog entry. The cart-SDK type union still allowed either, so our build kept type-checking even after the runtime broke.

**Suggested fix:** For any field rename on a stable endpoint, return a `Deprecation:` header on the deprecated payload for a window before flipping to rejection, and post a changelog entry. The fact that `docs.usethrottle.dev/developers/cart-api` still says "storeId" today is a separate docs-staleness issue.

---

## High-priority API issues

### API-4: snake_case in published docs vs camelCase on the wire

The `cart-api` docs page advertises `reference_id`, `unit_price`, `image_url`, `enabled_events` etc. The live API requires camelCase (`referenceId`, `unitPrice`, `imageUrl`). We hit this on day one and the validation error didn't help — it said `path: "unitPrice", message: "Required"` instead of `received "unit_price", expected "unitPrice"`.

**Suggested fix:** Sweep docs for snake_case. Validation error format should echo the received field name when an expected one is missing.

### API-5: Silent field drops elsewhere

- `POST /carts` with `shippingAddress` in the body: response has `shippingAddress: null`.
- `POST /customers` with `external_id` OR `externalId`: response has `externalId: null` (covered above as API-2).

Silent drops force trial-and-error debugging. Either accept the field or reject with `Unsupported field(s): X`.

### API-6: Misleading endpoint name — `POST /carts/{id}/checkout` doesn't create a checkout *session*

It creates a draft *order*. "Checkout session" is a separate concept created via `POST /checkout-sessions/embed-token`. Took a real-API probe to figure out. Suggest renaming to `POST /carts/{id}/finalize` or `POST /carts/{id}/convert-to-order`, and reserving "checkout" language for the session flow.

### API-7: Two names for the same value — `applicationId` and `storeId`

Cart/order responses include both `applicationId` and `store_id` populated with the same value. After API-3 we now have to send `applicationId` on create but the response still carries both. Pick one wire name.

### API-8: Address shapes differ across endpoints

| Endpoint | Field names |
|---|---|
| Cart / order `shippingAddress` | `firstName`, `lastName`, `line1`, `line2`, `city`, `state`, `postalCode`, `country` |
| Customer addresses (`/customers/{id}/addresses`) | `firstName`, `lastName`, `addressLine1`, `addressLine2`, `city`, `stateProvince`, `postalCode`, `countryCode` |
| `CheckoutAddress` SDK type | Strict subset of the customer-addresses shape |

Same merchant, three address conventions. Costs every integrator a mapping layer. Pick one shape, ship it everywhere.

### API-9: `imageUrl` requires absolute http(s) URL with no resolution rule

Sending a relative path (e.g. `/images/products/aurora.jpg`) returns `Invalid url`. Either accept relative paths and resolve them against the store's base URL, or document the requirement loudly on the cart-items endpoint. Right now you have to discover it via a 400.

### API-10: Cart-addresses are not accepted on cart create

`POST /carts` body schema allows `shippingAddress` / `billingAddress` per the SDK type and via the raw API, but they're silently ignored. To attach an address you have to `PATCH /carts/{id}` after creation. Either accept on create or reject the field.

---

## SDK quality

### SDK-3: api-client TS types are snake_case but API answers camelCase

```ts
// api-client says:
data?: { order_number?: string; payment_status?: string; tax_total?: number; ... }

// API actually returns:
{ "orderNumber": "ORD-000259", "paymentStatus": "pending", "taxTotal": 0, ... }
```

Result: every typed read against `result.data` returns `undefined`. We had to write a `pick(raw, snake, camel)` defensive normaliser in every consumer (`orders.ts`, `customers.ts`, `customer-addresses.ts`, `payment-methods.ts`, `subscriptions.ts`).

### SDK-4: api-client ESM module resolution broken

`dist/index.js` does `export * from './generated/index'` with no `.js` extension. Bundlers (Next/Webpack/Turbopack) tolerate it; Node native ESM (`node --experimental-vm-modules`, raw `.mjs` consumers) fails with `ERR_MODULE_NOT_FOUND`. Add `.js` extensions during emit.

### SDK-5: api-client `postApiV1Customers` schema omits `external_id`

The body type doesn't include `external_id` even though the field exists on the response. We had to cast through `Parameters<…>[0]` to send it — only for the API to silently drop it anyway (API-2). Two bugs stacked.

### SDK-6: api-client `postApiV1Discounts` schema mismatches live API

Schema declares `amount` + `description`; live API rejects those as unknown and requires `value` + `name`. Same family as SDK-3 (schema not regenerated against the current spec).

### SDK-7: Hand-written SDKs don't expose order listing

`@usethrottle/cart` and `@usethrottle/checkout-sdk` are both well-designed (clear method names, grouped accessors, typed responses) but neither exposes `listOrders`. Any storefront with an account dashboard has to drop into `api-client` for that single call — which means re-shipping all of SDK-3 through SDK-6. Add `checkoutClient.orders.list({ customerId, storeId, cursor, limit })` to the checkout-sdk and `api-client` becomes optional.

### SDK-8: Two error class names for the same shape

`ThrottleApiError` (from `@usethrottle/cart`) and `ThrottleCheckoutError` (from `@usethrottle/checkout-sdk`) have identical fields (`code`, `statusCode`, `message`, `details`). Any integrator using both packages has to `catch` both classes. Either pull both from a shared `@usethrottle/errors` package, or have one extend the other.

### SDK-9: Two `Order` types

`@usethrottle/cart` `Order` is 4 fields (`id`, `status`, `total`, `currency`). `@usethrottle/checkout-sdk` `CheckoutOrder` is rich (line items, payments, addresses, status enums). They model the same resource. Unify, or document why the cart-SDK one is thin and which SDK to use when.

### SDK-10: Inconsistent address typing

`@usethrottle/cart`'s `update` takes `shippingAddress?: Record<string, unknown>` — totally untyped. `@usethrottle/checkout-sdk`'s `CheckoutAddress` is strict (`addressLine1`, `stateProvince`, `countryCode`). Same data, two contracts.

### SDK-11: `@usethrottle/checkout-sdk` `createEmbedToken` is a strict subset of the REST endpoint

Accepts only `{ amount, currency, country, externalCartId, allowedMethods }`. The raw REST endpoint takes `customer`, `shippingAddress`, `billingAddress`, `metadata`. We had to drop buyer info we would have liked to pass through.

### SDK-12: `@usethrottle/cart` `carts.create` doesn't accept addresses inline

Footgun mirrored from API-10 — even the SDK type doesn't expose `shippingAddress` / `billingAddress` on create. To attach addresses you have to follow create with `carts.update`. Either accept on create or hard-fail.

### SDK-13: `@usethrottle/cart` `carts.checkout()` returns a thin Order

Only `id` / `status` / `total` / `currency`. To get the full order (line items, addresses, payments) you have to follow up with `checkoutClient.getOrder(orderId)`. The checkout endpoint already has the data; surface it.

---

## Documentation / DX

### DX-1: Docs URLs 404 without the `/developers` prefix

`docs.usethrottle.dev/quickstart` → 404. The actual path is `docs.usethrottle.dev/developers/quickstart`. The root should at least 308 to the canonical path for common slugs.

### DX-2: No public OpenAPI JSON

`api.usethrottle.dev/openapi.json` returns 404. `/docs` requires auth. The cart-api page advertises a Swagger UI link without exposing the spec. Publishing the spec would enable proper codegen, IDE tooling, and let us ship a clean TS client without the api-client bugs.

### DX-3: SDKs are listed but not specified

The "Packages" page documents `import { CartClient } from '@usethrottle/cart'` with no method signatures. We had to `npm install` and grep the `.d.ts` to discover the API. A TypeDoc dump per package would solve it in an afternoon.

### DX-4: Quickstart skips two required setup steps

Following the quickstart code verbatim fails:
- `POST /carts` requires `applicationId` (was `storeId`), but the quickstart doesn't mention stores at all.
- The `PaymentEmbed` renders "Embed not authorized" until `allowed_origins` is configured on `/embed-config`.

Both should be numbered "Step 0: Configure your store" before the SDK example.

### DX-5: Required Gr4vy connection not surfaced upfront

A valid API key + valid store + valid cart + valid order still fails at `POST /checkout-sessions/embed-token` with `no_gr4vy_connection`. The quickstart doesn't mention you need a payment provider connected first. The error is good (specific), but a "Step 0: Connect Gr4vy in your dashboard" would save first-time integrators a wall.

### DX-6: Webhook secret distribution unclear in quickstart

The quickstart shows `curl -X POST .../webhook-endpoints` but doesn't echo the response shape. A first-time integrator doesn't know to look for the `secret` field. Just show the response.

### DX-7: `@usethrottle/checkout-sdk` import path is non-obvious

The docs show `createCheckoutClient` but the package exports it from `@usethrottle/checkout-sdk/server`, not the bare package. Easy 30-second docs fix.

### DX-8: No status/state reference per resource

Order has `status` × `paymentStatus` × `fulfillmentStatus` with overlapping but distinct enum values. We had to infer the full enum sets from probing. A status-reference table per resource (cart, order, payment, fulfillment, subscription) with allowed transitions would be high-value.

### DX-9: Test mode story is missing

Every cart/order has `isTest: false`. The docs don't show how to flip into test mode. Is there an `sk_test_` prefix? A test-mode header? An `?test=1` query? This needs a section.

---

## API design suggestions

### DS-1: No idempotency keys

`POST /carts/{id}/checkout` on a network-blip retry will presumably create a second draft order. An `Idempotency-Key` header convention (Stripe-style) would make integrations safer.

### DS-2: Validation errors should echo the received field

```json
{ "details": [{ "path": "unitPrice", "message": "Required" }] }
```
Doesn't help when the caller *sent* `unit_price`. Echoing `"received": ["unit_price"]` (which is what the carts endpoint does — credit) would short-circuit the round-trip everywhere.

### DS-3: Error code naming consistency

Most codes are specific (`no_gr4vy_connection`, `validation_error`, `discount_invalid`). `bad_request` is the odd one — generic, HTTP-status-named. Replace with domain-specific codes like `missing_application_id`.

### DS-4: Cart status enum overlap

`appliedDiscount` is on the cart but `discount` is also a separate cart-level resource (`POST /carts/{id}/apply-discount`). The terminology shifts. Clearer to name them consistently.

### DS-5: Pagination cursor semantics

The pagination meta returns `cursor: "<id>"` and `hasMore: false`. Is the cursor still meaningful when `hasMore` is false? Stripe-style "if hasMore is true, use the last item's id; if false, you're done" would be unambiguous.

---

## Demo / sandbox workspace

### DW-1: The demo workspace ships without a payment provider connection

Following the quickstart with the demo API key fails at the embed-token step (DX-5). For a "starter / try-it-out" key, the demo workspace should have a sandbox Gr4vy attached so the full happy path works without extra setup. As-is, a new dev hits a wall after step 3.

### DW-2: The demo workspace ships with empty `allowed_origins`

Same shape: the PaymentEmbed will render "Embed not authorized" on every fresh demo instance until the dev provisions `allowed_origins` themselves. Seed it with `localhost` ports out of the box.

---

## What the starter ships to work around these

Useful as a reference of the surface area that needs patching:

| Workaround | Files |
|---|---|
| Defensive camel/snake mapping on api-client responses | `src/lib/throttle/{orders,customers,customer-addresses,payment-methods,subscriptions}.ts` |
| Direct `fetch()` fallback for broken PATCH/DELETE methods | `src/lib/throttle/customer-addresses.ts`, `src/lib/throttle/payment-methods.ts` |
| `requireUuid()` at every dynamic-route boundary (SDK SSRF defense) | `src/lib/http/validate.ts` + every `/api/throttle/**/[id]/route.ts` |
| `encodeURIComponent` on direct-fetch path segments | `src/lib/throttle/customer-addresses.ts`, `src/lib/throttle/payment-methods.ts` |
| Customer↔auth link via Clerk `privateMetadata` (because `externalId` is dropped) | `src/lib/auth/clerk-provider.ts`, `src/app/api/webhooks/clerk/route.ts` |
| Unified `ThrottleApiError` that adapts both SDK error classes | `src/lib/throttle/client.ts` |
| `applicationId` instead of `storeId` on cart create (post-rename) | `src/lib/throttle/cart.ts` |
| Pre-fail with clear message when Clerk env is missing on auth-required routes (instead of letting the route return a confusing 404) | `src/app/api/throttle/orders/**/route.ts` |
| Per-tab serial sync queue for cart mutations (defense against the race where a quantity PATCH fires before the original POST returns the line-item id) | `src/store/cart.ts` |

Every one of these is a real cost a new integrator would pay if they walk the docs in order. Removing the underlying issues retires the workaround.

---

## What's working well

Worth saying explicitly so this isn't just a list of complaints.

- **`@usethrottle/cart` SDK is genuinely good.** Grouped accessors (`carts`, `items`, `shipping`, `discounts`, `taxLines`, `shippingTax`, `events`), typed responses, clear method names. The model is right.
- **`@usethrottle/checkout-sdk` is also well-designed.** `getOrderWithPayments` is a nice convenience.
- **`@usethrottle/checkout-react`'s `PaymentEmbed`** has rich, well-typed lifecycle events. The `postMessage` envelope with `source` + `version` validation is exactly the right defense against cross-origin spoofing.
- **Cart features the docs don't surface** — `shippingTax.calculateCart`, `events.list` (per-cart event log), `merge` (guest→customer cart promotion). All useful for serious storefronts. Just need surfacing.
- **Webhook signature scheme** (`X-Throttle-Signature` with HMAC-SHA256 over timestamp + raw body) is the right shape. Documenting the replay-protection tolerance window in the same place as the verification example would close the loop.
- **Error responses are mostly specific and actionable** (`no_gr4vy_connection`, `discount_invalid`, `customer_not_linked`, etc.).
- **Error payloads include a `requestId`** that can be cross-referenced — this is huge for support and we used it during debugging.

---

## Net impression

The product is well-shaped — composable, REST-first, sensible primitives. The integration friction is overwhelmingly in **the seams between concepts** (cart vs session vs order vs embed), **docs-vs-reality drift** (snake/camel, schema vs wire, stale field names), and **the auto-generated `api-client` package**, which is the weak link across the SDK family.

If you fixed just three things — (a) snake/camel in api-client, (b) the broken PATCH/DELETE URL templates, and (c) the demo workspace shipping with Gr4vy + `localhost` origins pre-connected — first-time integration time would roughly halve.

Happy to elaborate on any of these or pull repro scripts. Workspace + demo data referenced in this report still live in Planet Express (`e7efb0a6-…`) as of 2026-05-30.
