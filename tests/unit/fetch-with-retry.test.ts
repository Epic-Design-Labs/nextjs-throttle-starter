import { describe, it, expect, vi, afterEach } from "vitest"
import {
  FetchRetryError,
  fetchRetryOptionsFromEnv,
  fetchWithRetry,
} from "@/lib/http/fetch-with-retry"

// Every test injects `sleep` so backoff is instant and observable.
const noSleep = () => Promise.resolve()

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : "{}", { status, headers })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchWithRetry", () => {
  it("returns the first successful response without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200))
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchWithRetry("https://pim.example/products", {}, { sleep: noSleep })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("survives a transient 503 and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200))
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchWithRetry("https://pim.example/products", {}, { sleep: noSleep })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("gives up after maxAttempts and surfaces the real error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503))
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchWithRetry(
      "https://pim.example/products",
      {},
      { maxAttempts: 3, sleep: noSleep }
    )

    // A persistent failure surfaces — it must not loop forever or swallow the
    // status into a fake success.
    expect(res.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not retry a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(404))
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchWithRetry("https://pim.example/missing", {}, { sleep: noSleep })

    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retries a 429 and honours Retry-After (capped by backoffMaxMs)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(response(200))
    vi.stubGlobal("fetch", fetchMock)
    const sleep = vi.fn().mockResolvedValue(undefined)

    await fetchWithRetry(
      "https://pim.example/products",
      {},
      { sleep, backoffMaxMs: 1_000 }
    )

    expect(sleep).toHaveBeenCalledWith(1_000)
  })

  it("retries a network error, then wraps a persistent one in FetchRetryError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      fetchWithRetry("https://pim.example/products", {}, { maxAttempts: 2, sleep: noSleep })
    ).rejects.toBeInstanceOf(FetchRetryError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("aborts an attempt that outlives timeoutMs", async () => {
    // Never settles on its own — only the per-attempt AbortController ends it.
    const fetchMock = vi.fn(
      (_input: unknown, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          )
        })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      fetchWithRetry(
        "https://pim.example/slow",
        {},
        { maxAttempts: 2, timeoutMs: 5, sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(FetchRetryError)
    // Each attempt got its own timeout window rather than sharing one budget.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never retries a POST unless explicitly allowed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503))
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchWithRetry(
      "https://pim.example/orders",
      { method: "POST" },
      { sleep: noSleep }
    )

    expect(res.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    await fetchWithRetry(
      "https://pim.example/orders",
      { method: "POST" },
      { retryNonIdempotent: true, maxAttempts: 2, sleep: noSleep }
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("propagates a caller abort instead of retrying it", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(() => {
      controller.abort()
      return Promise.reject(new DOMException("aborted", "AbortError"))
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      fetchWithRetry(
        "https://pim.example/products",
        { signal: controller.signal },
        { maxAttempts: 3, sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(DOMException)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not retry an empty-but-200 body (documented non-behaviour)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204))
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchWithRetry("https://pim.example/categories", {}, { sleep: noSleep })

    expect(res.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("fetchRetryOptionsFromEnv", () => {
  it("reads the per-adapter tuning vars", () => {
    expect(
      fetchRetryOptionsFromEnv("MINIPIM", {
        MINIPIM_FETCH_MAX_ATTEMPTS: "5",
        MINIPIM_FETCH_TIMEOUT_MS: "2500",
      })
    ).toEqual({ maxAttempts: 5, timeoutMs: 2500 })
  })

  it("falls through to defaults on unset or junk values", () => {
    expect(
      fetchRetryOptionsFromEnv("MINIPIM", { MINIPIM_FETCH_MAX_ATTEMPTS: "nope" })
    ).toEqual({ maxAttempts: undefined, timeoutMs: undefined })
  })
})
