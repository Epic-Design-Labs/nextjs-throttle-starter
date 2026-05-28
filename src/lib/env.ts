import { z } from "zod"

// Validate environment variables at build/startup time.
// Throttle keys are *optional* here so the starter still boots without
// them — the Throttle library throws a clear runtime error if a server
// request is attempted without a key.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),

  // Throttle — usethrottle.dev
  THROTTLE_API_KEY: z.string().startsWith("sk_").optional(),
  THROTTLE_STORE_ID: z.string().uuid().optional(),
  THROTTLE_WEBHOOK_SECRET: z.string().optional(),
  THROTTLE_API_BASE_URL: z
    .string()
    .url()
    .default("https://api.usethrottle.dev"),
  NEXT_PUBLIC_THROTTLE_CHECKOUT_URL: z
    .string()
    .url()
    .default("https://checkout.usethrottle.dev"),
  NEXT_PUBLIC_THROTTLE_PARENT_ORIGIN: z.string().url().optional(),

  // Clerk — clerk.com (default auth provider)
  CLERK_SECRET_KEY: z.string().startsWith("sk_").optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
  // Webhook signing secret from clerk.com → Webhooks → Endpoint settings.
  // svix uses this to validate user.created / user.updated payloads.
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

function validateEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error(
      "❌ Invalid environment variables:",
      result.error.flatten().fieldErrors
    )
    throw new Error("Invalid environment variables")
  }

  return result.data
}

export const env = validateEnv()
