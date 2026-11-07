import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ApplyForm } from "@/components/apply-form"
import { job as findJob, openJobs } from "@/lib/jobs"
import type { Job } from "@/lib/jobs-core"
import { ApplyView } from "@/views/apply-view"

type Props = { params: Promise<{ slug: string }> }

/** Open roles only: a closed posting's apply route does not exist (see `jobsKnownPaths`). */
export const dynamicParams = false

export function generateStaticParams(): { slug: string }[] {
  return openJobs().map((candidate) => ({ slug: candidate.slug }))
}

/** The open posting at `slug`; a closed or unknown slug is not found. */
function load(slug: string): Job {
  const job = findJob(slug)
  if (!job?.open) notFound()
  return job
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = load((await params).slug)
  return {
    title: `Apply for ${job.title}`,
    description: `Apply for ${job.title} at ${job.team}.`,
    alternates: { canonical: `${siteUrl("jobs")}${job.path}/apply` },
  }
}

export default async function Page({ params }: Props) {
  const job = load((await params).slug)
  return <ApplyView job={job} form={<ApplyForm slug={job.slug} />} />
}
