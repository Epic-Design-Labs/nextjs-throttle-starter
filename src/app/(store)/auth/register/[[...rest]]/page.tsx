import { SignUp } from "@clerk/nextjs"
import { isClerkConfigured } from "@/lib/auth"
import { AuthCardLayout } from "@/components/auth/auth-card-layout"
import { LegacyRegisterForm } from "./legacy-form"

export default function RegisterPage() {
  if (!isClerkConfigured) {
    return (
      <AuthCardLayout
        title="Create an account"
        subtitle="Join us to start shopping"
        footerText="Already have an account?"
        footerLinkText="Sign in"
        footerLinkHref="/auth/login"
      >
        <LegacyRegisterForm />
      </AuthCardLayout>
    )
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
      <SignUp
        path="/auth/register"
        routing="path"
        signInUrl="/auth/login"
        forceRedirectUrl="/account"
      />
    </div>
  )
}
