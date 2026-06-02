import "server-only"

import { CustomersService, OpenAPI } from "@usethrottle/api-client"
import { env } from "@/lib/env"
import { toThrottleApiError } from "./client"
import { requireStoreId } from "./clients"

let _apiClientConfigured = false
function configureApiClient() {
  if (_apiClientConfigured) return
  OpenAPI.BASE = env.THROTTLE_API_BASE_URL
  OpenAPI.TOKEN = env.THROTTLE_API_KEY ?? ""
  OpenAPI.HEADERS = { "x-api-key": env.THROTTLE_API_KEY ?? "" }
  _apiClientConfigured = true
}

export interface ThrottleCustomer {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  externalId: string | null
}

interface RawCustomer {
  id?: string
  email?: string
  firstName?: string | null
  lastName?: string | null
  externalId?: string | null
}

function normaliseCustomer(raw: RawCustomer): ThrottleCustomer {
  return {
    id: raw.id ?? "",
    email: raw.email ?? "",
    firstName: raw.firstName ?? null,
    lastName: raw.lastName ?? null,
    externalId: raw.externalId ?? null,
  }
}

export interface CreateCustomerInput {
  email: string
  firstName?: string
  lastName?: string
  /**
   * The auth provider's user id (e.g. Clerk's `user_xxx`). Persisted on
   * the Throttle customer so we can look the customer back up via
   * {@link getCustomerByExternalId}.
   */
  externalId?: string
}

export async function createCustomer(
  input: CreateCustomerInput
): Promise<ThrottleCustomer> {
  configureApiClient()
  try {
    const result = await CustomersService.postApiV1Customers({
      applicationId: requireStoreId(),
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      externalId: input.externalId,
    })
    return normaliseCustomer((result.data ?? {}) as RawCustomer)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function getCustomer(customerId: string): Promise<ThrottleCustomer> {
  configureApiClient()
  try {
    const result = await CustomersService.getApiV1Customers1(customerId)
    return normaliseCustomer((result.data ?? {}) as RawCustomer)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

/**
 * Look up a Throttle customer by the auth provider's user id. Used to
 * recover the customer link when an auth-provider metadata cache is
 * missing (manual customer creation, metadata wipe, etc.) without
 * creating a duplicate. The api-client types this endpoint as `any`,
 * so we unwrap defensively.
 */
export async function getCustomerByExternalId(
  externalId: string
): Promise<ThrottleCustomer | null> {
  configureApiClient()
  try {
    const result = (await CustomersService.getApiV1CustomersByExternal(
      externalId
    )) as { data?: RawCustomer } | RawCustomer | null
    if (!result) return null
    const data: RawCustomer | undefined =
      "data" in (result as object)
        ? (result as { data?: RawCustomer }).data
        : (result as RawCustomer)
    if (!data || !data.id) return null
    return normaliseCustomer(data)
  } catch (err) {
    const e = toThrottleApiError(err)
    if (e.status === 404) return null
    throw e
  }
}
