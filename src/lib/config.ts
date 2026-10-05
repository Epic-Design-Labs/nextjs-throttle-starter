// ============================================================================
// Store Configuration — Single source of truth for all store-wide settings.
// Edit this file to customize the store name, contact info, social links, etc.
// ============================================================================

export const siteConfig = {
  // Branding
  name: "Next.js Ecommerce Starter",
  tagline: "A free, open-source Next.js ecommerce template.",
  description:
    "A free, production-ready Next.js ecommerce starter template built with Tailwind CSS and shadcn/ui. Responsive, accessible, SEO optimized, and ready to connect to any checkout system. Built by Epic Design Labs.",

  // Announcement bar. Your own copy, or null to derive the free-shipping
  // message from freeShippingThreshold (and show nothing when the offer is
  // off). Set "" to hide it outright.
  //
  // It ships as null rather than as hardcoded text on purpose: the previous
  // default said "orders over $75" regardless of the threshold, so turning the
  // offer off left the banner promising it anyway. Copy that repeats a
  // configured number diverges from it the first time someone changes one.
  announcement: null as string | null,

  // URLs
  url: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",

  // Contact
  contact: {
    email: "support@epicdesignlabs.com",
    phone: "",
    address: {
      street: "",
      suite: "",
      city: "",
      state: "",
      zip: "",
    },
  },

  // Social links (set to "" to hide)
  social: {
    twitter: "https://x.com/epicdesignlabs",
    instagram: "https://instagram.com/epicdesignlabs",
    facebook: "https://facebook.com/epicdesignlabs",
    youtube: "",
    tiktok: "",
  },

  // Shipping
  //
  // 0 means the free-shipping offer is OFF, not "every order qualifies". Check
  // it with freeShippingOffered() from src/lib/shipping-offer.ts, never with a
  // bare `subtotal >= freeShippingThreshold` - that comparison is true for
  // every order at 0 and turns a disabled feature into a promise the checkout
  // will not keep.
  //
  // The general rule, which applies to any setting here: a default of 0 or null
  // that means *disabled* must be checked for disabled-ness, never compared
  // numerically.
  freeShippingThreshold: 7500, // in cents ($75.00); 0 disables the offer
  // Display-only, and deliberately unused by the cart summary: tax shown to a
  // buyer comes from the live Throttle quote at checkout, never from a local
  // guess. Kept for marketing copy or a project that wants an explicit
  // "estimated tax" surface of its own.
  taxRate: 0.08, // 8%

  // Currency & locale
  currency: "USD",
  locale: "en-US",

  // Legal
  copyrightYear: new Date().getFullYear(),
} as const

export type SiteConfig = typeof siteConfig
