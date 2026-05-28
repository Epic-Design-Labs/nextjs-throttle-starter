# Next.js + Throttle Ecommerce Starter

A free, open-source, production-ready ecommerce starter built with **Next.js**, **Tailwind CSS**, and **shadcn/ui**, pre-integrated with **[Throttle](https://usethrottle.dev)** as the commerce engine for carts, checkout sessions, payments, and orders.

**[Throttle Docs](https://docs.usethrottle.dev)** · **[Live Demo](https://nextjsecommercestarter.com)** · **[Customization Guide](docs/CUSTOMIZATION.md)** · **[Report Issue](https://github.com/Epic-Design-Labs/nextjs-ecommerce-starter/issues)**

Built by [Epic Design Labs](https://epicdesignlabs.com)

## Features

- **Product Catalog** — Browse, filter, sort, search across 14 demo products in 5 categories
- **Shopping Cart** — Slide-out drawer, quantity controls, persisted to localStorage
- **Wishlist** — Save products with heart icons, persisted to localStorage
- **Checkout** — Full checkout flow with shipping form and order creation
- **Authentication** — Login, register, forgot password with demo accounts
- **Account** — Order history, saved addresses, profile settings
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
- **Security** — CSP, HSTS, X-Frame-Options, and more via middleware

## Tech Stack

- **Next.js 16** (App Router, React Server Components)
- **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Zustand** (cart, wishlist, auth, orders — persisted to localStorage)
- **Zod** (form validation)
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

| Var | Purpose |
|-----|---------|
| `CLERK_SECRET_KEY` | Server-side secret key (`sk_…`) from your Clerk dashboard → API Keys. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser-safe publishable key (`pk_…`) from the same dashboard page. |

Without these the starter falls back to stub providers so the UI keeps rendering. **The order-read routes (`/api/throttle/orders*`) return 501 until Clerk is configured** — they refuse to identify the buyer from request input alone.

### Allow the embed origin

Throttle's `PaymentEmbed` only mounts when its `parentOrigin` is in your store's allow-list. Add your dev + production origins via the dashboard's Embed Config page or:

```bash
curl -X PUT https://api.usethrottle.dev/api/v1/embed-config \
  -H "x-api-key: $THROTTLE_API_KEY" \
  -H "content-type: application/json" \
  -d '{"allowed_origins":["http://localhost:3000","https://your-prod-domain.com"]}'
```

### Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| `admin@example.com` | `password123` | Admin |
| `demo@example.com` | `password123` | Customer |

## Project Structure

```
src/
  app/
    (store)/          # Storefront (header/footer layout)
      [slug]/         # Product detail, category, brand pages
      shop/           # Product catalog with filters
      cart/           # Shopping cart
      checkout/       # Checkout + success
      account/         # Dashboard, orders, addresses, settings
      auth/            # Login, register, forgot password
      brands/          # All brands page
    (admin)/admin/    # Admin dashboard
  components/
    ui/               # shadcn/ui + custom components
    layout/           # Header, Footer, AnnouncementBar, BackToTop
    products/         # ProductCard, Grid, Gallery, StarRating, etc.
    cart/             # CartDrawer, CartItem, CartSummary
    search/           # SearchModal
    auth/             # AuthCardLayout
  data/
    products.json     # Product, category, brand data
  lib/
    config.ts         # Store name, contact, social, shipping, currency
    navigation.ts     # Desktop + mobile menu config
    checkout/         # Pluggable checkout provider
    repositories/     # Data access layer (JSON-backed, swappable)
    validators/       # Zod schemas
    analytics.ts      # Event tracking placeholder
    structured-data.ts # JSON-LD helpers
  store/              # Zustand stores (cart, wishlist, auth, orders)
  types/              # TypeScript types + interfaces
  i18n/               # next-intl config
  hooks/              # Custom hooks (useAuthGuard)
messages/
  en.json             # English translations (200+ keys)
  es.json             # Spanish translations
docs/
  CUSTOMIZATION.md    # Full customization guide
```

## Customization

Everything is configurable from a few key files:

| What | Where |
|------|-------|
| Store name, contact, social links | `src/lib/config.ts` |
| Theme colors (rating, wishlist, status) | `src/app/globals.css` |
| Navigation (desktop + mobile) | `src/lib/navigation.ts` |
| Products, categories, brands | `src/data/products.json` |
| Translations | `messages/en.json`, `messages/es.json` |

See [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for the full guide.

## How the Throttle integration works

```
[Buyer]  → /checkout (shipping form)
         → POST /api/throttle/checkout-session
              ├─ POST /api/v1/carts                  (create Throttle cart)
              ├─ POST /api/v1/carts/{id}/items × N   (sync line items)
              ├─ POST /api/v1/carts/{id}/checkout    (cart → draft order)
              └─ POST /api/v1/checkout-sessions/embed-token
         ← { checkoutSessionId, embedUrl, orderId }
         → Mounts <PaymentEmbed sessionId=... /> from
           `@usethrottle/checkout-react`
         → Throttle iframe captures payment via the connected provider
         → `onSucceeded` → /checkout/success?order_id=...
                            ↑ fetches order from /api/throttle/orders/[id]

[Throttle] → POST /api/throttle/webhook
              ├─ HMAC-SHA256 verify against THROTTLE_WEBHOOK_SECRET
              └─ fan out to per-event handlers (order.*, payment.*)
```

Key files:

| File | Purpose |
|------|---------|
| `src/lib/throttle/client.ts` | Auth + JSON-envelope fetch wrapper for `https://api.usethrottle.dev`. |
| `src/lib/throttle/cart.ts` | `createCart`, `addCartItems`, `checkoutCart`. |
| `src/lib/throttle/sessions.ts` | `createEmbedSession` for the PaymentEmbed. |
| `src/lib/throttle/orders.ts` | `getOrder`, `listOrders` with cursor pagination. |
| `src/lib/throttle/webhook.ts` | `verifyThrottleSignature` (`X-Throttle-Signature`). |
| `src/lib/throttle/checkout-provider.ts` | Implements the starter's `CheckoutProvider` interface against Throttle. |
| `src/app/api/throttle/checkout-session/route.ts` | Server route the checkout page calls. |
| `src/app/api/throttle/webhook/route.ts` | Signature-verified webhook receiver. |
| `src/app/api/throttle/orders/route.ts` | Lists orders by buyer email for the account dashboard. |
| `src/app/api/throttle/orders/[id]/route.ts` | Fetches a single order by id (success page). |
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

**Admin gate**

The admin section checks `user.role === "admin"`. Under Clerk, set the role on the user's `publicMetadata.role` from the Clerk dashboard. Under the demo provider, role lives on the Zustand user object (set via the demo accounts in `src/store/auth.ts`).

### Subscribing to webhooks

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
| `/account` | Account dashboard |
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
