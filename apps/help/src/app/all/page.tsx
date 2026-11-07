import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { help } from "@/lib/help"
import { AllView } from "@/views/all-view"

const description = "Every help article, by category."

export const metadata: Metadata = {
  title: "All articles",
  description,
  alternates: { canonical: `${siteUrl("help")}/all` },
}

export default function Page() {
  return <AllView categories={help.categories} />
}
