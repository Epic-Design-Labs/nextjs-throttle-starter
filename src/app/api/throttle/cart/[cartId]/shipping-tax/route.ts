import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { ThrottleApiError } from "@/lib/throttle"
import {
  calculateShippingTax,
  selectShippingMethod,
} from "@/lib/throttle/shipping-tax"
import { requireUuid } from "@/lib/http/validate"

const AddressSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2),
})

const CalcSchema = z.object({
  shippingAddress: AddressSchema.optional(),
  selectedMethodId: z.string().optional(),
})

// Only methodId is accepted from the wire. label/amount/currency are
// resolved server-side from the canonical quote — never trust the
// client for prices.
const SelectSchema = z.object({
  methodId: z.string().min(1),
})

function notConfigured() {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const guard = notConfigured()
  if (guard) return guard
  const { cartId: rawCartId } = await params
  const cartId = requireUuid(rawCartId, "cartId")
  if (cartId instanceof NextResponse) return cartId

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }
  const parsed = CalcSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid body.",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    )
  }

  try {
    const quote = await calculateShippingTax(cartId, parsed.data)
    return NextResponse.json({ quote })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] calculate shipping-tax failed:", error)
    return NextResponse.json(
      { error: { code: "calc_failed", message: "Could not calculate shipping + tax." } },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const guard = notConfigured()
  if (guard) return guard
  const { cartId: rawCartId } = await params
  const cartId = requireUuid(rawCartId, "cartId")
  if (cartId instanceof NextResponse) return cartId

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }
  const parsed = SelectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Expected { methodId: string }.",
        },
      },
      { status: 400 }
    )
  }

  try {
    const quote = await selectShippingMethod(cartId, parsed.data.methodId)
    return NextResponse.json({ quote })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] select shipping method failed:", error)
    return NextResponse.json(
      { error: { code: "select_failed", message: "Could not select shipping method." } },
      { status: 500 }
    )
  }
}
