import { describe, it, expect } from "vitest"
import { requireUuid } from "@/lib/http/validate"

const VALID = "8d9c5b25-9549-47a1-9408-bc79061a4a59"

describe("requireUuid (SSRF / path-traversal boundary)", () => {
  it("returns the value for a valid UUID", () => {
    expect(requireUuid(VALID, "cartId")).toBe(VALID)
  })

  it("accepts an uppercase UUID", () => {
    const upper = VALID.toUpperCase()
    expect(requireUuid(upper)).toBe(upper)
  })

  it("rejects a non-UUID with a 400 response", async () => {
    const result = requireUuid("not-a-uuid")
    expect(typeof result).not.toBe("string")
    const res = result as Response
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: { code?: string } }
    expect(body.error?.code).toBe("invalid_id")
  })

  it("rejects a path-traversal payload", () => {
    const result = requireUuid("../subscriptions/cancel-all")
    expect(typeof result).not.toBe("string")
    expect((result as Response).status).toBe(400)
  })

  it("rejects an empty string", () => {
    expect(typeof requireUuid("")).not.toBe("string")
  })
})
