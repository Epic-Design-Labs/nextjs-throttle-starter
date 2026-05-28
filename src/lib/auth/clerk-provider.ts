import "server-only"

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server"
import {
  createCustomer,
  getCustomerByExternalId,
} from "@/lib/throttle/customers"
import { env } from "@/lib/env"
import type { AuthProvider, AuthUser } from "./types"

const THROTTLE_CUSTOMER_METADATA_KEY = "throttleCustomerId"

interface ClerkPrivateMetadata {
  [THROTTLE_CUSTOMER_METADATA_KEY]?: string
}

/**
 * Resolve (or lazily create) the Throttle customer id for a Clerk user.
 *
 * Lookup chain:
 *   1. Clerk privateMetadata.throttleCustomerId — fast path, single roundtrip avoided
 *   2. Throttle GET /customers/by-external/{clerkUserId} — recover when metadata is missing
 *   3. POST /customers — first-time visitor; persist the new id back to Clerk
 *
 * Throttle calls are best-effort: if the workspace isn't configured
 * (no STORE_ID, no API_KEY) we return undefined and let the caller
 * decide whether to fall back. We never throw — auth must keep
 * working even if commerce is down.
 */
async function resolveThrottleCustomerId(args: {
  clerkUserId: string
  email: string
  firstName?: string
  lastName?: string
  privateMetadata: ClerkPrivateMetadata
}): Promise<string | undefined> {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) return undefined

  const cached = args.privateMetadata[THROTTLE_CUSTOMER_METADATA_KEY]
  if (cached) return cached

  try {
    const existing = await getCustomerByExternalId(args.clerkUserId)
    if (existing) {
      await persistCustomerId(args.clerkUserId, existing.id)
      return existing.id
    }

    const created = await createCustomer({
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      externalId: args.clerkUserId,
    })
    await persistCustomerId(args.clerkUserId, created.id)
    return created.id
  } catch (err) {
    console.error("[auth/clerk] could not link Throttle customer:", err)
    return undefined
  }
}

async function persistCustomerId(
  clerkUserId: string,
  throttleCustomerId: string
): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUserMetadata(clerkUserId, {
    privateMetadata: { [THROTTLE_CUSTOMER_METADATA_KEY]: throttleCustomerId },
  })
}

export const clerkAuthProvider: AuthProvider = {
  async getCurrentUser(): Promise<AuthUser | null> {
    const { userId } = await auth()
    if (!userId) return null

    const user = await currentUser()
    if (!user) return null

    const email = user.primaryEmailAddress?.emailAddress
    if (!email) {
      // Clerk allows users without a verified primary email in some
      // flows. We require one to mirror into Throttle.
      return {
        id: user.id,
        email: "",
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
      }
    }

    const throttleCustomerId = await resolveThrottleCustomerId({
      clerkUserId: user.id,
      email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      privateMetadata: user.privateMetadata as ClerkPrivateMetadata,
    })

    return {
      id: user.id,
      email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      throttleCustomerId,
    }
  },
}
