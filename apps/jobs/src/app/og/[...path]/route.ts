import { ogImage } from "@repo/ui/lib/og"
import { allJobs, job as findJob } from "@/lib/jobs"
import { jobSlugOf, OG_FILE, withOgCache } from "@/lib/og"

type Context = { params: Promise<{ path: string[] }> }

// Every posting's OG image, prerendered at build: `/og/<slug>/image.png`. Closed postings get one
// too (the page itself still builds), the index, sitemap and JSON-LD are the only things that
// leave them out.
export const dynamic = "force-static"
export const dynamicParams = false

export function generateStaticParams(): { path: string[] }[] {
  return allJobs().map((candidate) => ({ path: [candidate.slug, OG_FILE] }))
}

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const slug = jobSlugOf((await params).path)
  const job = slug && findJob(slug)
  if (!job) return new Response("Not found", { status: 404 })
  return withOgCache(ogImage({ title: job.title, subtitle: job.team }))
}
