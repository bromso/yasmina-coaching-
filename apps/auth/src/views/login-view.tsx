import type { ProviderId } from "@repo/api-contract"
import type { User } from "@repo/session"
import { type LegalLocale, legalUrl } from "@repo/sites/legal"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { AuthLayout } from "@/components/auth-layout"
import { LoginForm } from "@/components/login-form"
import { SignedInCard } from "@/components/signed-in-card"
import { SocialButtons } from "@/components/social-buttons"

export function LoginView({
  locale,
  next,
  notice,
  errorMessage,
  providers,
  user,
  continueHref,
  reauth = false,
}: {
  /** The page's language, for the legal app's terms and privacy links. */
  locale: LegalLocale
  next?: string
  notice?: string
  /** A failed provider sign-in, from `?error=…`. */
  errorMessage?: string
  providers: ProviderId[]
  user: User | null
  continueHref: string
  /** `?reauth=1`: the provider buttons sign in afresh rather than connect to the current session. */
  reauth?: boolean
}) {
  return (
    <AuthLayout>
      {/* Shown signed in too: a failed state check while connecting has no `next` to return to. */}
      {errorMessage ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {user ? (
        <SignedInCard user={user} continueHref={continueHref} />
      ) : (
        <>
          {notice ? (
            <Alert role="status">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          <LoginForm
            legal={{
              termsHref: legalUrl("terms", locale),
              privacyHref: legalUrl("privacy", locale),
            }}
            next={next}
            social={
              providers.length > 0 ? (
                <SocialButtons providers={providers} intent="login" next={next} reauth={reauth} />
              ) : null
            }
          />
        </>
      )}
    </AuthLayout>
  )
}
