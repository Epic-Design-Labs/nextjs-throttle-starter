import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/lib/env"
import {
  THROTTLE_SIGNATURE_HEADER,
  getOrder,
  verifyThrottleSignature,
} from "@/lib/throttle"
import type { ThrottleOrder, ThrottleWebhookEvent } from "@/lib/throttle"

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

  // Retry contract: returning 2xx tells Throttle the event is handled.
  // Throwing (→ 5xx) tells Throttle to retry with backoff — use that for
  // genuinely transient failures (your DB is down), NOT for permanent
  // ones (unknown event type, bad data), which would retry forever.
  // Keep handlers fast; offload expensive work to a queue and return 200.
  await handleThrottleEvent(event)

  return NextResponse.json({ received: true })
}

// Order events carry the order on `data` (so `data.id`); payment and
// fulfillment events reference it as `data.orderId`. Pull whichever is
// present.
function orderIdFromEvent(event: ThrottleWebhookEvent): string | undefined {
  const d = event.data as { id?: string; orderId?: string }
  return d.orderId ?? d.id
}

// Fetching the order is a network call — don't let a transient miss take
// down the whole handler (and trigger a retry storm). Log + continue.
async function safeGetOrder(orderId: string): Promise<ThrottleOrder | null> {
  try {
    return await getOrder(orderId)
  } catch (err) {
    console.warn("[throttle:webhook] could not load order", orderId, err)
    return null
  }
}

/**
 * Per-event handlers. Each branch is a worked example: it pulls the
 * resource you'd act on, emits a structured log at the right severity,
 * and marks where your own side effects go (the `── YOUR CODE ──`
 * seams). It deliberately does NOT email the buyer — Throttle sends the
 * transactional emails — and it stays free of any database / error
 * tracker so you can drop in whichever you use.
 */
async function handleThrottleEvent(event: ThrottleWebhookEvent): Promise<void> {
  // Base log — searchable by id/type; a natural place to attach a trace
  // id when forwarding to a log aggregator.
  console.info("[throttle:webhook]", {
    id: event.id,
    type: event.type,
    at: event.createdAt,
  })

  switch (event.type) {
    // ── Order lifecycle ───────────────────────────────────────────────
    case "order.completed": {
      const orderId = orderIdFromEvent(event)
      if (!orderId) break
      const order = await safeGetOrder(orderId)
      console.info("[throttle:webhook] order completed", {
        orderId,
        orderNumber: order?.orderNumber,
        total: order?.total,
        currency: order?.currency,
      })
      // ── YOUR CODE ──
      // • persist the order in your datastore:
      //     await db.orders.upsert({ throttleOrderId: orderId, status: "paid" })
      // • kick off fulfillment (3PL/warehouse), enqueue a job, etc.
      break
    }

    // ── Payments ─────────────────────────────────────────────────────
    case "payment.captured": {
      const orderId = orderIdFromEvent(event)
      console.info("[throttle:webhook] payment captured", { orderId })
      // ── YOUR CODE ──
      // • flip your order's payment state to "captured"
      // • release digital goods / activate entitlements
      break
    }
    case "payment.failed": {
      const orderId = orderIdFromEvent(event)
      // Shaped as an error so it surfaces in Sentry/Datadog/etc.
      console.error("[throttle:webhook] payment FAILED", {
        orderId,
        eventId: event.id,
      })
      // ── YOUR CODE ──
      // • mark the order's payment as failed
      // • show a "payment problem" prompt on the buyer's next visit
      // • alert on-call if the failure rate spikes
      break
    }
    case "payment.refunded": {
      const orderId = orderIdFromEvent(event)
      console.info("[throttle:webhook] payment refunded", { orderId })
      // ── YOUR CODE ──
      // • mark refunded, restock inventory, reverse any entitlements
      break
    }

    // ── Subscriptions ────────────────────────────────────────────────
    case "subscription.renewed": {
      console.info("[throttle:webhook] subscription renewed", {
        data: event.data,
      })
      // ── YOUR CODE ── extend the customer's access for the next period
      break
    }
    case "subscription.payment_failed": {
      console.warn("[throttle:webhook] subscription payment failed", {
        data: event.data,
      })
      // ── YOUR CODE ── dunning: notify the buyer, start a grace period
      break
    }
    case "subscription.cancelled": {
      console.info("[throttle:webhook] subscription cancelled", {
        data: event.data,
      })
      // ── YOUR CODE ── revoke access at period end
      break
    }

    default:
      // Unhandled type — safe to ignore; Throttle still receives its 200.
      break
  }
}
