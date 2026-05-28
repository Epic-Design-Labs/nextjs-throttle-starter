import "server-only"

import { env } from "@/lib/env"
import { clerkAuthProvider } from "./clerk-provider"
import { demoAuthProvider } from "./demo-provider"
import type { AuthProvider } from "./types"

/**
 * Active auth provider. Clerk is the default when its env vars are
 * present; otherwise the demo stub keeps the starter booting for
 * offline UI work.
 *
 * To swap providers, implement {@link AuthProvider} and re-point this
 * export. The rest of the app only reads from `authProvider`.
 */
export const authProvider: AuthProvider =
  env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? clerkAuthProvider
    : demoAuthProvider

export const isClerkConfigured = Boolean(
  env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

export type { AuthProvider, AuthUser } from "./types"
