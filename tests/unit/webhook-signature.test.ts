import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { verifyThrottleSignature } from "@/lib/throttle/webhook"

const SECRET = "whsec_test_secret"

// Build a signature header the way Throttle does: `t=<unix>,v1=<hex hmac>`
// where the signed payload is `<t>.<rawBody>`.
function sign(rawBody: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")
  return `t=${t},v1=${v1}`
}

const BODY = JSON.stringify({ id: "evt_1", type: "order.completed" })

describe("verifyThrottleSignature", () => {
  it("accepts a valid signature", () => {
    expect(
      verifyThrottleSignature({ rawBody: BODY, header: sign(BODY), secret: SECRET })
    ).toBe(true)
  })

  it("rejects a tampered body", () => {
    const header = sign(BODY)
    expect(
      verifyThrottleSignature({ rawBody: BODY + " ", header, secret: SECRET })
    ).toBe(false)
  })

  it("rejects a wrong secret", () => {
    expect(
      verifyThrottleSignature({
        rawBody: BODY,
        header: sign(BODY, "whsec_other"),
        secret: SECRET,
      })
    ).toBe(false)
  })

  it("rejects a stale timestamp beyond the tolerance window", () => {
    const old = Math.floor(Date.now() / 1000) - 10 * 60 // 10 minutes ago
    expect(
      verifyThrottleSignature({
        rawBody: BODY,
        header: sign(BODY, SECRET, old),
        secret: SECRET,
        toleranceSeconds: 300,
      })
    ).toBe(false)
  })

  it("rejects a malformed header", () => {
    expect(
      verifyThrottleSignature({ rawBody: BODY, header: "garbage", secret: SECRET })
    ).toBe(false)
  })

  it("rejects a missing header", () => {
    expect(
      verifyThrottleSignature({ rawBody: BODY, header: null, secret: SECRET })
    ).toBe(false)
  })

  it("rejects a forged hex of the right length", () => {
    const t = Math.floor(Date.now() / 1000)
    const forged = `t=${t},v1=${"a".repeat(64)}`
    expect(
      verifyThrottleSignature({ rawBody: BODY, header: forged, secret: SECRET })
    ).toBe(false)
  })
})
