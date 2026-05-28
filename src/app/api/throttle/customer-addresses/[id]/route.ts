import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { authProvider, isClerkConfigured } from "@/lib/auth"
import {
  deleteAddress,
  updateAddress,
} from "@/lib/throttle/customer-addresses"
import { ThrottleApiError } from "@/lib/throttle"
import { requireUuid } from "@/lib/http/validate"

const PatchSchema = z.object({
  label: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
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
      { error: { code: "auth_not_configured", message: "Auth not configured." } },
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
      { error: { code: "customer_not_linked", message: "No Throttle customer link yet." } },
      { status: 409 }
    )
  }
  return user.throttleCustomerId
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireCustomerId()
  if (result instanceof NextResponse) return result
  const { id: rawId } = await params
  const id = requireUuid(rawId, "addressId")
  if (id instanceof NextResponse) return id

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }
  const parsed = PatchSchema.safeParse(body)
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
    const address = await updateAddress(result, id, parsed.data)
    return NextResponse.json({ address })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] update address failed:", error)
    return NextResponse.json(
      { error: { code: "update_failed", message: "Failed to update address." } },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireCustomerId()
  if (result instanceof NextResponse) return result
  const { id: rawId } = await params
  const id = requireUuid(rawId, "addressId")
  if (id instanceof NextResponse) return id

  try {
    await deleteAddress(result, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof ThrottleApiError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      )
    }
    console.error("[throttle] delete address failed:", error)
    return NextResponse.json(
      { error: { code: "delete_failed", message: "Failed to delete address." } },
      { status: 500 }
    )
  }
}
