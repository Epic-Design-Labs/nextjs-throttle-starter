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
 * source flips to Throttle. Note the field-name translation: Throttle
 * uses `addressLine1` / `stateProvince` / `countryCode`; the starter's
 * Address shape uses `line1` / `state` / `country`.
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
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string
  stateProvince?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  isDefault?: boolean
}

function normaliseAddress(raw: RawAddress): CustomerAddress {
  return {
    id: raw.id ?? "",
    label: raw.label ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    line1: raw.addressLine1 ?? "",
    line2: raw.addressLine2 ?? undefined,
    city: raw.city ?? "",
    state: raw.stateProvince ?? "",
    postalCode: raw.postalCode ?? "",
    country: raw.countryCode ?? "",
    phone: raw.phone ?? undefined,
    isDefault: Boolean(raw.isDefault),
  }
}

export async function listAddresses(
  customerId: string
): Promise<CustomerAddress[]> {
  configureApiClient()
  try {
    const result = await CustomersService.getApiV1CustomersAddresses(customerId)
    return (result.data ?? []).map((a) => normaliseAddress(a as RawAddress))
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
  try {
    const result = await CustomersService.postApiV1CustomersAddresses(customerId, {
      label: input.label,
      firstName: input.firstName,
      lastName: input.lastName,
      addressLine1: input.line1,
      addressLine2: input.line2,
      city: input.city,
      stateProvince: input.state,
      postalCode: input.postalCode,
      countryCode: input.country ?? "US",
      phone: input.phone,
      isDefault: input.isDefault,
    })
    return normaliseAddress((result.data ?? {}) as RawAddress)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  input: Partial<AddressInput>
): Promise<CustomerAddress> {
  configureApiClient()
  try {
    const result = await CustomersService.patchApiV1CustomersAddresses(
      customerId,
      addressId,
      {
        label: input.label,
        firstName: input.firstName,
        lastName: input.lastName,
        addressLine1: input.line1,
        addressLine2: input.line2,
        city: input.city,
        stateProvince: input.state,
        postalCode: input.postalCode,
        countryCode: input.country,
        phone: input.phone,
        isDefault: input.isDefault,
      }
    )
    return normaliseAddress((result.data ?? {}) as RawAddress)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function deleteAddress(
  customerId: string,
  addressId: string
): Promise<void> {
  configureApiClient()
  try {
    await CustomersService.deleteApiV1CustomersAddresses(customerId, addressId)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}
