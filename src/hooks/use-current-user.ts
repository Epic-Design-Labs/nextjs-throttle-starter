"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useClerk, useUser } from "@clerk/nextjs"
import { useAuthStore } from "@/store/auth"

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

export interface CurrentUserState {
  user: {
    email?: string
    firstName?: string
    lastName?: string
  } | null
  isAuthenticated: boolean
  /** True until the auth provider finishes hydrating client-side. */
  isLoading: boolean
  signOut: () => Promise<void>
}

function useClerkCurrentUser(): CurrentUserState {
  const { user, isLoaded, isSignedIn } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  return {
    user: user
      ? {
          email: user.primaryEmailAddress?.emailAddress,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
        }
      : null,
    isAuthenticated: Boolean(isSignedIn),
    isLoading: !isLoaded,
    signOut: async () => {
      await signOut({ redirectUrl: "/" })
      router.refresh()
    },
  }
}

function useLegacyCurrentUser(): CurrentUserState {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return {
    user: user
      ? {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      : null,
    isAuthenticated: mounted ? isAuthenticated : false,
    isLoading: !mounted,
    signOut: async () => {
      logout()
      router.push("/")
    },
  }
}

// Pick the impl at module load (NEXT_PUBLIC_* env is inlined at build
// time) so React only ever sees one hook function in the call order.
export const useCurrentUser: () => CurrentUserState = clerkConfigured
  ? useClerkCurrentUser
  : useLegacyCurrentUser
