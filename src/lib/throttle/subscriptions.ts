import "server-only"

import { OpenAPI, SubscriptionsService } from "@usethrottle/api-client"
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

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "past_due"
  | "trialing"

export type SubscriptionInterval = "weekly" | "monthly" | "quarterly" | "yearly"

export interface ThrottleSubscription {
  id: string
  /** Owning customer. Null only when the underlying record is system-orphaned. */
  customerId: string | null
  status: SubscriptionStatus
  planReference: string
  planName: string | null
  interval: SubscriptionInterval
  amount: number
  currency: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
}

interface RawSubscription {
  id?: string
  customerId?: string | null
  status?: SubscriptionStatus
  planReference?: string
  planName?: string | null
  interval?: SubscriptionInterval
  amount?: number
  currency?: string
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
  createdAt?: string
}

function normalise(raw: RawSubscription): ThrottleSubscription {
  return {
    id: raw.id ?? "",
    customerId: raw.customerId ?? null,
    status: raw.status ?? "cancelled",
    planReference: raw.planReference ?? "",
    planName: raw.planName ?? null,
    interval: raw.interval ?? "monthly",
    amount: raw.amount ?? 0,
    currency: raw.currency ?? "USD",
    currentPeriodStart: raw.currentPeriodStart ?? null,
    currentPeriodEnd: raw.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(raw.cancelAtPeriodEnd),
    createdAt: raw.createdAt ?? new Date().toISOString(),
  }
}

export interface ListSubscriptionsInput {
  customerId?: string
  limit?: number
  cursor?: string
}

export async function listSubscriptions(
  input: ListSubscriptionsInput = {}
): Promise<{ subscriptions: ThrottleSubscription[]; nextCursor: string | null }> {
  configureApiClient()
  try {
    // api-client positional args:
    //   (cursor, limit, customerId, externalCustomerId, status, interval, q)
    const result = (await SubscriptionsService.getApiV1Subscriptions(
      input.cursor,
      input.limit ?? 25,
      input.customerId
    )) as {
      data?: RawSubscription[]
      meta?: { pagination?: { cursor?: string | null } }
    }
    return {
      subscriptions: (result.data ?? []).map(normalise),
      nextCursor: result.meta?.pagination?.cursor ?? null,
    }
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function getSubscription(
  id: string
): Promise<ThrottleSubscription> {
  configureApiClient()
  try {
    const result = (await SubscriptionsService.getApiV1Subscriptions1(id)) as {
      data?: RawSubscription
    }
    return normalise(result.data ?? {})
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function pauseSubscription(
  id: string
): Promise<ThrottleSubscription> {
  configureApiClient()
  try {
    const result = (await SubscriptionsService.postApiV1SubscriptionsPause(
      id
    )) as { data?: RawSubscription }
    return normalise(result.data ?? {})
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function resumeSubscription(
  id: string
): Promise<ThrottleSubscription> {
  configureApiClient()
  try {
    const result = (await SubscriptionsService.postApiV1SubscriptionsResume(
      id
    )) as { data?: RawSubscription }
    return normalise(result.data ?? {})
  } catch (err) {
    throw toThrottleApiError(err)
  }
}

export async function cancelSubscription(
  id: string,
  options: { atPeriodEnd?: boolean; reason?: string } = {}
): Promise<ThrottleSubscription> {
  configureApiClient()
  try {
    // `atPeriodEnd: true` cancels at the end of the current billing
    // period; otherwise it cancels immediately.
    const result = (await SubscriptionsService.postApiV1SubscriptionsCancel(id, {
      atPeriodEnd: options.atPeriodEnd,
    })) as { data?: RawSubscription }
    return normalise(result.data ?? {})
  } catch (err) {
    throw toThrottleApiError(err)
  }
}
