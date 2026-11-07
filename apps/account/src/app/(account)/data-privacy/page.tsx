import { parseConsent } from "@repo/ui/lib/consent"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { DataPrivacyView } from "@/views/data-privacy-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("dataPrivacy") }
}

export default async function Page() {
  await connection()
  const auth = getAuth()
  await auth.requireUser()
  const [latestExport, locale, headerList] = await Promise.all([
    (await auth.api()).account.export.get(),
    getLocale(),
    headers(),
  ])
  return (
    <DataPrivacyView
      latestExport={latestExport}
      consent={parseConsent(headerList.get("cookie"))}
      locale={locale}
    />
  )
}
