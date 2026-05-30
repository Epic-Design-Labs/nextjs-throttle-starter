"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { useAuthStore } from "@/store/auth"

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

export interface AuthGuardResult {
  user: {
    email?: string
    firstName?: string
    lastName?: string
  } | null
  isAuthenticated: boolean
  isLoading: boolean
  isReady: boolean
}

function useClerkAuthGuard(): AuthGuardResult {
  const { user, isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/auth/login")
    }
  }, [isLoaded, isSignedIn, router])

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
    isReady: Boolean(isLoaded && isSignedIn),
  }
}

function useLegacyAuthGuard(): AuthGuardResult {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.push("/auth/login")
    }
  }, [mounted, isAuthenticated, router])

  return {
    user: user
      ? {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      : null,
    isAuthenticated,
    isLoading: !mounted,
    isReady: mounted && isAuthenticated,
  }
}

// Choose the implementation at module load (NEXT_PUBLIC_* envs are
// inlined at build time) so React only ever sees one hook function in
// the call order — keeps the rules-of-hooks linter happy.
export const useAuthGuard: () => AuthGuardResult = clerkConfigured
  ? useClerkAuthGuard
  : useLegacyAuthGuard
