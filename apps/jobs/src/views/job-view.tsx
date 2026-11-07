import { jobPostingJsonLd } from "@repo/content/seo"
import { Button } from "@repo/ui/components/button"
import { mdxComponents } from "@repo/ui/components/mdx"
import { formatPostDate } from "@repo/ui/lib/post-date"
import type { ComponentType } from "react"
import { EMPLOYMENT_LABEL, type Job } from "@/lib/jobs-core"

export type JobViewProps = {
  job: Job
  /** The compiled MDX body. */
  Body: ComponentType<{ components?: typeof mdxComponents }>
  /** The jobs app's own origin, for the `JobPosting` JSON-LD (open roles only). */
  siteUrl: string
  brand: string
}

/**
 * `/<slug>`: a facts list (team, location, employment, salary when set, posted, closes when
 * set), the posting's body, then either **Apply for this role** or a "This role is closed"
 * notice — and `JobPosting` JSON-LD, for open roles only.
 */
export function JobView({ job, Body, siteUrl, brand }: JobViewProps) {
  return (
    <main id="main" className="container flex max-w-3xl flex-col gap-8 py-16">
      {job.open && (
        <script
          type="application/ld+json"
          // Safe: jobPostingJsonLd escapes every "<", so no string in the posting can close the
          // tag (same escape as blogPostingJsonLd's).
          dangerouslySetInnerHTML={{ __html: jobPostingJsonLd(job, { siteUrl, brand }) }}
        />
      )}

      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-4xl tracking-tight">{job.title}</h1>
        <p className="text-lg text-muted-foreground">{job.description}</p>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y py-6 text-sm">
        <dt className="font-medium text-muted-foreground">Team</dt>
        <dd>{job.team}</dd>
        <dt className="font-medium text-muted-foreground">Location</dt>
        <dd>{job.location}</dd>
        <dt className="font-medium text-muted-foreground">Employment</dt>
        <dd>{EMPLOYMENT_LABEL[job.employment]}</dd>
        {job.salary && (
          <>
            <dt className="font-medium text-muted-foreground">Salary</dt>
            <dd>{job.salary}</dd>
          </>
        )}
        <dt className="font-medium text-muted-foreground">Posted</dt>
        <dd>
          <time dateTime={job.posted}>{formatPostDate(new Date(job.posted))}</time>
        </dd>
        {job.closes && (
          <>
            <dt className="font-medium text-muted-foreground">Closes</dt>
            <dd>
              <time dateTime={job.closes}>{formatPostDate(new Date(job.closes))}</time>
            </dd>
          </>
        )}
      </dl>

      {/* Layout only: mdxComponents styles each element; this spaces the blocks. */}
      <div className="flex flex-col gap-5">
        <Body components={mdxComponents} />
      </div>

      {job.open ? (
        <Button asChild size="lg" className="self-start">
          <a href={`${job.path}/apply`}>Apply for this role</a>
        </Button>
      ) : (
        <p
          role="status"
          className="self-start rounded-md border bg-muted px-4 py-3 text-muted-foreground"
        >
          This role is closed.
        </p>
      )}
    </main>
  )
}
