import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// Next 16 renamed the `middleware` file convention to `proxy` (same runtime,
// same exports — see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/proxy.md). This file replaces the former
// src/middleware.ts; `next build` warns on the old name.

const isProtectedRoute = createRouteMatcher([
  "/account(.*)",
  "/api/throttle/orders(.*)",
  "/api/throttle/customer-addresses(.*)",
  "/api/throttle/customer-payment-methods(.*)",
  "/api/throttle/subscriptions(.*)",
  // /api/throttle/subscriptions/[id] action routes are also auth-gated
  // by the matcher above (subscriptions(.*) catches subpaths).
  "/api/account(.*)",
  "/api/auth/me",
])

const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

/**
 * A set of CSP additions, keyed by directive. Both the base policy and every
 * optional connector module speak this shape so the final header is *composed*
 * from whatever is enabled, rather than shipping a fixed superset of origins
 * for integrations this storefront may not use.
 */
type CspDirectives = Record<string, string[]>

/**
 * Base policy — core storefront only: self, Clerk (auth), Throttle (checkout
 * embed).
 *
 * No `'unsafe-eval'`: nothing in the production bundle needs it. `img-src` and
 * `media-src` stay permissive (`https:`) because product/CMS media comes from
 * arbitrary CDNs; `media-src` is explicit because without it audio/video falls
 * back to `default-src 'self'` and third-party media (e.g. a support widget's
 * notification sound) is blocked.
 *
 * TODO (hardening, see docs/STARTER-IMPROVEMENTS.md §E): drop 'unsafe-inline'
 * via a nonce pipeline and scope connect-src/img-src off the https: wildcard.
 */
const baseCsp: CspDirectives = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  "connect-src": ["'self'", "https:", "wss:"],
  "frame-src": [
    "'self'",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
    "https://checkout.usethrottle.dev",
  ],
  "frame-ancestors": ["'none'"],
}

/**
 * Preview-only origins. Vercel's preview-comments toolbar loads from
 * vercel.live; it must never widen the production policy.
 */
const previewCsp: CspDirectives = {
  "script-src": ["https://vercel.live"],
  "style-src": ["https://vercel.live"],
  "frame-src": ["https://vercel.live"],
}

/**
 * CSP fragments contributed by *enabled* optional connector modules.
 *
 * Each module owns its origins and exports them from a leaf `csp.ts` that has
 * ZERO imports: proxy runs ahead of (and separately from) your render code, so
 * it must not pull `server-only` modules or vendor SDKs into its bundle. A
 * module that is switched off (its env keys absent) contributes nothing.
 *
 *   import { zendeskCsp } from "@/lib/zendesk/csp"
 *   const connectorCsp: CspDirectives[] = [zendeskCsp]
 *
 * See docs/STARTER-IMPROVEMENTS.md §C for the module contract.
 */
const connectorCsp: CspDirectives[] = []

/** Merge fragments into the base policy, de-duplicating each directive. */
function composeCsp(...fragments: CspDirectives[]): string {
  const merged: CspDirectives = {}
  for (const fragment of fragments) {
    for (const [directive, values] of Object.entries(fragment)) {
      merged[directive] = [...(merged[directive] ?? []), ...values]
    }
  }
  return Object.entries(merged)
    .map(([directive, values]) => `${directive} ${[...new Set(values)].join(" ")}`)
    .join("; ")
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("X-DNS-Prefetch-Control", "on")
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  )
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  )

  const isProduction = process.env.VERCEL_ENV === "production"
  const csp = composeCsp(
    baseCsp,
    ...(isProduction ? [] : [previewCsp]),
    ...connectorCsp
  )

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Content-Security-Policy", csp)
  } else {
    response.headers.set("Content-Security-Policy-Report-Only", csp)
  }

  return response
}

// When Clerk is configured, route through clerkMiddleware so the
// auth() helper has a session on /account and /api/throttle/orders.
// Without keys we just apply security headers — no auth context, so
// protected routes stay 401 (handled in the route handlers).
export default clerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      if (isProtectedRoute(request)) {
        await auth.protect()
      }
      return applySecurityHeaders(NextResponse.next())
    })
  : function proxy(_request: NextRequest) {
      return applySecurityHeaders(NextResponse.next())
    }

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
