# Next.js + Throttle Ecommerce Starter

A free, open-source, production-ready ecommerce starter built with **Next.js**, **Tailwind CSS**, and **shadcn/ui**, pre-integrated with **[Throttle](https://usethrottle.dev)** as the commerce engine for carts, checkout sessions, payments, and orders.

**[Throttle Docs](https://docs.usethrottle.dev)** · **[Live Demo](https://nextjsecommercestarter.com)** · **[Customization Guide](docs/CUSTOMIZATION.md)** · **[Report Issue](https://github.com/Epic-Design-Labs/nextjs-ecommerce-starter/issues)**

Built by [Epic Design Labs](https://epicdesignlabs.com)

## Features

- **Product Catalog** — Browse, filter, sort, search across 14 demo products in 5 categories
- **Shopping Cart** — Slide-out drawer with optimistic UI, **synced to Throttle in real time** (cart materialises in Throttle on the first add and stays in sync through every quantity / remove)
- **Wishlist** — Save products with heart icons, persisted to localStorage
- **Checkout** — Throttle [`PaymentEmbed`](https://docs.usethrottle.dev/developers/embedded-checkout) iframe, **shipping form prefilled from the signed-in buyer's saved address**, server-side pricing (no client tampering)
- **Authentication** — [Clerk](https://clerk.com) by default with a pluggable `AuthProvider` port; legacy mock auth as a fallback when Clerk env is absent
- **Customer mirror** — Clerk users automatically upserted as Throttle customers (lazy on first server call, plus a `user.created` webhook for SSO / dashboard creations)
- **Account** — Dashboard with recent order summary + default shipping address + active subscriptions, order history scoped to the buyer's Throttle `customerId`, addresses + payment methods **stored on the Throttle customer record**, Clerk-managed profile (email/password/2FA), reorder (whole or per-line-item)
- **Brands** — Brand pages with product filtering
- **Subcategories** — Nested categories with accordion mobile menu
- **Search** — Cmd+K modal with instant results and popular searches
- **Announcement Bar** — Dismissible top banner, configurable in one file
- **Recently Viewed** — Tracks and displays recently browsed products
- **Back to Top** — Smooth scroll button on long pages
- **SEO** — Dynamic metadata, Open Graph, canonical URLs, sitemap, robots.txt, structured data (Product, Organization, BreadcrumbList)
- **Accessibility** — Skip-to-content, focus traps, ARIA labels, keyboard navigation, 44px touch targets
- **i18n** — next-intl with English and Spanish translations
- **Responsive** — Mobile-first design, 1440px max-width, full-width cart/menu on mobile
- **Security** — server-side pricing (no IDOR), UUID validation at every dynamic route boundary (no SSRF), HMAC-SHA256 verification on both Throttle and Clerk webhooks, CSP/HSTS/X-Frame-Options via composed middleware

## Tech Stack

- **Next.js 16** (App Router, React Server Components)
- **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **[Throttle SDKs](https://www.npmjs.com/org/usethrottle)** — `@usethrottle/cart`, `@usethrottle/checkout-sdk`, `@usethrottle/checkout-react`, `@usethrottle/api-client`
- **[Clerk](https://clerk.com)** (`@clerk/nextjs`) — default auth provider, swappable
- **Zustand** (client cart UX state + legacy auth fallback)
- **Zod** (form / route-handler validation)
- **next-intl** (internationalization)
- **Sonner** (toast notifications)
- **Inter** (Google Font via next/font)

## Quick Start

```bash
# Requires Node.js 20+
git clone https://github.com/Epic-Design-Labs/nextjs-ecommerce-starter.git
cd nextjs-ecommerce-starter
cp .env.local.example .env.local
# Fill in THROTTLE_API_KEY + THROTTLE_STORE_ID from https://app.usethrottle.dev
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required environment variables

**Throttle (commerce)**

| Var | Purpose |
|-----|---------|
| `THROTTLE_API_KEY` | Server-side secret key (`sk_…`) from the Throttle dashboard. Never expose to the browser. |
| `THROTTLE_STORE_ID` | UUID of the Throttle store you want carts/orders attached to. |
| `THROTTLE_WEBHOOK_SECRET` | Returned when you create a webhook endpoint. Verifies signatures on `/api/throttle/webhook`. |

**Clerk (auth)**

| Var | Purpose | Required |
|-----|---------|----------|
| `CLERK_SECRET_KEY` | Server-side secret key (`sk_…`) from your Clerk dashboard → API Keys. | yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser-safe publishable key (`pk_…`) from the same dashboard page. | yes |
| `CLERK_WEBHOOK_SIGNING_SECRET` | svix signing secret from Clerk → Webhooks → Endpoint settings. Required only if you provision a webhook (see [Webhooks](#webhooks)). | optional |

Without these the starter falls back to stub providers so the UI keeps rendering. **The order-read and address routes return 501 until Clerk is configured** — they refuse to identify the buyer from request input alone.

The Clerk catch-all routes mount at `/auth/login` and `/auth/register`. Those paths are exposed to Clerk via committed `.env` defaults (`NEXT_PUBLIC_CLERK_SIGN_IN_URL` etc) — change them if you mount the UI elsewhere.

### Allow the embed origin

Throttle's `PaymentEmbed` only mounts when its `parentOrigin` is in your store's allow-list. Add your dev + production origins via the dashboard's Embed Config page or:

```bash
curl -X PUT https://api.usethrottle.dev/api/v1/embed-config \
  -H "x-api-key: $THROTTLE_API_KEY" \
  -H "content-type: application/json" \
  -d '{"allowed_origins":["http://localhost:3000","https://your-prod-domain.com"]}'
```

### Demo accounts (fallback only)

When Clerk env vars aren't set, the auth pages fall back to a legacy mock auth driven by Zustand. The demo account below only works in that mode:

| Email | Password |
|-------|----------|
| `demo@example.com` | `password123` |

With Clerk configured, sign up via `<SignUp />` instead — this account is ignored.

> The starter is built for **headless storefronts**. Merchant operations (orders, fulfillment, customers, discounts, subscriptions) live in Throttle's dashboard — there is no `/admin` section in this codebase. Clients who want an in-app admin build their own on top.

## Project Structure

```
src/
  app/
    (store)/                  # Storefront layout
      [slug]/                 # Product detail / category / brand
      shop/                   # Catalog with filters
      cart/, checkout/        # Cart + Throttle PaymentEmbed checkout
      account/                # Orders, addresses, settings (auth-gated)
      auth/                   # Clerk <SignIn /> / <SignUp /> catch-alls
    api/
      account/summary/        # Aggregated dashboard payload
      throttle/
        cart/                 # Real-time cart sync routes
        checkout-session/     # Mint Throttle PaymentEmbed session
        customer-addresses/   # Buyer-scoped address CRUD
        customer-payment-methods/ # List + set default + remove vaulted cards
        orders/               # Buyer-scoped order list + by-id
        webhook/              # Throttle event receiver (HMAC-verified)
      webhooks/clerk/         # Clerk event receiver (svix-verified)
      auth/me/                # Buyer identity + default address (prefill)
  components/
    ui/                       # shadcn/ui + custom
    layout/                   # Header, Footer, AnnouncementBar, BackToTop
    products/, cart/, search/, auth/, checkout/
  data/
    products.json             # Product catalog (Throttle is BYO-catalog)
  content/
    blog/*.md                 # Blog posts (markdown + frontmatter)
    pages/*.md                # CMS pages (markdown + frontmatter)
  lib/
    config.ts                 # Store name, contact, etc
    env.ts                    # Zod-validated env
    navigation.ts             # Menu config
    content/markdown.ts       # Markdown file loader (gray-matter)
    repositories/             # Data access (products JSON, blog/pages markdown)
    validators/               # Zod schemas
    auth/                     # AuthProvider port + Clerk impl + demo fallback
      types.ts                #   AuthProvider, AuthUser interfaces
      clerk-provider.ts       #   default impl
      demo-provider.ts        #   stub when keys absent
      index.ts                #   picks active provider
    throttle/                 # Throttle SDK glue
      cart.ts, sessions.ts, orders.ts
      customers.ts, customer-addresses.ts, payment-methods.ts
      webhook.ts              #   HMAC verify for /api/throttle/webhook
      checkout-provider.ts    #   implements local CheckoutProvider interface
      clients.ts              #   lazy SDK client singletons
      client.ts               #   ThrottleApiError + callThrottle wrapper
      types.ts                #   shared response shapes
    checkout/                 # Pluggable CheckoutProvider (Throttle default)
    http/
      validate.ts             # requireUuid — rejects non-UUID path params
  store/                      # Zustand stores
    cart.ts                   #   cart + Throttle sync queue
    wishlist.ts, auth.ts      #   legacy auth (fallback)
    orders.ts, recently-viewed.ts
  types/                      # TypeScript types
  i18n/                       # next-intl config
  hooks/                      # useAuthGuard, useCurrentUser
  middleware.ts               # Clerk + security headers
messages/
  en.json, es.json            # next-intl translations
docs/
  CUSTOMIZATION.md            # Full customization guide
```

## Customization

Everything is configurable from a few key files:

| What | Where |
|------|-------|
| Store name, contact, social links | `src/lib/config.ts` |
| Theme colors (rating, wishlist, status) | `src/app/globals.css` |
| Navigation (desktop + mobile) | `src/lib/navigation.ts` |
| Products, categories, brands | `src/data/products.json` |
| Blog posts | `content/blog/*.md` (markdown + frontmatter) |
| CMS pages | `content/pages/*.md` (markdown + frontmatter) |
| Translations | `messages/en.json`, `messages/es.json` |

See [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the full guide.

## How the Throttle integration works

### Cart sync (real-time)

```
[Buyer]  → "Add to cart" on /shop or PDP
         → useCartStore optimistic local update (instant UI)
         → POST /api/throttle/cart                  (create Throttle cart, only once)
         → POST /api/throttle/cart/{id}/items       (variantId + quantity ONLY;
                                                     name and unitPrice come from
                                                     the server-side catalog)
         → maps Throttle line-item id ↔ local variantId
         → "Change quantity" → PATCH /…/items/{itemId}
         → "Remove"          → DELETE /…/items/{itemId}
         → "Clear cart"      → abandon Throttle cart; fresh one on next add
```

All mutations run through a per-tab serial queue so a quick "add + update qty" can't race ahead of the original POST. The Throttle cart id and the local → Throttle line-item id mapping persist to localStorage so the cart survives reloads.

### Checkout

```
[Buyer]  → /checkout (form prefilled from /api/auth/me when signed in)
         → POST /api/throttle/checkout-session     ({ throttleCartId, items, customer })
              ├─ Reuses the cart built up during browsing if still `open`,
              │   otherwise rebuilds one from local items
              ├─ POST /api/v1/carts/{id}/checkout  (cart → draft order)
              └─ POST /api/v1/checkout-sessions/embed-token
         ← { checkoutSessionId, embedUrl, orderId }
         → Mounts <PaymentEmbed /> from @usethrottle/checkout-react
         → onSucceeded → /checkout/success?order_id=...
                          ↑ /api/throttle/orders/[id] (ownership-checked)
```

### Authentication + customer mirror

```
[Buyer]  → /auth/login → Clerk <SignIn />
         → first authenticated server call
              → authProvider.getCurrentUser()
                   ├─ read Clerk privateMetadata.throttleCustomerId (cache)
                   ├─ if missing: GET  /customers/by-external/{clerkUserId}
                   └─ if none yet: POST /customers, save id to metadata

[Clerk]  → POST /api/webhooks/clerk  (user.created / user.updated)
              ├─ svix verify against CLERK_WEBHOOK_SIGNING_SECRET
              └─ same upsert, catches users created via SSO / dashboard
                  before they make a server visit

Subsequent /api/throttle/orders* and /api/throttle/customer-addresses*
read throttleCustomerId from the session — never from the request body.
```

### Throttle webhooks (post-payment)

```
[Throttle] → POST /api/throttle/webhook
              ├─ HMAC-SHA256 verify against THROTTLE_WEBHOOK_SECRET
              └─ fan out (order.created, payment.captured, payment.failed, …)
```

### Key files

| File | Purpose |
|------|---------|
| `src/lib/throttle/clients.ts` | Lazy `CartClient` + `CheckoutClient` singletons. |
| `src/lib/throttle/cart.ts` | `createCart`, `addCartItem(s)`, `updateCartItem`, `removeCartItem`, `checkoutCart`, `getCart` — via `@usethrottle/cart`. |
| `src/lib/throttle/sessions.ts` | `createEmbedSession` via `@usethrottle/checkout-sdk`. |
| `src/lib/throttle/orders.ts` | `getOrder` via `checkout-sdk`; `listOrders` via `api-client`. |
| `src/lib/throttle/customers.ts` | `createCustomer`, `getCustomer`, `getCustomerByExternalId`. |
| `src/lib/throttle/customer-addresses.ts` | `listAddresses`, `createAddress`, `updateAddress`, `deleteAddress`, `saveAddressIfNew` — via `@usethrottle/api-client`. |
| `src/lib/throttle/payment-methods.ts` | `listPaymentMethods`, `setDefaultPaymentMethod`, `removePaymentMethod` — via `@usethrottle/api-client`. |
| `src/lib/throttle/webhook.ts` | `verifyThrottleSignature` (`X-Throttle-Signature`). |
| `src/lib/throttle/checkout-provider.ts` | Implements the local `CheckoutProvider` interface against Throttle. |
| `src/lib/auth/*` | `AuthProvider` port + Clerk impl + demo fallback. |
| `src/lib/http/validate.ts` | `requireUuid` — boundary validation for dynamic route params. |
| `src/app/api/throttle/cart/**` | Real-time cart sync (POST/PATCH/DELETE). |
| `src/app/api/throttle/checkout-session/route.ts` | Mint PaymentEmbed session. |
| `src/app/api/throttle/customer-addresses/**` | Buyer-scoped address CRUD. |
| `src/app/api/throttle/customer-payment-methods/**` | Buyer-scoped payment method list / set-default / remove. |
| `src/app/api/throttle/orders/{,[id]}/route.ts` | Buyer-scoped order list + by-id (ownership-checked). |
| `src/app/api/throttle/webhook/route.ts` | Throttle event receiver (HMAC-verified). |
| `src/app/api/webhooks/clerk/route.ts` | Clerk event receiver (svix-verified). |
| `src/app/api/auth/me/route.ts` | Returns identity + default address for checkout prefill. |
| `src/components/checkout/throttle-payment-embed.tsx` | Wrapper around `@usethrottle/checkout-react`'s `PaymentEmbed`. |

### Authentication (Clerk by default)

The starter ships with a Clerk integration so the order-read routes can identify the buyer from a server-readable session instead of trusting client-supplied query params. The auth layer is intentionally pluggable — Clerk is the default, not a requirement.

**Default flow (Clerk + Throttle customer mirror)**

1. Buyer signs in via `/auth/login` (renders Clerk's `<SignIn />`).
2. On the first authenticated server call (`getCurrentUser()` in `src/lib/auth/clerk-provider.ts`):
   - Looks up `privateMetadata.throttleCustomerId` on the Clerk user — fast path.
   - If missing, calls Throttle's `GET /customers/by-external/{clerkUserId}` to recover.
   - If no Throttle customer exists, `POST /customers` with the Clerk user's email + name and stores the new id back in Clerk metadata.
3. `/api/throttle/orders*` reads that `throttleCustomerId` from the session and scopes queries to it. **No client-supplied email or customer id is ever trusted.**

**Files involved**

| File | Purpose |
|------|---------|
| `src/lib/auth/types.ts` | `AuthProvider` interface — the seam other providers implement. |
| `src/lib/auth/clerk-provider.ts` | Default Clerk impl. Lazily upserts Throttle customer + caches the link in `privateMetadata`. |
| `src/lib/auth/demo-provider.ts` | Stub returned when Clerk isn't configured. `getCurrentUser()` is always `null`. |
| `src/lib/auth/index.ts` | Picks the active provider based on env. |
| `src/lib/throttle/customers.ts` | `createCustomer`, `getCustomer`, `getCustomerByExternalId`. |
| `src/middleware.ts` | Composes `clerkMiddleware()` with the existing security headers; protects `/account/*` and `/api/throttle/orders/*`. |
| `src/app/(store)/auth/{login,register}/[[...rest]]/page.tsx` | Catch-all routes that render Clerk's `<SignIn />` / `<SignUp />`. Demo form is the fallback when Clerk env is absent. |
| `src/hooks/use-auth-guard.ts` / `src/hooks/use-current-user.ts` | Client-side hooks. Pick between Clerk + Zustand impls at module load so React's hook rules stay satisfied. |

**Swapping to a different provider**

Implement the `AuthProvider` interface and re-point the export in `src/lib/auth/index.ts`. You'll also need to replace the auth route pages with your provider's UI components. Both surfaces are small — the rest of the app only reads from the seam.

```ts
// src/lib/auth/types.ts
export interface AuthProvider {
  getCurrentUser(): Promise<AuthUser | null>
}

export interface AuthUser {
  id: string                    // your provider's user id
  email: string
  firstName?: string
  lastName?: string
  throttleCustomerId?: string   // mirrored on first call
}
```

## Webhooks

Two webhook surfaces ship with the starter — both signature-verified, both safe to enable in production.

### Throttle → `/api/throttle/webhook`

Receives post-payment events. Verified via HMAC-SHA256 against `THROTTLE_WEBHOOK_SECRET`.

```bash
curl -X POST https://api.usethrottle.dev/api/v1/webhook-endpoints \
  -H "x-api-key: $THROTTLE_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/throttle/webhook",
    "enabled_events": ["order.created", "order.completed", "payment.captured", "payment.failed"]
  }'
```

Copy the returned `secret` into `THROTTLE_WEBHOOK_SECRET`.

### Clerk → `/api/webhooks/clerk`

Catches `user.created` / `user.updated` events that the lazy upsert misses (dashboard creates, social SSO signups). Verified via svix against `CLERK_WEBHOOK_SIGNING_SECRET`.

1. clerk.com → Webhooks → **Add Endpoint**
2. URL: `https://<your-public-host>/api/webhooks/clerk`
3. Subscribe to `user.created`, `user.updated`
4. Copy the **Signing Secret** into `CLERK_WEBHOOK_SIGNING_SECRET`

For local dev, expose your dev server with a tunnel (ngrok, cloudflared, etc.) and use the tunnel's HTTPS URL as the endpoint. Without the webhook the lazy upsert still runs on the first authenticated server call — the webhook just makes the link faster and catches edge cases.

## Security guarantees

| Guarantee | How |
|-----------|-----|
| **No price tampering.** Server is the only source of truth for line-item prices. | `POST /api/throttle/cart/{id}/items` accepts only `{ variantId, quantity }`; `name`, `unitPrice`, `imageUrl`, `description` are read from `productRepository.findVariant(variantId)`. |
| **No IDOR on order routes.** Buyers can't enumerate or read other buyers' orders. | `/api/throttle/orders*` reads the customer id from the Clerk session and rejects any request without one. The `[id]` route additionally compares `order.customerId` to the session before returning. |
| **No SSRF via path traversal.** Dynamic route params can't redirect upstream fetches. | `requireUuid()` at every dynamic-route boundary rejects non-UUID segments with `400 invalid_id` before any id reaches the SDK. |
| **Webhooks verified.** Both Throttle and Clerk webhooks are HMAC/svix-verified before any handler runs. | `src/lib/throttle/webhook.ts` (HMAC-SHA256 + timestamp tolerance) and `verifyWebhook` from `@clerk/nextjs/webhooks`. |
| **CSP locked down.** Inline frames + external script origins explicitly allow-listed. | `src/middleware.ts` composes `clerkMiddleware()` with strict CSP allowing only `clerk.com`, `clerk.accounts.dev`, `checkout.usethrottle.dev`. |

### Swapping the engine

`src/lib/checkout/index.ts` picks the active provider based on env. To swap to Stripe (or any other system), implement the `CheckoutProvider` interface and export it from there.

```typescript
interface CheckoutProvider {
  createSession(cart, customer?): Promise<CheckoutSession>
  getSession(sessionId): Promise<CheckoutSession>
  handleWebhook(payload, signature): Promise<WebhookResult>
}
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — hero, categories, featured products, developer CTA |
| `/shop` | Product catalog with filters and sorting |
| `/[slug]` | Product detail, category, or brand (auto-resolved) |
| `/cart` | Shopping cart |
| `/checkout` | Checkout form |
| `/search` | Search (also available via Cmd+K modal) |
| `/wishlist` | Saved products |
| `/brands` | All brands |
| `/account` | Dashboard — recent order, default address, active subscriptions, quick nav |
| `/account/orders` | Order history (+ subscriptions sidebar with pause/resume/cancel) |
| `/account/orders/[id]` | Order detail with per-line-item reorder |
| `/account/addresses` | Saved shipping addresses, synced to the Throttle customer |
| `/account/payment-methods` | Saved cards (vaulted at checkout) — set default, remove |
| `/account/settings` | Clerk's `<UserProfile />` — profile, password, 2FA, sessions |
| `/auth/login` | Sign in |
| `/about` | About the starter + Epic Design Labs |
| `/contact` | Contact form |
| `/faq` | FAQ accordion |
| `/policies/*` | Shipping, returns, privacy, terms |

## Need Help?

This starter is free and open source. If you need help customizing it or building a complete ecommerce solution:

- **Email**: support@epicdesignlabs.com
- **Website**: [epicdesignlabs.com](https://epicdesignlabs.com)
- **Issues**: [GitHub Issues](https://github.com/Epic-Design-Labs/nextjs-ecommerce-starter/issues)

## License

MIT — free for personal and commercial use.
