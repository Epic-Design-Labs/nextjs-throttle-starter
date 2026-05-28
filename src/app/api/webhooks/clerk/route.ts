import { NextResponse, type NextRequest } from "next/server"
import { verifyWebhook } from "@clerk/nextjs/webhooks"
import { clerkClient } from "@clerk/nextjs/server"
import { env } from "@/lib/env"
import {
  createCustomer,
  getCustomerByExternalId,
} from "@/lib/throttle/customers"

// Clerk → Throttle customer mirror.
//
// The lazy upsert in clerkAuthProvider.getCurrentUser already handles
// the common case (first authenticated server call creates the
// customer). This webhook catches the gaps:
//   • Users created via Clerk's dashboard or social SSO before they
//     make their first server call to this app.
//   • Profile updates (name change in Clerk's <UserProfile />) we want
//     reflected on the Throttle customer record.
//
// Provisioning:
//   1. clerk.com → Webhooks → Add Endpoint
//   2. URL: https://<your-public-host>/api/webhooks/clerk
//      (For local dev use ngrok / cloudflared / Clerk's tunneling.)
//   3. Subscribe to: user.created, user.updated
//   4. Copy the Signing Secret into CLERK_WEBHOOK_SIGNING_SECRET.

export async function POST(req: NextRequest) {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json(
      {
        error: {
          code: "webhook_secret_missing",
          message:
            "CLERK_WEBHOOK_SIGNING_SECRET is not set. Provision an endpoint in clerk.com → Webhooks and copy the Signing Secret.",
        },
      },
      { status: 500 }
    )
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>
  try {
    event = await verifyWebhook(req, {
      signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
    })
  } catch (err) {
    console.error("[clerk webhook] verify failed:", err)
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Signature mismatch." } },
      { status: 401 }
    )
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated":
        await upsertThrottleCustomer(event.data)
        break
      // Throttle has no documented "delete customer" endpoint that's
      // safe to call from a webhook — leave the record in place and
      // let the merchant handle data-retention manually if needed.
      default:
        break
    }
  } catch (err) {
    console.error(
      `[clerk webhook] handling ${event.type} failed:`,
      err
    )
    // Don't surface the failure to Clerk: returning 500 triggers
    // automatic retries that won't fix the underlying issue (auth
    // misconfig, missing store id, etc.). Log + ack.
  }

  return NextResponse.json({ received: true })
}

async function upsertThrottleCustomer(user: {
  id: string
  first_name?: string | null
  last_name?: string | null
  email_addresses?: Array<{ id?: string; email_address?: string }>
  primary_email_address_id?: string | null
}): Promise<void> {
  if (!env.THROTTLE_API_KEY || !env.THROTTLE_STORE_ID) return

  const primaryEmail = user.email_addresses?.find(
    (e) => e.id === user.primary_email_address_id
  )?.email_address
  const email =
    primaryEmail ?? user.email_addresses?.[0]?.email_address
  if (!email) return

  // Check if a customer already exists for this Clerk user (the lazy
  // upsert may have run on a prior server call).
  const existing = await getCustomerByExternalId(user.id)
  if (existing) {
    // For v1 we don't sync name updates back — Throttle's PATCH
    // endpoint exists but isn't wired here yet. Just persist the link.
    await persistMetadata(user.id, existing.id)
    return
  }

  const created = await createCustomer({
    email,
    firstName: user.first_name ?? undefined,
    lastName: user.last_name ?? undefined,
    externalId: user.id,
  })
  await persistMetadata(user.id, created.id)
}

async function persistMetadata(
  clerkUserId: string,
  throttleCustomerId: string
): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUserMetadata(clerkUserId, {
    privateMetadata: { throttleCustomerId },
  })
}
