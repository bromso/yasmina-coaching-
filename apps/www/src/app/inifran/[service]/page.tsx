import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { INNER, INNER_SERVICE_IDS, innerFor } from "@/content/inner"
import type { InnerServiceId } from "@/content/inner-pricing"
import { getLocale } from "@/lib/locale"
import { InnerServiceView } from "@/views/inner-service-view"

type PageProps = { params: Promise<{ service: string }> }

/** The service a slug names (the slugs are Swedish in both languages), or null. */
const serviceOf = (slug: string): InnerServiceId | null =>
  INNER_SERVICE_IDS.find((id) => INNER.sv.services[id].slug === slug) ?? null

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = serviceOf((await params).service)
  if (!id) return {}
  const service = innerFor(await getLocale()).services[id]
  return { title: service.title, description: service.lead }
}

/** `/inifran/<slug>`: one of the four services; any other slug is a 404. */
export default async function Page({ params }: PageProps) {
  const [{ service: slug }, locale] = await Promise.all([params, getLocale()])
  const id = serviceOf(slug)
  if (!id) notFound()
  return <InnerServiceView id={id} locale={locale} />
}
