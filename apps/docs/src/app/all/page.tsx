import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { Search } from "@/components/search"
import { docs, source } from "@/lib/docs"
import { sectionsOf, toNavNodes } from "@/lib/nav"
import { AllPagesView } from "@/views/all-pages-view"

const description = "Every page of the docs, in sidebar order."

export const metadata: Metadata = {
  title: "All pages",
  description,
  alternates: { canonical: `${siteUrl("docs")}/all` },
}

export default function Page() {
  const nav = toNavNodes(source.pageTree)
  const descriptions = new Map(docs.pages.map((page) => [page.url, page.frontmatter.description]))
  const sections = sectionsOf(nav).map((section) => ({
    ...section,
    pages: section.pages.map((page) => ({
      ...page,
      description: descriptions.get(page.href) ?? "",
    })),
  }))
  return <AllPagesView nav={nav} sections={sections} search={<Search />} />
}
