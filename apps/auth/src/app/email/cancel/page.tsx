import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { EmailCancelView } from "@/views/email-cancel-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("emailCancel") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// The link alone never does anything: a mail scanner that prefetches it must not cancel the
// pending change before the user clicks. This page only reads the token from the query string;
// Cancel this change is the one api call (via cancelEmailChange), so no api call happens on this
// GET. Anonymous, like /magic: whoever holds the account's old mailbox, signed in or not.
export default async function EmailCancelPage({ searchParams }: { searchParams: Search }) {
  const token = first((await searchParams).token) ?? ""
  return <EmailCancelView token={token} />
}
