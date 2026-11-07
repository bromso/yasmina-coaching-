import { BRAND_NAME } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Search } from "@/components/search"
import { docs, source } from "@/lib/docs"
import { editUrlFor } from "@/lib/edit-url"
import { breadcrumbsFor, neighboursFor, toNavNodes } from "@/lib/nav"
import { ogImageMetadata } from "@/lib/og"
import { docsPageUrl } from "@/lib/sitemap"
import { DocView } from "@/views/doc-view"

type Props = { params: Promise<{ slug?: string[] }> }

export const dynamicParams = false

/** Every page, `/` (content/docs/index.mdx, the empty slug) included. */
export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams()
}

/** The page at `slug` and its frontmatter; anything else is not found. */
function load(slug: string[] | undefined) {
  const page = source.getPage(slug)
  const entry = page && docs.pages.find((candidate) => candidate.url === page.url)
  if (!page || !entry) notFound()
  return { page, entry, url: docsPageUrl(page.url) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entry, url } = load((await params).slug)
  const { title, description, updated } = entry.frontmatter
  const image = ogImageMetadata(entry.url, title, BRAND_NAME)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      images: [image],
      ...(updated && { modifiedTime: updated.toISOString() }),
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function Page({ params }: Props) {
  const { page, entry } = load((await params).slug)
  const tree = source.pageTree
  return (
    <DocView
      title={entry.frontmatter.title}
      description={entry.frontmatter.description}
      Body={page.data.body}
      toc={page.data.toc}
      nav={toNavNodes(tree)}
      currentHref={page.url}
      search={<Search />}
      breadcrumbs={breadcrumbsFor(page.url, tree)}
      neighbours={neighboursFor(page.url, tree)}
      updated={entry.frontmatter.updated}
      editUrl={editUrlFor(process.env.CONTENT_REPO_URL, entry.path)}
    />
  )
}
