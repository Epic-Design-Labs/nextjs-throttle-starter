import { UserProfile } from "@clerk/nextjs"
import { isClerkConfigured } from "@/lib/auth"
import { PageHeader } from "@/components/ui/page-header"
import { LegacySettingsForm } from "./legacy-form"

// `[[...rest]]` lets Clerk's <UserProfile /> internally route between
// its profile, password, sessions, etc. tabs at /account/settings/*.
// Without Clerk env we render the legacy Zustand-backed form so the
// page still does something useful for offline / starter-preview work.
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader title="Settings" />
      {isClerkConfigured ? (
        <div className="mt-8">
          <UserProfile path="/account/settings" routing="path" />
        </div>
      ) : (
        <LegacySettingsForm />
      )}
    </div>
  )
}
