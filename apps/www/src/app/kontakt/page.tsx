import type { Metadata } from "next"
import { contactFor } from "@/content/contact"
import { sourcePage } from "@/lib/leads"
import { getLocale } from "@/lib/locale"
import { ContactView } from "@/views/contact-view"

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = contactFor(await getLocale())
  return { title: meta.title, description: meta.description }
}

type PageProps = { searchParams: Promise<{ from?: string | string[] }> }

/** `?from=` names the www page a contact link sat on; anything but a www path reads as `/kontakt`. */
export default async function Page({ searchParams }: PageProps) {
  const [{ from }, locale] = await Promise.all([searchParams, getLocale()])
  return <ContactView page={sourcePage(Array.isArray(from) ? from[0] : from)} locale={locale} />
}
