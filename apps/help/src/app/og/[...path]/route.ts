import { ogImage } from "@repo/ui/lib/og"
import { article as findArticle, category as findCategory, help } from "@/lib/help"
import { articleSlugsOf, OG_FILE, withOgCache } from "@/lib/og"

type Context = { params: Promise<{ path: string[] }> }

// Every article's OG image, prerendered at build: `/og/<category>/<article>/image.png`.
export const dynamic = "force-static"
export const dynamicParams = false

export function generateStaticParams(): { path: string[] }[] {
  return help.articles.map((candidate) => ({ path: [candidate.category, candidate.slug, OG_FILE] }))
}

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const slugs = articleSlugsOf((await params).path)
  const article = slugs && findArticle(slugs[0], slugs[1])
  if (!article) return new Response("Not found", { status: 404 })
  const category = findCategory(article.category)
  return withOgCache(ogImage({ title: article.title, subtitle: category?.title }))
}
