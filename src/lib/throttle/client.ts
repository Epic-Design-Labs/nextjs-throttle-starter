import "server-only"

import { ThrottleApiError as CartSdkError } from "@usethrottle/cart"
import { ThrottleCheckoutError } from "@usethrottle/checkout-sdk/server"

/**
 * Single error class the rest of the app catches against. The two
 * official SDKs throw different error classes (`ThrottleApiError` from
 * @usethrottle/cart, `ThrottleCheckoutError` from
 * @usethrottle/checkout-sdk), and an integrator should not have to
 * remember which method throws which. `toThrottleApiError` collapses
 * both into one shape.
 */
export class ThrottleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = "ThrottleApiError"
  }

  static is(err: unknown): err is ThrottleApiError {
    return err instanceof ThrottleApiError
  }
}

export function toThrottleApiError(err: unknown): ThrottleApiError {
  if (err instanceof ThrottleApiError) return err
  if (err instanceof CartSdkError || err instanceof ThrottleCheckoutError) {
    return new ThrottleApiError(
      err.statusCode,
      err.code,
      err.message,
      err.details
    )
  }
  if (err instanceof Error) {
    return new ThrottleApiError(500, "throttle_error", err.message)
  }
  return new ThrottleApiError(500, "throttle_error", "Unknown Throttle error.")
}

/**
 * Wrap a Throttle SDK call so all SDKs surface a unified error class.
 *
 * ```ts
 * const cart = await callThrottle(() => cartClient.carts.create({ ... }))
 * ```
 */
export async function callThrottle<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw toThrottleApiError(err)
  }
}
