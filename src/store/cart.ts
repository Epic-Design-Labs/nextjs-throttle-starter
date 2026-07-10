"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CartItem, ProductImage } from "@/types"

export interface AppliedDiscountState {
  code: string
  amount: number
  currency: string
  type: "percentage" | "fixed_amount"
  freeShipping: boolean
}

interface CartState {
  /** Local-only id used to seed Throttle's externalId on cart creation. */
  externalId: string
  /** Throttle cart UUID. Created on the first add-to-cart. */
  throttleCartId: string | null
  items: CartItem[]
  /** Local variantId → Throttle line-item id. Populated when adds settle. */
  throttleItemIds: Record<string, string>
  appliedDiscount: AppliedDiscountState | null
  isOpen: boolean
  /** Surface-level sync state, useful for "saving…" UI. */
  syncing: boolean
  syncError: string | null

  addItem: (item: {
    variantId: string
    productId: string
    name: string
    variantName: string
    image: ProductImage
    slug: string
    price: number
    quantity?: number
  }) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
  /**
   * Rebuild the server-side Throttle cart from the current local items.
   * Used to recover when the persisted cart is no longer modifiable
   * (e.g. it was converted to an order by a prior checkout). Returns the
   * new Throttle cart id.
   */
  recreateCart: () => Promise<string>
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void

  applyDiscountCode: (code: string) => Promise<void>
  removeDiscountCode: () => Promise<void>

  getSubtotal: () => number
  getItemCount: () => number
  getDiscountTotal: () => number
}

// Per-tab sync queue — guarantees a quantity PATCH can't race ahead of the
// original POST that yields the throttleItemId. Lives outside Zustand so it
// isn't persisted/serialized.
let syncQueue: Promise<unknown> = Promise.resolve()
function enqueueSync<T>(task: () => Promise<T>): Promise<T> {
  const next = syncQueue.then(task, task)
  // Keep the queue alive even if a task throws.
  syncQueue = next.catch(() => undefined)
  return next
}

/**
 * A persisted throttleCartId can become unusable in two ways:
 *   • 409 `cart_not_open` — the cart was converted to an order (e.g. a prior
 *     checkout that converted it but never ran clearCart()).
 *   • 404 — the cart no longer exists for the active store (e.g. after the
 *     Throttle API key was switched to a different environment, orphaning a
 *     cart that lived in the old one).
 * Both are recovered the same way: rebuild a fresh cart from local items.
 */
function isCartUnusableError(
  status: number,
  payload: { error?: { code?: string } } | null
): boolean {
  return (
    status === 404 ||
    status === 409 ||
    payload?.error?.code === "cart_not_open"
  )
}

async function ensureCartId(get: () => CartState, set: SetState): Promise<string> {
  const existing = get().throttleCartId
  if (existing) return existing
  set({ syncing: true, syncError: null })
  const res = await fetch("/api/throttle/cart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ externalId: get().externalId }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    throw new Error(
      payload?.error?.message ?? "Failed to create Throttle cart."
    )
  }
  const { cart } = (await res.json()) as { cart: { id: string } }
  set({ throttleCartId: cart.id })
  return cart.id
}

type SetState = (
  partial:
    | Partial<CartState>
    | ((state: CartState) => Partial<CartState>)
) => void

async function syncAdd(
  variantId: string,
  quantity: number,
  get: () => CartState,
  set: SetState
): Promise<void> {
  const cartId = await ensureCartId(get, set)
  // Body is intentionally minimal — variantId + quantity only. The
  // server route looks up the canonical price/name/image from the
  // product catalog so the client can't tamper with pricing.
  const res = await fetch(`/api/throttle/cart/${cartId}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variantId, quantity }),
  })
  if (!res.ok) {
    const errPayload = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    // Adding to a converted/closed cart: rebuild a fresh cart from the
    // local items (which already include this one) and stop — the rebuild
    // re-adds everything itself (it doesn't call syncAdd, so no recursion).
    if (isCartUnusableError(res.status, errPayload)) {
      await get().recreateCart()
      return
    }
    throw new Error(errPayload?.error?.message ?? "Failed to add item.")
  }
  const { item } = (await res.json()) as { item: { id: string } }
  set((state) => ({
    throttleItemIds: { ...state.throttleItemIds, [variantId]: item.id },
  }))
}

async function syncUpdate(
  variantId: string,
  quantity: number,
  get: () => CartState
): Promise<void> {
  const cartId = get().throttleCartId
  const itemId = get().throttleItemIds[variantId]
  if (!cartId || !itemId) return
  const res = await fetch(`/api/throttle/cart/${cartId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    throw new Error(payload?.error?.message ?? "Failed to update quantity.")
  }
}

async function syncRemove(
  variantId: string,
  get: () => CartState,
  set: SetState
): Promise<void> {
  const cartId = get().throttleCartId
  const itemId = get().throttleItemIds[variantId]
  if (!cartId || !itemId) return
  const res = await fetch(`/api/throttle/cart/${cartId}/items/${itemId}`, {
    method: "DELETE",
  })
  if (!res.ok && res.status !== 404) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null
    throw new Error(payload?.error?.message ?? "Failed to remove item.")
  }
  set((state) => {
    const next = { ...state.throttleItemIds }
    delete next[variantId]
    return { throttleItemIds: next }
  })
}

function makeExternalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `cart_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

function runSync(
  label: string,
  set: SetState,
  task: () => Promise<unknown>
) {
  set({ syncing: true, syncError: null })
  enqueueSync(task)
    .catch((err: Error) => {
      console.error(`[cart sync] ${label} failed:`, err)
      set({ syncError: err.message })
    })
    .finally(() => {
      // Settle the spinner once the *latest* mutation completes; pending
      // queued tasks keep `syncing` true via their own runSync calls.
      if (syncQueue === Promise.resolve()) set({ syncing: false })
      else syncQueue.finally(() => set({ syncing: false }))
    })
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      externalId: makeExternalId(),
      throttleCartId: null,
      items: [],
      throttleItemIds: {},
      appliedDiscount: null,
      isOpen: false,
      syncing: false,
      syncError: null,

      addItem: (item) => {
        const quantity = item.quantity ?? 1
        const existing = get().items.find((i) => i.variantId === item.variantId)

        if (existing) {
          const nextQty = existing.quantity + quantity
          set((state) => ({
            items: state.items.map((i) =>
              i.variantId === item.variantId
                ? { ...i, quantity: nextQty, lineTotal: i.price * nextQty }
                : i
            ),
          }))
          runSync("update", set, () => syncUpdate(item.variantId, nextQty, get))
          return
        }

        const newItem: CartItem = {
          id: item.variantId,
          variantId: item.variantId,
          productId: item.productId,
          name: item.name,
          variantName: item.variantName,
          image: item.image,
          slug: item.slug,
          price: item.price,
          quantity,
          lineTotal: item.price * quantity,
        }
        set((state) => ({ items: [...state.items, newItem] }))

        runSync("add", set, () => syncAdd(item.variantId, quantity, get, set))
      },

      removeItem: (variantId) => {
        set((state) => ({
          items: state.items.filter((i) => i.variantId !== variantId),
        }))
        runSync("remove", set, () => syncRemove(variantId, get, set))
      },

      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(variantId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId
              ? { ...i, quantity, lineTotal: i.price * quantity }
              : i
          ),
        }))
        runSync("update", set, () => syncUpdate(variantId, quantity, get))
      },

      clearCart: () => {
        // Abandon the Throttle cart server-side and start fresh on the next
        // add. Cheaper than a fan-out of DELETEs, and Throttle's cart
        // lifecycle handles expiry/abandonment cleanly.
        set({
          items: [],
          throttleCartId: null,
          throttleItemIds: {},
          appliedDiscount: null,
          externalId: makeExternalId(),
          syncError: null,
        })
      },

      recreateCart: async () => {
        // Build the replacement cart FULLY (create + re-add every item)
        // before swapping it into the store. Exposing the new throttleCartId
        // while the cart is still empty would let the checkout effect fire a
        // shipping calc against an empty cart and get back no methods. Mint a
        // fresh externalId too — reusing the old one risks Throttle handing
        // back the same converted cart.
        const items = get().items
        const externalId = makeExternalId()
        const createRes = await fetch("/api/throttle/cart", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ externalId }),
        })
        if (!createRes.ok) throw new Error("Failed to recreate cart.")
        const { cart } = (await createRes.json()) as { cart: { id: string } }
        const throttleItemIds: Record<string, string> = {}
        for (const item of items) {
          const r = await fetch(`/api/throttle/cart/${cart.id}/items`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              variantId: item.variantId,
              quantity: item.quantity,
            }),
          })
          if (r.ok) {
            const { item: li } = (await r.json()) as { item: { id: string } }
            throttleItemIds[item.variantId] = li.id
          }
        }
        // One atomic swap: the checkout effect re-runs exactly once, now
        // against a fully populated cart.
        set({
          throttleCartId: cart.id,
          throttleItemIds,
          externalId,
          appliedDiscount: null,
          syncError: null,
        })
        return cart.id
      },

      applyDiscountCode: async (code) => {
        const cartId = await ensureCartId(get, set)
        const res = await fetch(`/api/throttle/cart/${cartId}/discount`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(
            payload?.error?.message ?? "Could not apply discount."
          )
        }
        const { discount } = (await res.json()) as {
          discount: AppliedDiscountState | null
        }
        set({ appliedDiscount: discount })
      },

      removeDiscountCode: async () => {
        const cartId = get().throttleCartId
        if (!cartId) {
          set({ appliedDiscount: null })
          return
        }
        const res = await fetch(`/api/throttle/cart/${cartId}/discount`, {
          method: "DELETE",
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(
            payload?.error?.message ?? "Could not remove discount."
          )
        }
        set({ appliedDiscount: null })
      },

      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      getSubtotal: () =>
        get().items.reduce((sum, item) => sum + item.lineTotal, 0),
      getItemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
      getDiscountTotal: () => {
        const d = get().appliedDiscount
        if (!d) return 0
        if (d.type === "fixed_amount") return d.amount
        // percentage — `amount` is the percent in basis-points-style
        // (e.g. 1000 = 10%). Apply against subtotal.
        const subtotal = get().items.reduce((s, i) => s + i.lineTotal, 0)
        return Math.round((subtotal * d.amount) / 10000)
      },
    }),
    {
      name: "cart-storage",
      partialize: (state) => ({
        externalId: state.externalId,
        throttleCartId: state.throttleCartId,
        items: state.items,
        throttleItemIds: state.throttleItemIds,
        appliedDiscount: state.appliedDiscount,
      }),
    }
  )
)
