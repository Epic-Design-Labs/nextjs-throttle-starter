import { NextResponse } from "next/server"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import { listAddresses } from "@/lib/throttle/customer-addresses"
import { ThrottleApiError } from "@/lib/throttle"
import { env } from "@/lib/env"

// Returns the signed-in buyer's identity + default shipping address.
// Used by the checkout page to prefill the shipping form so signed-in
// buyers don't retype what we already know.
export async function GET() {
  if (!isClerkConfigured) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  const user = await authProvider.getCurrentUser()
  if (!user) {
    return NextResponse.json({ user: null })
  }

  let defaultAddress = null
  if (
    env.THROTTLE_API_KEY &&
    env.THROTTLE_STORE_ID &&
    user.throttleCustomerId
  ) {
    try {
      const addresses = await listAddresses(user.throttleCustomerId)
      defaultAddress =
        addresses.find((a) => a.isDefault) ?? addresses[0] ?? null
    } catch (err) {
      // Don't fail the whole call just because address lookup failed —
      // the buyer can still complete checkout by typing the form.
      if (err instanceof ThrottleApiError) {
        console.warn(
          "[auth/me] address lookup failed:",
          err.code,
          err.message
        )
      } else {
        console.warn("[auth/me] address lookup failed:", err)
      }
    }
  }

  return NextResponse.json({
    user: {
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    },
    defaultAddress,
  })
}
