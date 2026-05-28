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

/**
 * Shape consumed by the starter UI. Mirrors the local `Address` type
 * in src/types so existing components keep working when their data
 * source flips to Throttle.
 */
export interface CustomerAddress {
  id: string
  label?: string
  firstName?: string
  lastName?: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
  isDefault: boolean
}

interface RawAddress {
  id?: string
  label?: string | null
  firstName?: string | null
  lastName?: string | null
  first_name?: string | null
  last_name?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string
  stateProvince?: string | null
  state_province?: string | null
  postalCode?: string | null
  postal_code?: string | null
  countryCode?: string | null
  country_code?: string | null
  phone?: string | null
  isDefault?: boolean
  is_default?: boolean
  [key: string]: unknown
}

// api-client schema declares snake_case but the live API returns
// camelCase. Same defensive `pick` pattern used in lib/throttle/orders.ts.
function pickStr(o: RawAddress, snake: string, camel: string): string | undefined {
  const value =
    (o[camel] as string | null | undefined) ??
    (o[snake] as string | null | undefined)
  return value ?? undefined
}

function normaliseAddress(raw: RawAddress): CustomerAddress {
  return {
    id: (raw.id as string) ?? "",
    label: pickStr(raw, "label", "label"),
    firstName: pickStr(raw, "first_name", "firstName"),
    lastName: pickStr(raw, "last_name", "lastName"),
    line1: pickStr(raw, "address_line_1", "addressLine1") ?? "",
    line2: pickStr(raw, "address_line_2", "addressLine2"),
    city: raw.city ?? "",
    state: pickStr(raw, "state_province", "stateProvince") ?? "",
    postalCode: pickStr(raw, "postal_code", "postalCode") ?? "",
    country: pickStr(raw, "country_code", "countryCode") ?? "",
    phone: pickStr(raw, "phone", "phone"),
    isDefault: Boolean(raw.isDefault ?? raw.is_default),
  }
}

interface RawListResponse {
  data?: Array<RawAddress> | { addresses?: RawAddress[] }
}

export async function listAddresses(
  customerId: string
): Promise<CustomerAddress[]> {
  configureApiClient()
  try {
    const result = (await CustomersService.getApiV1CustomersAddresses(
      customerId
    )) as RawListResponse
    // The response shape is sometimes { data: [...] } and sometimes
    // { data: { addresses: [...] } } depending on api-client version —
    // handle both.
    let rows: RawAddress[] = []
    if (Array.isArray(result.data)) {
      rows = result.data
    } else if (result.data?.addresses) {
      rows = result.data.addresses
    }
    return rows.map(normaliseAddress)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export interface AddressInput {
  label?: string
  firstName?: string
  lastName?: string
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  isDefault?: boolean
}

export async function createAddress(
  customerId: string,
  input: AddressInput
): Promise<CustomerAddress> {
  configureApiClient()
  const body = {
    label: input.label,
    first_name: input.firstName,
    last_name: input.lastName,
    address_line_1: input.line1,
    address_line_2: input.line2,
    city: input.city,
    state_province: input.state,
    postal_code: input.postalCode,
    country_code: input.country,
    phone: input.phone,
    is_default: input.isDefault,
  } as Parameters<typeof CustomersService.postApiV1CustomersAddresses>[1]
  try {
    const result = await CustomersService.postApiV1CustomersAddresses(
      customerId,
      body
    )
    return normaliseAddress((result as { data?: RawAddress }).data ?? {})
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

// PATCH and DELETE for customer addresses fall back to direct fetch
// because api-client's generated code is broken for these two: the URL
// template is `/customers/{customerId}/addresses/{id}` but only `{id}`
// is filled at runtime — `{customerId}` is left as a literal in the
// path. Filed in the SDK feedback list. Until that lands these
// helpers send raw requests so the address page actually works.

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

export async function updateAddress(
  customerId: string,
  addressId: string,
  input: Partial<AddressInput>
): Promise<CustomerAddress> {
  const body = {
    label: input.label,
    first_name: input.firstName,
    last_name: input.lastName,
    address_line_1: input.line1,
    address_line_2: input.line2,
    city: input.city,
    state_province: input.state,
    postal_code: input.postalCode,
    country_code: input.country,
    phone: input.phone,
    is_default: input.isDefault,
  }
  // encodeURIComponent both segments even though the route handler
  // already validates them as UUIDs — defense in depth. If validation
  // ever regresses, this still prevents path traversal into other
  // Throttle endpoints (`../subscriptions/cancel-all` etc).
  const raw = await directRequest<RawAddress>(
    "PATCH",
    `/api/v1/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`,
    body
  )
  return normaliseAddress(raw ?? {})
}

export async function deleteAddress(
  customerId: string,
  addressId: string
): Promise<void> {
  await directRequest<void>(
    "DELETE",
    `/api/v1/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`
  )
}
