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
  method_type?: PaymentMethodKind
  cardBrand?: string | null
  card_brand?: string | null
  cardLastFour?: string | null
  card_last_four?: string | null
  cardExpMonth?: number | null
  card_exp_month?: number | null
  cardExpYear?: number | null
  card_exp_year?: number | null
  isDefault?: boolean
  is_default?: boolean
  [key: string]: unknown
}

// api-client TypeScript schema is snake_case but the live API responds
// camelCase. Read both keys defensively, same pattern as orders + customers.
function normalise(raw: RawPaymentMethod): PaymentMethod {
  return {
    id: (raw.id as string) ?? "",
    processor: (raw.processor as string) ?? "",
    type: (raw.methodType ?? raw.method_type ?? "card") as PaymentMethodKind,
    cardBrand: (raw.cardBrand ?? raw.card_brand) as string | null,
    cardLast4: (raw.cardLastFour ?? raw.card_last_four) as string | null,
    cardExpMonth: (raw.cardExpMonth ?? raw.card_exp_month) as number | null,
    cardExpYear: (raw.cardExpYear ?? raw.card_exp_year) as number | null,
    isDefault: Boolean(raw.isDefault ?? raw.is_default),
  }
}

export async function listPaymentMethods(
  customerId: string
): Promise<PaymentMethod[]> {
  configureApiClient()
  try {
    const result = (await CustomersService.getApiV1CustomersPaymentMethods(
      customerId
    )) as { data?: RawPaymentMethod[] }
    return (result.data ?? []).map(normalise)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

// api-client's PATCH and DELETE generators only fill the second URL
// segment (`{id}`) at runtime, leaving `{customerId}` as a literal
// template placeholder. Same broken-URL-builder bug filed against
// customer-addresses. Fall back to direct fetch.
async function directRequest<T>(
  method: "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T | undefined> {
  if (!env.THROTTLE_API_KEY) {
    throw new Error("THROTTLE_API_KEY is not set.")
  }
  const res = await fetch(`${env.THROTTLE_API_BASE_URL}${path}`, {
    method,
    headers: {
      "x-api-key": env.THROTTLE_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string } })?.error
    throw toThrottleApiError(
      new Error(err?.message ?? `Throttle ${method} ${path} failed (${res.status})`)
    )
  }
  return (payload as { data?: T })?.data ?? (payload as T)
}

export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<PaymentMethod> {
  // encodeURIComponent both ids even though route handlers UUID-validate
  // them — defense in depth (same posture as customer-addresses).
  const raw = await directRequest<RawPaymentMethod>(
    "PATCH",
    `/api/v1/customers/${encodeURIComponent(customerId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`,
    { isDefault: true }
  )
  return normalise(raw ?? {})
}

export async function removePaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  await directRequest<void>(
    "DELETE",
    `/api/v1/customers/${encodeURIComponent(customerId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`
  )
}
