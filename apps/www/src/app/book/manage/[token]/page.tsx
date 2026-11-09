import { ORPCError } from "@orpc/client"
import { BookingManageSchema } from "@repo/api-contract"
import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { bookingFor } from "@/content/booking"
import { anonymousApi } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { ManageView } from "@/views/manage-view"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: bookingFor(await getLocale()).meta.manage,
    robots: { index: false, follow: false },
  }
}

type PageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ cancelled?: string | string[] }>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

/**
 * Server-rendered per request: the token is checked for shape, then `booking.manage.get` is
 * asked for what it covers. A token the api does not know (or a malformed one) is a plain 404 —
 * no page says whether it ever existed. Any other api failure surfaces as the error page.
 */
export default async function Page({ params, searchParams }: PageProps) {
  const [{ token: raw }, query, h, locale] = await Promise.all([
    params,
    searchParams,
    headers(),
    getLocale(),
  ])
  const token = BookingManageSchema.safeParse({ token: decodeURIComponent(raw) })
  if (!token.success) notFound()
  const { ip } = requestInfo(h)
  const client = await anonymousApi(ip, locale, h.get(REQUEST_ID_HEADER))
  let data: Awaited<ReturnType<typeof client.booking.manage.get>>
  try {
    data = await client.booking.manage.get(token.data)
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  const cancelledRaw = one(query.cancelled)
  const cancelledId = /^\d{1,12}$/.test(cancelledRaw) ? Number(cancelledRaw) : undefined
  return (
    <ManageView token={token.data.token} data={data} cancelledId={cancelledId} locale={locale} />
  )
}
