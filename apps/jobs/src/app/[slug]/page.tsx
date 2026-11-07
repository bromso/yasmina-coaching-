import { BRAND_NAME, siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { allJobs, job as findJob, type Page as JobPage, jobPage } from "@/lib/jobs"
import type { Job } from "@/lib/jobs-core"
import { ogImageMetadata } from "@/lib/og"
import { jobPageUrl } from "@/lib/sitemap"
import { JobView } from "@/views/job-view"

type Props = { params: Promise<{ slug: string }> }

// Every posting, open or closed: a closed one still builds, showing the closed notice in place of
// the apply link.
export const dynamicParams = false

export function generateStaticParams(): { slug: string }[] {
  return allJobs().map((candidate) => ({ slug: candidate.slug }))
}

/** The posting at `slug` and its compiled page; anything else is not found. */
function load(slug: string): { job: Job; page: JobPage } {
  const job = findJob(slug)
  const page = job && jobPage(slug)
  if (!job || !page) notFound()
  return { job, page }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { job } = load((await params).slug)
  const url = jobPageUrl(job.path)
  const image = ogImageMetadata(job.slug, job.title, BRAND_NAME)
  return {
    title: job.title,
    description: job.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: job.title,
      description: job.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: job.title,
      description: job.description,
      images: [image],
    },
  }
}

export default async function Page({ params }: Props) {
  const { job, page } = load((await params).slug)
  return <JobView job={job} Body={page.data.body} siteUrl={siteUrl("jobs")} brand={BRAND_NAME} />
}
