import { requestInfo } from "@repo/session"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth, getProviders } from "@/lib/auth"
import { SignupView } from "@/views/signup-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("signup") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function SignupPage({ searchParams }: { searchParams: Search }) {
  const next = first((await searchParams).next)
  const auth = getAuth()
  if (await auth.getUser()) redirect(auth.safeNextUrl(next))
  const providers = await getProviders(requestInfo(await headers()).ip)
  return <SignupView locale={await getLocale()} next={next} providers={providers} />
}
