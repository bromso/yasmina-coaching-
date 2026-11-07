import type { Metadata } from "next"
import { innerFor } from "@/content/inner"
import { getLocale } from "@/lib/locale"
import { InnerHubView } from "@/views/inner-hub-view"

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = innerFor(await getLocale()).hub
  return { title: meta.title, description: meta.description }
}

export default async function Page() {
  return <InnerHubView locale={await getLocale()} />
}
