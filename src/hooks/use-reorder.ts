"use client"

import { useState } from "react"
import { useCartStore } from "@/store/cart"
import { toast } from "sonner"

interface ReorderItem {
  variantId: string
  productId: string
  name: string
  variantName: string
  image: { url: string; alt: string }
  slug: string
  price: number
  quantity: number
}

/**
 * Shared reorder helper for the order list + order detail pages.
 * Hits /api/throttle/orders/[id]/reorder, walks the resolved items
 * into useCartStore, opens the cart drawer, and toasts a summary —
 * including how many items couldn't be recovered (archived / removed
 * from the catalog).
 */
export function useReorder() {
  const addItem = useCartStore((s) => s.addItem)
  const openCart = useCartStore((s) => s.openCart)
  // Busy id is either the orderId (whole-order reorder) or the
  // lineItemId (per-item reorder) — UI keys spinners off whichever
  // value is set.
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  async function reorder(orderId: string, lineItemId?: string): Promise<void> {
    setBusyOrderId(lineItemId ?? orderId)
    try {
      const url = lineItemId
        ? `/api/throttle/orders/${orderId}/reorder?lineItemId=${encodeURIComponent(lineItemId)}`
        : `/api/throttle/orders/${orderId}/reorder`
      const res = await fetch(url)
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(payload?.error?.message ?? "Reorder failed.")
      }
      const { items, missing } = (await res.json()) as {
        items: ReorderItem[]
        missing: number
      }
      items.forEach((it) =>
        addItem({
          variantId: it.variantId,
          productId: it.productId,
          name: it.name,
          variantName: it.variantName,
          image: it.image,
          slug: it.slug,
          price: it.price,
          quantity: it.quantity,
        })
      )
      if (items.length > 0) {
        openCart()
        toast.success(
          missing > 0
            ? `Added ${items.length} item${items.length === 1 ? "" : "s"} to your cart (${missing} no longer available)`
            : `Added ${items.length} item${items.length === 1 ? "" : "s"} to your cart`
        )
      } else {
        toast.error("None of the items from this order are still available.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed.")
    } finally {
      setBusyOrderId(null)
    }
  }

  return { reorder, busyOrderId }
}
