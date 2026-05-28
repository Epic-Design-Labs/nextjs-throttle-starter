import "server-only"

import type { AuthProvider, AuthUser } from "./types"

/**
 * Server-side stub used when Clerk env vars aren't configured. There
 * is no real session — every call returns `null`. The legacy mock
 * useAuthStore continues to drive *client-side* UX (account dashboard,
 * order history) for offline / starter-preview work, but server-side
 * routes that depend on getCurrentUser() (e.g. /api/throttle/orders)
 * stay locked down until a real provider is wired.
 */
export const demoAuthProvider: AuthProvider = {
  async getCurrentUser(): Promise<AuthUser | null> {
    return null
  },
}
