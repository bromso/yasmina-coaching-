import {
  type BookingAudience,
  MEMBER_OFFERING_KEYS,
  OFFERING_KEYS,
  OFFERINGS,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { bookingFor } from "@/content/booking"
import { shiftDay, zonedDay } from "@/lib/booking-dates"
import { getLocale } from "@/lib/locale"
import { OfferingView } from "@/views/offering-view"

type PageProps = {
  params: Promise<{ offering: string }>
  searchParams: Promise<{ for?: string | string[]; package?: string | string[] }>
}

const keyOf = (raw: string): OfferingKey | null =>
  (OFFERING_KEYS as readonly string[]).includes(raw) ? (raw as OfferingKey) : null

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const key = keyOf((await params).offering)
  if (!key) return {}
  const copy = bookingFor(await getLocale()).offerings[key]
  const metadata: Metadata = { title: copy.title, description: copy.description }
  // Members' session pages are open but unlisted: linked only from the service pages and the
  // start call's confirmation mail, never indexed.
  if (MEMBER_OFFERING_KEYS.includes(key)) metadata.robots = { index: false }
  return metadata
}

/**
 * The dynamic segment is checked against the contract's `OFFERING_KEYS` (anything else is a 404);
 * `?for=` picks the audience when the offering takes it, and `?package=<id>` (digits only) marks
 * an extra session on an existing programme.
 */
export default async function Page({ params, searchParams }: PageProps) {
  const [{ offering: raw }, query, locale] = await Promise.all([params, searchParams, getLocale()])
  const key = keyOf(raw)
  if (!key) notFound()
  const spec = OFFERINGS[key]
  const wanted = one(query.for)
  const audience: BookingAudience =
    wanted && (spec.audiences as readonly string[]).includes(wanted)
      ? (wanted as BookingAudience)
      : (spec.audiences[0] ?? "private")
  const pkg = one(query.package)
  const packageId = spec.kind === "instant" && pkg && /^\d{1,12}$/.test(pkg) ? pkg : undefined
  const minDate = shiftDay(zonedDay(new Date()), 1)
  return (
    <OfferingView
      offering={key}
      audience={audience}
      packageId={packageId}
      minDate={minDate}
      locale={locale}
    />
  )
}
