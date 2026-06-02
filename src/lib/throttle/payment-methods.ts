import "server-only"

import { CustomersService, OpenAPI } from "@usethrottle/api-client"
import { env } from "@/lib/env"
import { toThrottleApiError } from "./client"

let _apiClientConfigured = false
function configureApiClient() {
  if (_apiClientConfigured) return
  OpenAPI.BASE = env.THROTTLE_API_BASE_URL
  OpenAPI.TOKEN = env.THROTTLE_API_KEY ?? ""
  OpenAPI.HEADERS = { "x-api-key": env.THROTTLE_API_KEY ?? "" }
  _apiClientConfigured = true
}

export type PaymentMethodKind = "card" | "bank_account" | "wallet"

export interface PaymentMethod {
  id: string
  processor: string
  type: PaymentMethodKind
  cardBrand: string | null
  cardLast4: string | null
  cardExpMonth: number | null
  cardExpYear: number | null
  isDefault: boolean
}

interface RawPaymentMethod {
  id?: string
  processor?: string
  methodType?: PaymentMethodKind
  cardBrand?: string | null
  cardLastFour?: string | null
  cardExpMonth?: number | null
  cardExpYear?: number | null
  isDefault?: boolean
}

function normalise(raw: RawPaymentMethod): PaymentMethod {
  return {
    id: raw.id ?? "",
    processor: raw.processor ?? "",
    type: raw.methodType ?? "card",
    cardBrand: raw.cardBrand ?? null,
    cardLast4: raw.cardLastFour ?? null,
    cardExpMonth: raw.cardExpMonth ?? null,
    cardExpYear: raw.cardExpYear ?? null,
    isDefault: Boolean(raw.isDefault),
  }
}

export async function listPaymentMethods(
  customerId: string
): Promise<PaymentMethod[]> {
  configureApiClient()
  try {
    const result = await CustomersService.getApiV1CustomersPaymentMethods(
      customerId
    )
    return (result.data ?? []).map((m) => normalise(m as RawPaymentMethod))
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<PaymentMethod> {
  configureApiClient()
  try {
    const result = await CustomersService.patchApiV1CustomersPaymentMethods(
      customerId,
      paymentMethodId,
      { isDefault: true }
    )
    return normalise((result.data ?? {}) as RawPaymentMethod)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function removePaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  configureApiClient()
  try {
    await CustomersService.deleteApiV1CustomersPaymentMethods(
      customerId,
      paymentMethodId
    )
  } catch (err) {
    throw toThrottleApiError(err)
  }
}
