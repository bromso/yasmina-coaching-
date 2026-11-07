import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { category as findCategory, help } from "@/lib/help"
import type { HelpCategory } from "@/lib/help-core"
import { CategoryView } from "@/views/category-view"

type Props = { params: Promise<{ category: string }> }

export const dynamicParams = false

/** Every category. */
export function generateStaticParams(): { category: string }[] {
  return help.categories.map((candidate) => ({ category: candidate.slug }))
}

/** The category at `slug`; anything else is not found. */
function load(slug: string): HelpCategory {
  const found = findCategory(slug)
  if (!found) notFound()
  return found
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = load((await params).category)
  return {
    title: found.title,
    description: found.description,
    alternates: { canonical: `${siteUrl("help")}/${found.slug}` },
  }
}

export default async function Page({ params }: Props) {
  const found = load((await params).category)
  return <CategoryView category={found} />
}
