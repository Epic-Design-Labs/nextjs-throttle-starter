import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

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

  const csp = [
    "default-src 'self'",
    // Clerk loads its frontend SDK from clerk.com; Throttle's iframe
    // origin is allow-listed for the checkout embed.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://checkout.usethrottle.dev",
    "frame-ancestors 'none'",
  ].join("; ")

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
  : function middleware(_request: NextRequest) {
      return applySecurityHeaders(NextResponse.next())
    }

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
