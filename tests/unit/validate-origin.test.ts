import { describe, it, expect } from "vitest"
import { assertSameOrigin } from "@/lib/http/validate"

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3001/api/throttle/checkout-session/cancel", {
    method: "POST",
    headers,
  })
}

describe("assertSameOrigin (CSRF boundary)", () => {
  it("allows a request with no Origin header (same-origin nav / server-to-server)", () => {
    expect(assertSameOrigin(request({ host: "localhost:3001" }))).toBeNull()
  })

  it("allows a same-origin request", () => {
    expect(
      assertSameOrigin(
        request({ host: "localhost:3001", origin: "http://localhost:3001" })
      )
    ).toBeNull()
  })

  it("rejects a cross-site origin with 403", () => {
    const res = assertSameOrigin(
      request({ host: "localhost:3001", origin: "https://evil.example" })
    )
    expect(res?.status).toBe(403)
  })

  it("rejects a same-host, different-port origin", () => {
    const res = assertSameOrigin(
      request({ host: "localhost:3001", origin: "http://localhost:4000" })
    )
    expect(res?.status).toBe(403)
  })

  it("rejects the opaque 'null' origin (sandboxed iframe / data: URL)", () => {
    const res = assertSameOrigin(
      request({ host: "localhost:3001", origin: "null" })
    )
    expect(res?.status).toBe(403)
  })

  it("rejects when the Host header is missing but an Origin is present", () => {
    const res = assertSameOrigin(request({ origin: "http://localhost:3001" }))
    expect(res?.status).toBe(403)
  })
})
