import { requestInfo } from "@repo/session"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth, getProviders } from "@/lib/auth"
import { authTranslator, oauthErrorMessageIn } from "@/lib/i18n"
import { loginNotice } from "@/lib/login-notice"
import { providerLabel } from "@/lib/providers"
import { LoginView } from "@/views/login-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("login") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const next = first(params.next)
  const reauth = first(params.reauth) === "1"
  const auth = getAuth()
  const user = await auth.getUser()
  // Already signed in and arriving with a destination: go there. Without one, offer the choice.
  // Re-authentication (e.g. before two-step setup) shows the form even to a signed-in visitor.
  if (user && next && !reauth) redirect(auth.safeNextUrl(next))
  const t = await getTranslations("auth")
  const locale = await getLocale()
  const notice = loginNotice(params, authTranslator(locale))
  // Two cases the shared oauth-error map does not know: a timed-out two-step challenge, and a
  // suspended account (the api's own message cannot survive this redirect — see `oauth.ts`).
  const errorCode = first(params.error)
  const errorMessage =
    errorCode === "two_factor_expired"
      ? t("twoFactor.timedOut")
      : errorCode === "suspended"
        ? t("common.accountSuspended")
        : oauthErrorMessageIn(
            authTranslator(locale),
            errorCode,
            providerLabel(first(params.provider))
          )
  const providers = user && !reauth ? [] : await getProviders(requestInfo(await headers()).ip)
  return (
    <LoginView
      locale={locale}
      next={next}
      notice={notice}
      errorMessage={errorMessage}
      providers={providers}
      user={reauth ? null : user}
      continueHref={auth.safeNextUrl(undefined)}
      reauth={reauth}
    />
  )
}
