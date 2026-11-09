import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { bookingFor } from "@/content/booking"
import { isOwnManageUrl } from "@/lib/booking"
import { parseFlow } from "@/lib/booking-flow"
import { getLocale } from "@/lib/locale"
import { isDonePayment, isMockOnly, mockPaymentsOn } from "@/lib/mock-payment"
import { DoneView } from "@/views/done-view"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: bookingFor(await getLocale()).meta.done,
    robots: { index: false, follow: false },
  }
}

type PageProps = {
  searchParams: Promise<{
    ref?: string | string[]
    manage?: string | string[]
    kind?: string | string[]
    paid?: string | string[]
  }>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

/**
 * Everything in the query string is untrusted: the reference is shown as text (trimmed to a
 * sane length), and the manage link is only rendered when it points at this site's own
 * `/book/manage/` — any other value is dropped, never linked. `kind` is one of the four journeys
 * (`instant` otherwise) and `paid` one of `DONE_PAYMENTS` (a wallet or Swish only while the mock
 * is on), or nothing: the payment line is picked by that key from the page's own copy, never
 * written from the query.
 */
export default async function Page({ searchParams }: PageProps) {
  const [query, locale] = await Promise.all([searchParams, getLocale()])
  const reference = one(query.ref).slice(0, 40)
  const manage = one(query.manage)
  const manageUrl = isOwnManageUrl(manage, siteUrl("www")) ? manage : undefined
  const kind = parseFlow(one(query.kind))
  const paidRaw = one(query.paid)
  // A wallet or Swish line says "test mode": never shown once the mock is off.
  const paid =
    isDonePayment(paidRaw) && (!isMockOnly(paidRaw) || mockPaymentsOn()) ? paidRaw : undefined
  return (
    <DoneView reference={reference} manageUrl={manageUrl} kind={kind} paid={paid} locale={locale} />
  )
}
