import "server-only"

import type { ShippingTaxAddress } from "@usethrottle/cart"
import { ThrottleApiError, callThrottle } from "./client"
import { getCartClient } from "./clients"

export interface ShippingMethodOption {
  id: string
  label: string
  amount: number
  currency: string
  deliveryWindowLabel?: string
}

export interface ShippingTaxQuote {
  methods: ShippingMethodOption[]
  selectedMethodId: string | null
  shippingTotal: number
  taxTotal: number
  total: number
  prompts: Array<{ field: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  errors: Array<{ code: string; message: string }>
  /** True when the underlying calc returned no methods or only errored. */
  unavailable: boolean
}

/**
 * Ask Throttle for shipping methods + tax for a cart. Throttle returns
 * both the list of available methods and the tax totals computed against
 * the cart's current shipping address. If the store has no
 * shipping/tax provider connected, the response has empty methods and
 * zero tax — we surface that via `unavailable: true` so the UI can
 * fall back to a "calculated at checkout" estimate instead of pretending
 * shipping is free.
 */
export async function calculateShippingTax(
  cartId: string,
  options: {
    shippingAddress?: ShippingTaxAddress
    selectedMethodId?: string | null
  } = {}
): Promise<ShippingTaxQuote> {
  // The cart-SDK derives its address from the cart's own shippingAddress
  // (set via carts.update). We update the cart first if a fresh address
  // was provided so the calc has something to work with.
  if (options.shippingAddress) {
    await callThrottle(() =>
      getCartClient().carts.update(cartId, {
        shippingAddress: options.shippingAddress as Record<string, unknown>,
      })
    )
  }

  const calc = await callThrottle(() =>
    getCartClient().shippingTax.calculateCart(cartId, {
      kind: "cart_estimate",
      selectedShippingMethodId: options.selectedMethodId ?? null,
    })
  )

  const methods: ShippingMethodOption[] = (calc.shipping?.methods ?? []).map(
    (m) => ({
      id: m.id,
      label: m.label,
      amount: m.amount,
      currency: m.currency,
      deliveryWindowLabel: m.deliveryWindowLabel ?? undefined,
    })
  )

  const errors = (calc.shipping?.errors ?? []).concat(calc.tax?.errors ?? [])
  const warnings = (calc.shipping?.warnings ?? []).concat(
    calc.tax?.warnings ?? []
  )

  return {
    methods,
    selectedMethodId: calc.shipping?.selectedMethod?.id ?? null,
    shippingTotal: calc.totals?.shippingTotal ?? 0,
    taxTotal: calc.totals?.taxTotal ?? 0,
    total: calc.totals?.total ?? 0,
    prompts: (calc.prompts ?? []).map((p) => ({ field: p.field, message: p.message })),
    warnings,
    errors,
    unavailable: methods.length === 0 && errors.length === 0,
  }
}

/**
 * Lock a previously-quoted method onto the cart by id. Server re-queries
 * the canonical methods for the cart and resolves the label/rate/currency
 * itself — the only thing the caller may supply is which method id to
 * pick. Sending `rateAmount` from the client would let a buyer POST
 * `{ methodId: "real", amount: 0 }` and check out with free shipping.
 *
 * Throws `unknown_method` when the requested id isn't in the current
 * quote (e.g. the buyer's address changed and the previously-shown
 * methods no longer apply).
 */
export async function selectShippingMethod(
  cartId: string,
  methodId: string
): Promise<ShippingTaxQuote> {
  const quoted = await calculateShippingTax(cartId)
  const chosen = quoted.methods.find((m) => m.id === methodId)
  if (!chosen) {
    throw new ThrottleApiError(
      400,
      "unknown_method",
      "Selected shipping method is not available for this cart."
    )
  }
  await callThrottle(() =>
    getCartClient().shipping.select(cartId, {
      methodId: chosen.id,
      displayName: chosen.label,
      rateAmount: chosen.amount,
      currency: chosen.currency,
    })
  )
  return calculateShippingTax(cartId, { selectedMethodId: chosen.id })
}
