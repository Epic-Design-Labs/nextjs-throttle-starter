import { NextResponse } from "next/server"

// Throttle resource ids are RFC-4122 UUIDs. Validate at the route
// boundary because the SDKs we call (@usethrottle/cart and @usethrottle/api-client)
// interpolate these into URL templates without encoding, so a malicious
// segment like `../subscriptions/cancel-all` could redirect the
// upstream request. Defense in depth.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Assert that a value coming off a Next.js route param looks like a
 * UUID. Returns the value when valid, or a 400 NextResponse when not —
 * callers should `if (result instanceof NextResponse) return result`.
 */
export function requireUuid(
  value: string,
  fieldName = "id"
): string | NextResponse {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_id",
          message: `Expected a UUID for ${fieldName}.`,
        },
      },
      { status: 400 }
    )
  }
  return value
}
