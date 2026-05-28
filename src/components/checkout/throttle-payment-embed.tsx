"use client"

import { useEffect, useState } from "react"
import { PaymentEmbed } from "@usethrottle/checkout-react"

export interface ThrottlePaymentEmbedProps {
  sessionId: string
  /** Throttle hosted checkout origin. */
  baseUrl: string
  /** Origin sent to the iframe. Defaults to window.location.origin. */
  parentOrigin?: string
  primary?: string
  onSucceeded: (evt: { orderId: string; paymentId: string }) => void
  onFailed?: (evt: { code: string; message: string }) => void
  onCanceled?: () => void
}

/**
 * Thin wrapper around Throttle's PaymentEmbed that resolves a
 * parentOrigin client-side (so the starter works on any host without
 * baking the value into the build).
 *
 * The parent origin MUST be present in your Throttle store's
 * `allowed_origins` (Embed Config in the dashboard, or PUT
 * /api/v1/embed-config). Mismatches render a "Embed not authorized"
 * panel inside the iframe.
 */
export function ThrottlePaymentEmbed(props: ThrottlePaymentEmbedProps) {
  const { sessionId, baseUrl, parentOrigin, primary, onSucceeded, onFailed, onCanceled } = props
  const [resolvedOrigin, setResolvedOrigin] = useState<string | null>(
    parentOrigin ?? null
  )

  useEffect(() => {
    if (parentOrigin) {
      setResolvedOrigin(parentOrigin)
      return
    }
    if (typeof window !== "undefined") {
      setResolvedOrigin(window.location.origin)
    }
  }, [parentOrigin])

  if (!resolvedOrigin) return null

  return (
    <PaymentEmbed
      sessionId={sessionId}
      parentOrigin={resolvedOrigin}
      baseUrl={baseUrl}
      primary={primary}
      onSucceeded={onSucceeded}
      onFailed={onFailed}
      onCanceled={onCanceled}
    />
  )
}
