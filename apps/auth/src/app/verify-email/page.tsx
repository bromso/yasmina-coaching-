import { requestInfo } from "@repo/session"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { verifyEmailCore, verifyEmailState } from "@/lib/verify-email"
import { VerifyEmailView } from "@/views/verify-email-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("verifyEmail") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// The link is the action: one api call per request, no form. A refresh of a used link shows the
// failure state, which is the truth — unless the signed-in user is verified (a mail scanner may
// have consumed the token first), which verifyEmailState maps to "already-verified".
export default async function VerifyEmailPage({ searchParams }: { searchParams: Search }) {
  const token = first((await searchParams).token) ?? ""
  const auth = getAuth()
  const { ip } = requestInfo(await headers())
  const api = await auth.anonymousApi({ ip })
  const core = await verifyEmailCore({ verifyEmail: api.auth.verifyEmail }, token)
  const user = await auth.getUser()
  return (
    <VerifyEmailView
      result={verifyEmailState(core, user)}
      signedIn={user !== null}
      appUrl={auth.safeNextUrl(undefined)}
    />
  )
}
