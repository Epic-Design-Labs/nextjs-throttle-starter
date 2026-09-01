/**
 * Bounded-retry `fetch` for adapter/repository modules.
 *
 * A transient upstream hiccup (a 503 from a PIM, a 429 from a rate limiter, a
 * dropped socket) shouldn't fail a page render or, worse, a whole static build.
 * This wraps `fetch` with:
 *   - retries on 408/425/429/5xx and on network/abort errors,
 *   - exponential backoff with jitter between attempts,
 *   - an `AbortController` timeout *per attempt* (not per call),
 *   - `Retry-After` support (seconds or HTTP-date), capped.
 *
 * Deliberately NOT retried:
 *   - 4xx other than 408/425/429 — a bad request won't fix itself.
 *   - Non-idempotent methods (anything but GET/HEAD/OPTIONS) unless the caller
 *     passes `retryNonIdempotent: true`. Retrying a POST can double-charge or
 *     duplicate an order.
 *   - **An empty-but-200 response.** It is indistinguishable from a legitimately
 *     empty collection here. For *critical* data (e.g. nav categories) the
 *     caller should treat an unexpected empty as retryable itself, or serve
 *     last-good — otherwise a static build happily bakes an empty nav.
 *
 * Per-adapter tuning comes from env, so each connector can be dialed
 * independently (`MINIPIM_FETCH_MAX_ATTEMPTS`, `MINIPIM_FETCH_TIMEOUT_MS`, …):
 *
 *   fetchWithRetry(url, init, fetchRetryOptionsFromEnv("MINIPIM"))
 */

export interface FetchWithRetryOptions {
  /** Total attempts, including the first (default 3, floor 1). */
  maxAttempts?: number
  /** Abort an individual attempt after this many ms (default 10_000). */
  timeoutMs?: number
  /** Base backoff in ms; attempt N waits ~base * 2^(N-1) + jitter (default 250). */
  backoffBaseMs?: number
  /** Upper bound for a single backoff wait, incl. `Retry-After` (default 10_000). */
  backoffMaxMs?: number
  /** Allow retrying non-idempotent methods (POST/PUT/PATCH/DELETE). Default false. */
  retryNonIdempotent?: boolean
  /** Seam for tests. */
  sleep?: (ms: number) => Promise<void>
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509])
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

const DEFAULTS = {
  maxAttempts: 3,
  timeoutMs: 10_000,
  backoffBaseMs: 250,
  backoffMaxMs: 10_000,
}

/** Thrown when every attempt failed with a network/timeout error. */
export class FetchRetryError extends Error {
  readonly attempts: number
  readonly cause?: unknown

  constructor(message: string, attempts: number, cause?: unknown) {
    super(message)
    this.name = "FetchRetryError"
    this.attempts = attempts
    this.cause = cause
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Read `<PREFIX>_FETCH_MAX_ATTEMPTS` / `<PREFIX>_FETCH_TIMEOUT_MS` so an
 * adapter can be tuned per environment without a code change. Unset or
 * non-numeric values fall through to the defaults.
 */
export function fetchRetryOptionsFromEnv(
  prefix: string,
  env: Record<string, string | undefined> = process.env
): FetchWithRetryOptions {
  return {
    maxAttempts: positiveInt(env[`${prefix}_FETCH_MAX_ATTEMPTS`]),
    timeoutMs: positiveInt(env[`${prefix}_FETCH_TIMEOUT_MS`]),
  }
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) into ms, if usable. */
function retryAfterMs(response: Response, now: number): number | undefined {
  const header = response.headers.get("retry-after")
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export async function fetchWithRetry(
  input: string | URL | Request,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULTS.maxAttempts)
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULTS.backoffBaseMs
  const backoffMaxMs = options.backoffMaxMs ?? DEFAULTS.backoffMaxMs
  const sleep = options.sleep ?? defaultSleep

  const method = (
    init.method ??
    (input instanceof Request ? input.method : "GET")
  ).toUpperCase()
  const methodRetryable =
    options.retryNonIdempotent === true || IDEMPOTENT_METHODS.has(method)

  const backoffFor = (attempt: number) =>
    Math.min(
      backoffMaxMs,
      backoffBaseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 200)
    )

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // A fresh controller per attempt: the timeout bounds one request, so a
    // retried call gets a full window rather than inheriting a spent budget.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    // Respect a caller-supplied signal without discarding ours.
    const onCallerAbort = () => controller.abort()
    init.signal?.addEventListener("abort", onCallerAbort, { once: true })

    try {
      const response = await fetch(input, { ...init, signal: controller.signal })

      const shouldRetry =
        methodRetryable &&
        RETRYABLE_STATUS.has(response.status) &&
        attempt < maxAttempts
      if (!shouldRetry) return response

      const wait = Math.min(
        backoffMaxMs,
        retryAfterMs(response, Date.now()) ?? backoffFor(attempt)
      )
      await sleep(wait)
    } catch (error) {
      lastError = error
      // The caller's own abort is intentional — never retry it.
      if (init.signal?.aborted) throw error
      if (!methodRetryable || attempt >= maxAttempts) {
        throw new FetchRetryError(
          `fetch failed after ${attempt} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`,
          attempt,
          error
        )
      }
      await sleep(backoffFor(attempt))
    } finally {
      clearTimeout(timer)
      init.signal?.removeEventListener("abort", onCallerAbort)
    }
  }

  // Unreachable: the loop either returns a response or throws.
  throw new FetchRetryError(
    "fetch retry loop exhausted without a response",
    maxAttempts,
    lastError
  )
}
