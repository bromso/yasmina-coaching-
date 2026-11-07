import type { Metadata } from "next"
import { innerFor } from "@/content/inner"
import { getLocale } from "@/lib/locale"
import { InnerResearchView } from "@/views/inner-research-view"

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = innerFor(await getLocale()).labels.research
  return { title: meta.title, description: meta.description }
}

export default async function Page() {
  return <InnerResearchView locale={await getLocale()} />
}
