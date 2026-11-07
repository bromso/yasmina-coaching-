import type { ProviderId } from "@repo/api-contract"
import { siteUrl } from "@repo/sites"
import { AuthLayout } from "@/components/auth-layout"
import { SignupForm } from "@/components/signup-form"
import { SocialButtons } from "@/components/social-buttons"

export function SignupView({ next, providers }: { next?: string; providers: ProviderId[] }) {
  return (
    <AuthLayout>
      <SignupForm
        legalBaseUrl={siteUrl("www")}
        next={next}
        social={
          providers.length > 0 ? (
            <SocialButtons providers={providers} intent="signup" next={next} />
          ) : null
        }
      />
    </AuthLayout>
  )
}
