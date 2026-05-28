// Re-export the active checkout provider.
//
// Throttle (https://usethrottle.dev) is the engine when THROTTLE_API_KEY
// + THROTTLE_STORE_ID are configured. Without them the demo provider
// keeps the starter running for offline UI work.

import { env } from "@/lib/env"
import { throttleCheckoutProvider } from "@/lib/throttle"
import { demoCheckoutProvider } from "./demo-provider"

export const checkoutProvider =
  env.THROTTLE_API_KEY && env.THROTTLE_STORE_ID
    ? throttleCheckoutProvider
    : demoCheckoutProvider

export { demoCheckoutProvider, throttleCheckoutProvider }
