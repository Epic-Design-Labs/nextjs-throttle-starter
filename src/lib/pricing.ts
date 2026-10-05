import { formatPrice } from "@/lib/utils"
import type { ProductVariant } from "@/types"

/**
 * "Exists, but has no price yet" is a real catalog state, and it is not zero.
 *
 * A PIM can legitimately return a part with `price: null` - made to order,
 * awaiting costing, quote-only. Mapping that to `0` makes the storefront
 * advertise a free product, which is the kind of bug that ships: it looks like
 * data rather than an error. On one client catalog it hit 1 item in 4.
 *
 * Adapters set `unpriced: true` when the source says "no price". A `price` that
 * arrives null or undefined despite the type is treated the same way, because
 * the alternative is rendering "$0.00".
 */

/** What every money surface shows instead of a figure. */
export const PRICE_ON_REQUEST = "Price on request"

type PriceLike = Pick<ProductVariant, "price"> &
  Partial<Pick<ProductVariant, "unpriced" | "currency" | "compareAtPrice">>

export function isUnpriced(variant: PriceLike | null | undefined): boolean {
  if (!variant) return true
  if (variant.unpriced === true) return true
  // Defensive: the type says `number`, but an adapter that forgets the flag
  // will hand us null/undefined, and "$NaN" or "$0.00" are both worse than
  // "Price on request".
  return variant.price === null || variant.price === undefined
}

/**
 * Price for display: a formatted figure, or {@link PRICE_ON_REQUEST}.
 * Use this instead of calling formatPrice on a variant directly.
 */
export function formatVariantPrice(
  variant: PriceLike | null | undefined
): string {
  if (isUnpriced(variant)) return PRICE_ON_REQUEST
  return formatPrice(variant!.price, variant!.currency)
}

/**
 * Whether a sale ("was X, now Y") claim can be made. An unpriced variant has
 * nothing to discount, so a stray compareAtPrice must not render a strikethrough.
 */
export function hasSalePrice(variant: PriceLike | null | undefined): boolean {
  if (isUnpriced(variant)) return false
  const compareAt = variant!.compareAtPrice
  return typeof compareAt === "number" && compareAt > variant!.price
}
