import type { Metadata } from "next"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { PersonalInfoView } from "@/views/personal-info-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("personalInfo") }
}

export default async function Page() {
  await connection()
  const auth = getAuth()
  const user = await auth.requireUser()
  const me = await auth.getMe()
  const api = await auth.api()
  const [{ pending }, twoFactor] = await Promise.all([
    api.account.email.get(),
    api.account.twoFactor.get(),
  ])
  return (
    <PersonalInfoView
      user={user}
      locale={await getLocale()}
      pending={pending}
      twoFactorEnabled={twoFactor.enabled}
      isImpersonating={me?.impersonation != null}
    />
  )
}
