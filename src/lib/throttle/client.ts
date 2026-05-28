import { env } from "@/lib/env"
import type {
  ThrottleEnvelope,
  ThrottleErrorEnvelope,
} from "./types"

const API_VERSION_PREFIX = "/api/v1"

export class ThrottleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ThrottleErrorEnvelope["error"]["details"]
  ) {
    super(message)
    this.name = "ThrottleApiError"
  }
}

function requireApiKey(): string {
  if (!env.THROTTLE_API_KEY) {
    throw new Error(
      "THROTTLE_API_KEY is not set. Add it to .env.local. See .env.local.example."
    )
  }
  return env.THROTTLE_API_KEY
}

export interface ThrottleFetchOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

async function rawRequest(
  path: string,
  options: ThrottleFetchOptions = {}
): Promise<unknown> {
  const apiKey = requireApiKey()
  const { body, query, headers: extraHeaders, ...rest } = options

  const isAbsolute = /^https?:\/\//i.test(path)
  const isVersionedPath = path.startsWith(API_VERSION_PREFIX)
  const url = new URL(
    isAbsolute
      ? path
      : `${env.THROTTLE_API_BASE_URL}${isVersionedPath ? path : `${API_VERSION_PREFIX}${path}`}`
  )
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    ...rest,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null

  const text = await response.text()
  const json = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const errPayload = json as ThrottleErrorEnvelope | null
    const code = errPayload?.error?.code ?? "throttle_error"
    const message =
      errPayload?.error?.message ?? `Throttle API error ${response.status}`
    throw new ThrottleApiError(
      response.status,
      code,
      message,
      errPayload?.error?.details
    )
  }
  return json
}

/**
 * Low-level fetch wrapper for the Throttle REST API. Adds auth + JSON
 * encoding, unwraps the `{ data, meta }` envelope, and throws
 * ThrottleApiError on non-2xx responses.
 *
 * Path is appended to /api/v1 by default — pass an absolute URL or a
 * path beginning with `/api/v1` to bypass the prefix.
 */
export async function throttleFetch<T>(
  path: string,
  options: ThrottleFetchOptions = {}
): Promise<T> {
  const json = await rawRequest(path, options)
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as ThrottleEnvelope<T>).data
  }
  return json as T
}

/**
 * Same as {@link throttleFetch} but returns the full `{ data, meta }`
 * envelope. Use this when you need pagination cursors.
 */
export async function throttleFetchEnvelope<T>(
  path: string,
  options: ThrottleFetchOptions = {}
): Promise<ThrottleEnvelope<T>> {
  const json = await rawRequest(path, options)
  return json as ThrottleEnvelope<T>
}
