import type { Post } from "./posts"
import type { Author } from "./schema"

/**
 * `BlogPosting` JSON-LD for a post's `<script type="application/ld+json">`. `url` is the post's
 * absolute address; a root-relative `cover.src` is resolved against it, since structured-data
 * consumers need an absolute `image`.
 */
export function blogPostingJsonLd(post: Post, author: Author, url: string): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: post.date.toISOString(),
    dateModified: (post.updated ?? post.date).toISOString(),
    author: { "@type": "Person", name: author.name },
  }
  if (post.cover) {
    data.image = new URL(post.cover.src, url).href
  }
  // Escaped so a title containing "</script>" cannot close the <script type="application/ld+json">
  // tag it is rendered into (same escape as faqJsonLd in @repo/ui).
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

/** Schema.org's three `employmentType` enum values a job's `employment` maps to. */
const EMPLOYMENT_TYPE: Record<"full-time" | "part-time" | "contract", string> = {
  "full-time": "FULL_TIME",
  "part-time": "PART_TIME",
  contract: "CONTRACTOR",
}

/** The shape `jobPostingJsonLd` needs from a job: structural, so `apps/jobs`'s own `Job` (defined
 * app-local, not in this package) satisfies it without importing anything from here. */
export interface JobPostingInput {
  path: string
  title: string
  description: string
  employment: "full-time" | "part-time" | "contract"
  location: string
  /** UTC `YYYY-MM-DD`. */
  posted: string
  /** UTC `YYYY-MM-DD`. */
  closes?: string
}

/**
 * `JobPosting` JSON-LD for a job page's `<script type="application/ld+json">`. `siteUrl` is the
 * jobs app's own origin (`job.path` resolved against it becomes the posting's absolute `url`).
 * A location starting with "Remote" (case-insensitive) has no physical workplace, so it becomes
 * `applicantLocationRequirements` rather than `jobLocation`.
 */
export function jobPostingJsonLd(
  job: JobPostingInput,
  { siteUrl, brand }: { siteUrl: string; brand: string }
): string {
  const url = new URL(job.path, siteUrl).href
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    url,
    datePosted: job.posted,
    employmentType: EMPLOYMENT_TYPE[job.employment],
    hiringOrganization: { "@type": "Organization", name: brand },
  }
  if (job.closes) {
    data.validThrough = job.closes
  }
  if (job.location.toLowerCase().startsWith("remote")) {
    data.applicantLocationRequirements = { "@type": "Country", name: job.location }
  } else {
    data.jobLocation = {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: job.location },
    }
  }
  // Escaped so a title containing "</script>" cannot close the <script type="application/ld+json">
  // tag it is rendered into (same escape as blogPostingJsonLd's above).
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
