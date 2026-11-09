import type { BookingAudience } from "@repo/api-contract/booking-limits"
import type { Metadata } from "next"
import { bookingFor } from "@/content/booking"
import { getLocale } from "@/lib/locale"
import { BookView } from "@/views/book-view"

export async function generateMetadata(): Promise<Metadata> {
  const booking = bookingFor(await getLocale())
  return { title: booking.meta.catalog, description: booking.catalog.description }
}

type PageProps = { searchParams: Promise<{ for?: string | string[] }> }

/** `?for=private|organisation` filters the catalog; anything else reads as private. */
export default async function Page({ searchParams }: PageProps) {
  const [{ for: raw }, locale] = await Promise.all([searchParams, getLocale()])
  const audience: BookingAudience = raw === "organisation" ? "organisation" : "private"
  return <BookView audience={audience} locale={locale} />
}
