import "server-only"

import { CartClient } from "@usethrottle/cart"
import { createCheckoutClient } from "@usethrottle/checkout-sdk/server"
import { env } from "@/lib/env"

// Lazy singletons. We hold one of each per process — the SDK clients
// are thin wrappers around fetch, so there's no connection pool to
// manage. Keeping them as singletons avoids re-reading env on every
// call and makes them trivial to mock in tests.

let _cartClient: CartClient | null = null
let _checkoutClient: ReturnType<typeof createCheckoutClient> | null = null

function requireApiKey(): string {
  if (!env.THROTTLE_API_KEY) {
    throw new Error(
      "THROTTLE_API_KEY is not set. Add it to .env.local. See .env.local.example."
    )
  }
  return env.THROTTLE_API_KEY
}

export function getCartClient(): CartClient {
  if (!_cartClient) {
    _cartClient = new CartClient({
      apiKey: requireApiKey(),
      baseUrl: env.THROTTLE_API_BASE_URL,
    })
  }
  return _cartClient
}

export function getCheckoutClient() {
  if (!_checkoutClient) {
    _checkoutClient = createCheckoutClient({
      apiKey: requireApiKey(),
      baseUrl: env.THROTTLE_API_BASE_URL,
    })
  }
  return _checkoutClient
}

export function requireStoreId(): string {
  if (!env.THROTTLE_STORE_ID) {
    throw new Error(
      "THROTTLE_STORE_ID is not set. Set it to the UUID of the Throttle store you want carts/orders written to."
    )
  }
  return env.THROTTLE_STORE_ID
}
