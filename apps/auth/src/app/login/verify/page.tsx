import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { TWO_FACTOR_COOKIE } from "@/lib/two-factor"
import { VerifyView } from "@/views/verify-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("verify") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// Nothing to verify without a pending challenge: a direct visit (no sign-in just happened, or the
// cookie expired) goes back to the login page rather than showing a form that can only fail.
export default async function VerifyPage({ searchParams }: { searchParams: Search }) {
  const challenge = (await cookies()).get(TWO_FACTOR_COOKIE)?.value
  if (!challenge) redirect("/login")
  const params = await searchParams
  const next = first(params.next)
  const recovery = first(params.recovery) === "1"
  return <VerifyView next={next} recovery={recovery} />
}
