import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { ThrottleApiError } from "@/lib/throttle"
import { POST } from "@/app/api/throttle/checkout-session/cancel/route"

const { cancelSession } = vi.hoisted(() => ({ cancelSession: vi.fn() }))

// The route resolves the provider through the @/lib/checkout barrel; mock it
// so tests control cancelSession without needing Throttle env keys.
vi.mock("@/lib/checkout", () => ({ checkoutProvider: { cancelSession } }))

const URL_ = "http://localhost:3001/api/throttle/checkout-session/cancel"

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest(URL_, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", host: "localhost:3001", ...headers },
    })
  )
}

beforeEach(() => {
  cancelSession.mockReset()
  cancelSession.mockResolvedValue(undefined)
})

describe("POST /api/throttle/checkout-session/cancel", () => {
  it("cancels a prefixed opaque session id with 204", async () => {
    const res = await post({ sessionId: "cs_a1B2c3D4e5F6" })
    expect(res.status).toBe(204)
    expect(cancelSession).toHaveBeenCalledWith("cs_a1B2c3D4e5F6")
  })

  it("accepts a UUID session id (hyphens are valid)", async () => {
    const id = "8d9c5b25-9549-47a1-9408-bc79061a4a59"
    const res = await post({ sessionId: id })
    expect(res.status).toBe(204)
    expect(cancelSession).toHaveBeenCalledWith(id)
  })

  it("rejects a path-traversal payload without calling the provider", async () => {
    const res = await post({ sessionId: "../orders/cancel-all" })
    expect(res.status).toBe(400)
    expect(cancelSession).not.toHaveBeenCalled()
  })

  it("rejects a non-JSON body with 400", async () => {
    const res = await post("not json {")
    expect(res.status).toBe(400)
    const payload = (await res.json()) as { error?: { code?: string } }
    expect(payload.error?.code).toBe("invalid_json")
  })

  it("rejects a missing sessionId with 400", async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect(cancelSession).not.toHaveBeenCalled()
  })

  it("rejects a cross-origin request with 403 before validation", async () => {
    const res = await post(
      { sessionId: "cs_a1B2c3D4e5F6" },
      { origin: "https://evil.example" }
    )
    expect(res.status).toBe(403)
    expect(cancelSession).not.toHaveBeenCalled()
  })

  it("treats an already-completed session (422) as a no-op 204", async () => {
    cancelSession.mockRejectedValueOnce(
      new ThrottleApiError(422, "already_completed", "Session already completed.")
    )
    const res = await post({ sessionId: "cs_a1B2c3D4e5F6" })
    expect(res.status).toBe(204)
  })

  it("passes through other Throttle API errors", async () => {
    cancelSession.mockRejectedValueOnce(
      new ThrottleApiError(404, "not_found", "No such session.")
    )
    const res = await post({ sessionId: "cs_a1B2c3D4e5F6" })
    expect(res.status).toBe(404)
    const payload = (await res.json()) as { error?: { code?: string } }
    expect(payload.error?.code).toBe("not_found")
  })

  it("maps unexpected errors to a 500", async () => {
    cancelSession.mockRejectedValueOnce(new Error("network down"))
    const res = await post({ sessionId: "cs_a1B2c3D4e5F6" })
    expect(res.status).toBe(500)
  })
})
