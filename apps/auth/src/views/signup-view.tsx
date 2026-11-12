import type { ProviderId } from "@repo/api-contract"
import { type LegalLocale, legalUrl } from "@repo/sites/legal"
import { AuthLayout } from "@/components/auth-layout"
import { SignupForm } from "@/components/signup-form"
import { SocialButtons } from "@/components/social-buttons"

export function SignupView({
  locale,
  next,
  providers,
}: {
  /** The page's language, for the legal app's terms and privacy links. */
  locale: LegalLocale
  next?: string
  providers: ProviderId[]
}) {
  return (
    <AuthLayout>
      <SignupForm
        legal={{
          termsHref: legalUrl("terms", locale),
          privacyHref: legalUrl("privacy", locale),
        }}
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
