import type { Metadata } from "next"
import { connection } from "next/server"
import { getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { EmailConfirmView } from "@/views/email-confirm-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("emailConfirm") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function Page({ searchParams }: { searchParams: Search }) {
  await connection()
  // A session is required, like every other account page: a signed-out visitor is sent to sign
  // in and back here (requireUser's default target is the request's own URL, token included).
  await getAuth().requireUser()
  const params = await searchParams
  return <EmailConfirmView token={first(params.token) ?? ""} />
}
