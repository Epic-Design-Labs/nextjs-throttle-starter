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
  external_id?: string | null
  first_name?: string | null
  last_name?: string | null
  [key: string]: unknown
}

// The api-client TypeScript types declare snake_case but the live API
// answers camelCase, so the SDK shape lies. Read both keys defensively
// (same trick used in lib/throttle/orders.ts).
function normaliseCustomer(raw: RawCustomer): ThrottleCustomer {
  return {
    id: (raw.id as string) ?? "",
    email: (raw.email as string) ?? "",
    firstName: raw.firstName ?? raw.first_name ?? null,
    lastName: raw.lastName ?? raw.last_name ?? null,
    externalId: raw.externalId ?? raw.external_id ?? null,
  }
}

export interface CreateCustomerInput {
  email: string
  firstName?: string
  lastName?: string
  /**
   * The auth provider's user id (e.g. Clerk's `user_xxx`). Stored on
   * the Throttle customer so we can look the customer back up by
   * auth identity later.
   */
  externalId?: string
}

export async function createCustomer(
  input: CreateCustomerInput
): Promise<ThrottleCustomer> {
  configureApiClient()
  // api-client's typed schema omits `external_id`, but the live API
  // accepts it. Cast through to send it anyway. Tracked in SDK
  // feedback alongside the other api-client snake/camel issues.
  const body = {
    store_id: requireStoreId(),
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    external_id: input.externalId,
  } as Parameters<typeof CustomersService.postApiV1Customers>[0]
  try {
    const result = await CustomersService.postApiV1Customers(body)
    return normaliseCustomer(result.data as RawCustomer)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function getCustomer(customerId: string): Promise<ThrottleCustomer> {
  configureApiClient()
  try {
    const result = await CustomersService.getApiV1Customers1(customerId)
    return normaliseCustomer(result.data as RawCustomer)
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

/**
 * Look up a Throttle customer by the auth provider's user id. Useful
 * when the Clerk metadata link is missing (manual customer creation,
 * metadata wipe, etc.) and we want to rebuild it without creating a
 * duplicate.
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
      "data" in (result as object) ? (result as { data?: RawCustomer }).data : (result as RawCustomer)
    if (!data || !data.id) return null
    return normaliseCustomer(data)
  } catch (err) {
    const e = toThrottleApiError(err)
    if (e.status === 404) return null
    throw e
  }
}
