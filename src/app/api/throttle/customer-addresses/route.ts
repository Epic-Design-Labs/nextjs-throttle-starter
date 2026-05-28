import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import {
  createAddress,
  listAddresses,
} from "@/lib/throttle/customer-addresses"
import { ThrottleApiError } from "@/lib/throttle"

const AddressSchema = z.object({
  label: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().length(2).optional(),
  phone: z.string().optional(),
  isDefault: z.boolean().optional(),
})

async function requireCustomerId(): Promise<string | NextResponse> {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Throttle is not configured." } },
      { status: 503 }
    )
  }
  if (!isClerkConfigured) {
    return NextResponse.json(
      {
        error: {
          code: "auth_not_configured",
          message:
            "Cannot read/write addresses without a configured auth provider.",
        },
      },
      { status: 501 }
    )
  }
  const user = await authProvider.getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Not signed in." } },
      { status: 401 }
    )
  }
  if (!user.throttleCustomerId) {
    return NextResponse.json(
      {
        error: {
          code: "customer_not_linked",
          message: "No Throttle customer link yet — try again in a moment.",
        },
      },
      { status: 409 }
    )
  }
  return user.throttleCustomerId
}

export async function GET() {
  const result = await requireCustomerId()
  if (result instanceof NextResponse) return result
  try {
    const addresses = await listAddresses(result)
    return NextResponse.json({ addresses })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] list addresses failed:", error)
    return NextResponse.json(
      { error: { code: "list_failed", message: "Failed to list addresses." } },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const result = await requireCustomerId()
  if (result instanceof NextResponse) return result

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }
  const parsed = AddressSchema.safeParse(body)
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
    const address = await createAddress(result, parsed.data)
    return NextResponse.json({ address }, { status: 201 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] create address failed:", error)
    return NextResponse.json(
      { error: { code: "create_failed", message: "Failed to create address." } },
      { status: 500 }
    )
  }
}
