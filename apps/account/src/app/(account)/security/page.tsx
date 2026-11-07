import type { Metadata } from "next"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { connectErrorMessage } from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { requirementWarnings } from "@/lib/two-factor-requirement"
import { SecurityView } from "@/views/security-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("security") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function Page({ searchParams }: { searchParams: Search }) {
  await connection()
  const params = await searchParams
  const locale = await getLocale()
  const auth = getAuth()
  const user = await auth.requireUser()
  const me = await auth.getMe()
  const api = await auth.api()
  const [
    { items },
    { items: identities },
    { providers },
    twoFactor,
    passkeys,
    { items: workspaces },
  ] = await Promise.all([
    api.account.sessions.list(),
    api.account.identities.list(),
    api.auth.providers(),
    api.account.twoFactor.get(),
    api.account.passkeys.list(),
    // Which of the account's workspaces require two-step verification: turning it off (or
    // removing the last passkey) warns, naming them, when that would block this account.
    auth.listWorkspaces(),
  ])
  const warnings = requirementWarnings({
    twoFactorEnabled: twoFactor.enabled,
    passkeyCount: passkeys.length,
    workspaces,
  })
  return (
    <SecurityView
      items={items}
      email={user.email}
      user={user}
      identities={identities}
      providers={providers}
      twoFactor={twoFactor}
      passkeys={passkeys}
      isImpersonating={me?.impersonation != null}
      connectError={connectErrorMessage(first(params.error), first(params.provider), locale)}
      locale={locale}
      warnings={warnings}
    />
  )
}
