import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { unsubscribeClientId } from "@repo/session/client"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { peekUnsubscribe } from "@/lib/unsubscribe"
import { unsubscribeApi } from "@/lib/unsubscribe-api"
import { EmailUnsubscribeView } from "@/views/email-unsubscribe-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("emailUnsubscribe") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// The link alone never unsubscribes anyone: a mail scanner that prefetches it must not turn the
// emails off before the person clicks. The only api call on this GET is `peek`, which is read-only
// (it names the type so the page can say which emails these are); **Turn off these emails** is the
// one call that changes anything (via turnOffEmails). Anonymous: the token names the user.
export default async function EmailUnsubscribePage({ searchParams }: { searchParams: Search }) {
  const token = first((await searchParams).token) ?? ""
  const h = await headers()
  const { ip } = requestInfo(h)
  const link = await peekUnsubscribe(
    async () =>
      unsubscribeApi({
        clientId: await unsubscribeClientId(ip),
        requestId: h.get(REQUEST_ID_HEADER),
      }),
    token
  )
  return <EmailUnsubscribeView token={token} link={link} />
}
