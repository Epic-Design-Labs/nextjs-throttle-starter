import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { ThrottleApiError, createCart } from "@/lib/throttle"

const BodySchema = z
  .object({
    externalId: z.string().optional(),
    customerEmail: z.string().email().optional(),
  })
  .optional()

// Server-side cart creation. Called by the Zustand store on the very
// first add-to-cart so the buyer's session has a durable Throttle
// cart from item #1.
export async function POST(req: NextRequest) {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }

  let body: unknown = undefined
  try {
    // Body is optional — empty POST is valid.
    const text = await req.text()
    body = text ? JSON.parse(text) : undefined
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid body." } },
      { status: 400 }
    )
  }

  try {
    const cart = await createCart(parsed.data ?? {})
    return NextResponse.json({ cart }, { status: 201 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] create cart failed:", error)
    return NextResponse.json(
      { error: { code: "create_failed", message: "Failed to create cart." } },
      { status: 500 }
    )
  }
}
