# Customization Guide

How to customize this starter for your store. The storefront, theming,
catalog, and i18n are all driven by a few config files. The commerce
engine ([Throttle](https://usethrottle.dev)) and auth ([Clerk](https://clerk.com))
are pre-wired but swappable.

For the architecture of the Throttle + Clerk integration (cart sync,
checkout, webhooks, customer mirror, security), see the **How the
Throttle integration works** and **Authentication** sections of the
[README](../README.md).

## Quick Start Checklist

1. Copy `.env.local.example` → `.env.local` and fill in your Throttle + Clerk keys (see [Environment Variables](#environment-variables))
2. Update `src/lib/config.ts` with your store name, contact info, and social links
3. Update product data in `src/data/products.json` (images fall back to `public/images/products/placeholder.png`)
4. Edit theme colors in `src/app/globals.css`
5. Configure navigation in `src/lib/navigation.ts`

## Store Configuration

All store-wide settings live in one file: `src/lib/config.ts`

```typescript
export const siteConfig = {
  name: "Your Store Name",
  tagline: "Your tagline here.",
  contact: { email: "you@yourstore.com", ... },
  social: { instagram: "https://instagram.com/yourstore", ... },
  freeShippingThreshold: 7500, // $75.00 in cents
  taxRate: 0.08,
  currency: "USD",
  locale: "en-US",
}
```

Referenced by the header, footer, metadata, cart summary, trust signals, and more. Change it once, it updates everywhere.

> Note: `freeShippingThreshold` / `taxRate` here are display estimates used before checkout. At checkout, **real** shipping rates and tax come from Throttle's `shippingTax.calculateCart` (when a shipping/tax provider is connected to your Throttle store).

## Theme & Colors

Edit CSS variables in `src/app/globals.css` under `:root`:

```css
/* Base colors (shadcn/ui) */
--primary: oklch(0.205 0 0);        /* buttons, active states */
--secondary: oklch(0.97 0 0);       /* secondary buttons */
--destructive: oklch(0.577 0.245 27.325); /* errors, delete */

/* Store accent colors */
--rating: oklch(0.795 0.184 86.047);    /* star rating color */
--wishlist: oklch(0.637 0.237 25.331);  /* wishlist heart color */
--success: oklch(0.627 0.194 149.214);  /* checkmarks, success */

/* Order status badge colors */
--status-pending-bg: ...
--status-processing-bg: ...
```

Use them in Tailwind: `text-rating`, `fill-wishlist`, `bg-status-delivered-bg`, etc.

## Font

The store uses Inter via `next/font`. To change it, edit `src/app/layout.tsx`:

```typescript
import { Poppins } from "next/font/google"
const font = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })
```

And update `--font-sans` in `globals.css`.

## Navigation

All menus (desktop nav, mobile menu) are configured in `src/lib/navigation.ts`:

```typescript
export const shopLinks = [
  { name: "Electronics", href: "/electronics" },
  // add/remove categories here
]

export const mobileMenuSections = [
  { label: "Shop", items: shopLinks },
  { label: "Account", items: accountLinks },
  { label: "Info", items: infoLinks },
]
```

## Products & Categories

Product data lives in `src/data/products.json`. To add a product:

1. Add the product object to the `products` array
2. Reference existing `categoryIds` or create new categories
3. Assign a `brandId` from the `brands` array
4. Set image URLs. Missing/broken images fall back to `public/images/products/placeholder.png` automatically (see `ProductImage` in `src/components/ui/product-image.tsx`)

> Image URLs that get sent to Throttle (cart line items, orders) must be **absolute** `http(s)` URLs — Throttle rejects relative paths. The cart sync route drops relative image URLs before sending; supply absolute CDN URLs in `products.json` if you want product images to appear on Throttle-side line items.

Note: this starter is **bring-your-own-catalog** — Throttle is the commerce engine (cart, checkout, orders, customers, subscriptions), but your product catalog lives in `products.json` (or whatever you swap in). To move the catalog to a CMS or database, implement the `ProductRepository` / `CategoryRepository` interfaces from `src/types/index.ts` and update `src/lib/repositories/index.ts`.

## Blog & Pages (Markdown)

Blog posts and CMS pages are plain markdown files — no CMS required:

- `content/blog/<slug>.md` → `/blog/<slug>`
- `content/pages/<slug>.md` → `/pages/<slug>`

The **filename is the URL slug**; YAML frontmatter holds the metadata; the markdown body renders via `react-markdown` (GitHub-flavored markdown, XSS-safe — raw HTML in the source is not rendered).

```markdown
---
id: "post-7"
title: "My New Post"
excerpt: "A short summary for the listing page."
author: "The Team"
tags: ["guides"]
publishedAt: "2026-01-01T10:00:00Z"
---

## A heading

Body content in **markdown**. Internal [links](/contact) work too.
```

Add a post or page by dropping a new `.md` file in the folder — no code changes. Frontmatter fields map to the `BlogPost` / `CmsPage` types in `src/types/index.ts`. The loader is `src/lib/content/markdown.ts`; the repositories (`markdown-blog-repository.ts`, `markdown-page-repository.ts`) read these folders and are swappable like the product repository.

## Commerce Engine (Throttle)

Throttle is pre-wired as the commerce engine — cart sync, checkout sessions, the `PaymentEmbed`, orders, customers, addresses, payment methods, discounts, shipping/tax, and subscriptions. The wiring lives in `src/lib/throttle/*` and `src/app/api/throttle/*`.

**To use it**, set `THROTTLE_API_KEY` + `THROTTLE_STORE_ID` (see [Environment Variables](#environment-variables)) and allow your origin for the embed:

```bash
curl -X PUT https://api.usethrottle.dev/api/v1/embed-config \
  -H "x-api-key: $THROTTLE_API_KEY" \
  -H "content-type: application/json" \
  -d '{"allowed_origins":["http://localhost:3000","https://your-domain.com"]}'
```

Without `THROTTLE_API_KEY` + `THROTTLE_STORE_ID`, the starter falls back to a stub checkout provider so the UI keeps rendering — but no real cart/order/payment is created.

**To swap engines** (e.g. Stripe), the checkout layer is behind a pluggable interface:

```typescript
interface CheckoutProvider {
  createSession(cart, customer?): Promise<CheckoutSession>
  getSession(sessionId): Promise<CheckoutSession>
  handleWebhook(payload, signature): Promise<WebhookResult>
}
```

1. Create `src/lib/checkout/your-provider.ts` implementing `CheckoutProvider`
2. Re-point the export in `src/lib/checkout/index.ts`
3. Add a webhook route under `src/app/api/`

## Authentication (Clerk)

Clerk is the default auth provider, behind a pluggable `AuthProvider` seam (`src/lib/auth/*`). On a buyer's first authenticated request, the Clerk user is mirrored to a Throttle customer (the Clerk user id is stored as the customer's `externalId`), so orders, addresses, and subscriptions scope to that customer.

**To use it**, set `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Without them, the starter falls back to a localStorage-backed mock auth so the UI still renders, and the order-read routes return `501` (they refuse to identify a buyer from request input alone).

**To swap providers** (NextAuth, Lucia, magic-link, etc.):

1. Implement the one-method `AuthProvider` interface in `src/lib/auth/types.ts`
2. Re-point the export in `src/lib/auth/index.ts`
3. Replace the auth route pages in `src/app/(store)/auth/*` with your provider's UI

## Internationalization (i18n)

The starter uses `next-intl` with translation files in `messages/`:

- `messages/en.json` — English (default)
- `messages/es.json` — Spanish (example)

```tsx
// Client components
import { useTranslations } from "next-intl"
const t = useTranslations("cart")

// Server components
import { getTranslations } from "next-intl/server"
const t = await getTranslations("shop")
```

To add a language: copy `messages/en.json` to `messages/<locale>.json`, translate, and add the locale to `src/i18n/config.ts`. For locale routing (`/en/`, `/fr/`), add `next-intl` middleware.

## Analytics

Edit `src/lib/analytics.ts` to connect your analytics provider:

```typescript
export function trackEvent(name, properties) {
  // Replace with your provider:
  window.gtag?.("event", name, properties)
  // or: window.analytics?.track(name, properties)
  // or: posthog?.capture(name, properties)
}
```

Pre-defined ecommerce events include `addToCart`, `purchase`, `search`, `viewProduct`, `signUp`, `login`.

## Security Headers

Security headers + CSP are configured in `src/middleware.ts`, composed with Clerk's middleware. The CSP runs in `report-only` mode in development and enforces in production, and already allow-lists Clerk and the Throttle checkout origin. Add directives when you introduce external scripts (analytics, other SDKs).

## Environment Variables

All env vars are validated in `src/lib/env.ts` with Zod. Copy `.env.local.example` to `.env.local` and fill in:

**Throttle (commerce)**

| Var | Required | Purpose |
|-----|----------|---------|
| `THROTTLE_API_KEY` | yes | Server-side secret key (`sk_…`). |
| `THROTTLE_STORE_ID` | yes | UUID of the Throttle store/application carts + orders attach to. |
| `THROTTLE_WEBHOOK_SECRET` | for webhooks | Verifies signatures on `/api/throttle/webhook`. |

**Clerk (auth)**

| Var | Required | Purpose |
|-----|----------|---------|
| `CLERK_SECRET_KEY` | yes | Server-side secret key (`sk_…`). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Browser publishable key (`pk_…`). |
| `CLERK_WEBHOOK_SIGNING_SECRET` | for webhooks | Verifies `/api/webhooks/clerk` (customer mirror). |

Path/origin defaults (`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_THROTTLE_CHECKOUT_URL`, etc.) ship in the committed `.env` and rarely need changing — override in `.env.local` only if you mount things differently.
