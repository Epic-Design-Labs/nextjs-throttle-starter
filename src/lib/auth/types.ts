/**
 * Canonical shape the rest of the app reads. Auth providers translate
 * their own session/user object into this.
 */
export interface AuthUser {
  /** The auth provider's internal user id (e.g. Clerk's `user_xxx`). */
  id: string
  email: string
  firstName?: string
  lastName?: string
  /**
   * The linked Throttle customer id. Set lazily on the first
   * authenticated server call via {@link AuthProvider.getCurrentUser}.
   */
  throttleCustomerId?: string
}

/**
 * Server-side seam for the active auth provider.
 *
 * The starter ships with a Clerk implementation. To replace it with
 * another provider (NextAuth, Lucia, magic-link, Sign-in-with-Vercel,
 * …) implement this interface and swap the export in
 * `src/lib/auth/index.ts`. The rest of the app reads only from this
 * surface.
 *
 * Sign-in / sign-up *UI* is provider-specific by design — the cost of
 * abstracting it generically outweighs the swap convenience. To swap
 * providers, you replace this interface AND the auth route pages
 * (`src/app/(store)/auth/*`). Both are small surface areas.
 */
export interface AuthProvider {
  /**
   * Return the authenticated user — including a linked Throttle
   * customer id — or `null` if no session is present. Implementations
   * are responsible for lazily creating the Throttle customer on
   * first call and caching the id (e.g. in Clerk's privateMetadata).
   */
  getCurrentUser(): Promise<AuthUser | null>
}
