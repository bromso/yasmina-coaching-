import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { Search } from "@/components/search"
import { help, popularArticles } from "@/lib/help"
import { HomeView } from "@/views/home-view"

export const metadata: Metadata = {
  description: "Search for an answer, or browse a category of help articles.",
  alternates: { canonical: siteUrl("help") },
}

export default function Page() {
  return <HomeView categories={help.categories} popular={popularArticles()} search={<Search />} />
}
