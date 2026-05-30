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
  status?: SubscriptionStatus
  planReference?: string
  plan_reference?: string
  planName?: string | null
  plan_name?: string | null
  interval?: SubscriptionInterval
  amount?: number
  currency?: string
  currentPeriodStart?: string | null
  current_period_start?: string | null
  currentPeriodEnd?: string | null
  current_period_end?: string | null
  cancelAtPeriodEnd?: boolean
  cancel_at_period_end?: boolean
  createdAt?: string
  created_at?: string
  [key: string]: unknown
}

function normalise(raw: RawSubscription): ThrottleSubscription {
  return {
    id: (raw.id as string) ?? "",
    status: (raw.status as SubscriptionStatus) ?? "cancelled",
    planReference: (raw.planReference ?? raw.plan_reference ?? "") as string,
    planName: (raw.planName ?? raw.plan_name) as string | null,
    interval: (raw.interval as SubscriptionInterval) ?? "monthly",
    amount: (raw.amount as number) ?? 0,
    currency: (raw.currency as string) ?? "USD",
    currentPeriodStart: (raw.currentPeriodStart ?? raw.current_period_start) as
      | string
      | null,
    currentPeriodEnd: (raw.currentPeriodEnd ?? raw.current_period_end) as
      | string
      | null,
    cancelAtPeriodEnd: Boolean(
      raw.cancelAtPeriodEnd ?? raw.cancel_at_period_end
    ),
    createdAt: (raw.createdAt ?? raw.created_at ?? new Date().toISOString()) as string,
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
    // api-client's typed schema only exposes a subset; cast through to
    // send cancel_at_period_end + reason if provided.
    const body = {
      cancel_at_period_end: options.atPeriodEnd,
      reason: options.reason,
    } as Parameters<typeof SubscriptionsService.postApiV1SubscriptionsCancel>[1]
    const result = (await SubscriptionsService.postApiV1SubscriptionsCancel(
      id,
      body
    )) as { data?: RawSubscription }
    return normalise(result.data ?? {})
  } catch (err) {
    throw toThrottleApiError(err)
  }
}
