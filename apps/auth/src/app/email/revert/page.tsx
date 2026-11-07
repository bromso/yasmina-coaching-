import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { EmailRevertView } from "@/views/email-revert-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("emailRevert") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// The link alone never does anything: a mail scanner that prefetches it must not undo the email
// change before the user clicks. This page only reads the token from the query string; Restore
// my email is the one api call (via revertEmailChange), so no api call happens on this GET.
// Anonymous, like /magic and /email/cancel: whoever holds the account's old mailbox.
export default async function EmailRevertPage({ searchParams }: { searchParams: Search }) {
  const token = first((await searchParams).token) ?? ""
  return <EmailRevertView token={token} />
}
