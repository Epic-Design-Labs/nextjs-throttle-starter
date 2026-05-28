import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/lib/env"
import {
  THROTTLE_SIGNATURE_HEADER,
  verifyThrottleSignature,
} from "@/lib/throttle"
import type { ThrottleWebhookEvent } from "@/lib/throttle"

// Throttle posts JSON with an HMAC-SHA256 signature in
// `X-Throttle-Signature`. The hash is computed over the *raw* request
// body, so we must avoid req.json() / framework body parsing here.
export async function POST(req: NextRequest) {
  if (!env.THROTTLE_WEBHOOK_SECRET) {
    return NextResponse.json(
      {
        error: {
          code: "webhook_secret_missing",
          message:
            "THROTTLE_WEBHOOK_SECRET is not set. Add it to .env.local before exposing this endpoint.",
        },
      },
      { status: 500 }
    )
  }

  const rawBody = await req.text()
  const signature = req.headers.get(THROTTLE_SIGNATURE_HEADER)

  const valid = verifyThrottleSignature({
    rawBody,
    header: signature,
    secret: env.THROTTLE_WEBHOOK_SECRET,
  })
  if (!valid) {
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Signature mismatch." } },
      { status: 401 }
    )
  }

  let event: ThrottleWebhookEvent
  try {
    event = JSON.parse(rawBody) as ThrottleWebhookEvent
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Body was not JSON." } },
      { status: 400 }
    )
  }

  // Fan out to per-event handlers. Keep this synchronous so Throttle's
  // retry policy doesn't fire while heavy work is still in-flight; if
  // you need expensive processing, enqueue it and return 200 quickly.
  await handleThrottleEvent(event)

  return NextResponse.json({ received: true })
}

async function handleThrottleEvent(event: ThrottleWebhookEvent): Promise<void> {
  // Add real-world side effects here: email the buyer, update your
  // database, page on-call, etc. Until then, log structurally so the
  // first sign of life is a visible record in the server logs.
  console.log("[throttle] event", {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
  })

  switch (event.type) {
    case "order.created":
    case "order.completed":
    case "payment.captured":
    case "payment.failed":
    case "payment.refunded":
      // TODO: integrate with your order/fulfillment pipeline.
      break
    default:
      break
  }
}
