import { SignIn } from "@clerk/nextjs"
import { isClerkConfigured } from "@/lib/auth"
import { AuthCardLayout } from "@/components/auth/auth-card-layout"
import { LegacyLoginForm } from "./legacy-form"

// `[[...rest]]` catches every subpath Clerk routes through during the
// sign-in multi-step flow (factor-one, factor-two, SSO callback, etc).
// Without Clerk env keys we render a demo form driven by useAuthStore
// so the page is still useful for offline / starter-preview work.
export default function LoginPage() {
  if (!isClerkConfigured) {
    return (
      <AuthCardLayout
        title="Welcome back"
        subtitle="Sign in to your account to continue"
        footerText="Don't have an account?"
        footerLinkText="Sign up"
        footerLinkHref="/auth/register"
      >
        <LegacyLoginForm />
      </AuthCardLayout>
    )
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
      <SignIn
        path="/auth/login"
        routing="path"
        signUpUrl="/auth/register"
        forceRedirectUrl="/account"
      />
    </div>
  )
}
