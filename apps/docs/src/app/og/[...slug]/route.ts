import { ogImage } from "@repo/ui/lib/og"
import { docs, source } from "@/lib/docs"
import { OG_FILE, pageSlugsOf, withOgCache } from "@/lib/og"

type Context = { params: Promise<{ slug: string[] }> }

// Every docs page's OG image, prerendered at build: `/og/<page>/image.png` (see `ogImagePath`).
export const dynamic = "force-static"
export const dynamicParams = false

export function generateStaticParams(): { slug: string[] }[] {
  return source.getPages().map((page) => ({ slug: [...page.slugs, OG_FILE] }))
}

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const slugs = pageSlugsOf((await params).slug)
  const page = slugs && source.getPage(slugs)
  const entry = page && docs.pages.find((candidate) => candidate.url === page.url)
  if (!entry) return new Response("Not found", { status: 404 })
  return withOgCache(ogImage({ title: entry.frontmatter.title, subtitle: "Docs" }))
}
