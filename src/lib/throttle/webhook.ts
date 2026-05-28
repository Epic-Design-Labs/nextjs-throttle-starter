import { createHmac, timingSafeEqual } from "node:crypto"

export const THROTTLE_SIGNATURE_HEADER = "x-throttle-signature"

interface ParsedSignature {
  t: string
  v1: string
}

function parseSignatureHeader(header: string): ParsedSignature | null {
  const parts: Record<string, string> = {}
  for (const segment of header.split(",")) {
    const [key, value] = segment.trim().split("=")
    if (key && value) parts[key] = value
  }
  if (!parts.t || !parts.v1) return null
  return { t: parts.t, v1: parts.v1 }
}

/**
 * HMAC-SHA256 verification of a Throttle webhook signature.
 *
 * The `X-Throttle-Signature` header carries a timestamp and a v1 hash:
 *   `t=1717000000,v1=<hex>`
 *
 * The signed payload is `<timestamp>.<raw request body>`. Always pass
 * the raw body text (not a re-stringified JSON) — JSON.stringify can
 * reorder keys or change whitespace and break the hash.
 */
export function verifyThrottleSignature({
  rawBody,
  header,
  secret,
  toleranceSeconds = 300,
}: {
  rawBody: string
  header: string | null | undefined
  secret: string
  toleranceSeconds?: number
}): boolean {
  if (!header) return false
  const parsed = parseSignatureHeader(header)
  if (!parsed) return false

  // Reject signatures older than the tolerance window to mitigate replay.
  const timestamp = Number.parseInt(parsed.t, 10)
  if (!Number.isFinite(timestamp)) return false
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp)
  if (ageSeconds > toleranceSeconds) return false

  const expected = createHmac("sha256", secret)
    .update(`${parsed.t}.${rawBody}`)
    .digest("hex")

  const expectedBuf = Buffer.from(expected, "hex")
  const providedBuf = Buffer.from(parsed.v1, "hex")
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}
