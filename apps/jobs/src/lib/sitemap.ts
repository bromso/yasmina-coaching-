import { siteUrl } from "@repo/sites"
import type { Job } from "./jobs-core"
import { PUBLIC_ROUTES } from "./routes"

type Env = Record<string, string | undefined>

/**
 * A posting's absolute URL, as its canonical link and the sitemap both give it: the home page is
 * the bare origin, with no trailing slash, the form Next prints a root canonical in.
 */
export function jobPageUrl(path: string, env?: Env): string {
  const base = siteUrl("jobs", env)
  return path === "/" ? base : `${base}${path}`
}

/**
 * The jobs board's full sitemap: the home page and every *open* posting (`lastModified` its
 * `posted` date — a posting has no `updated` field) plus `PUBLIC_ROUTES`. A closed posting is left
 * out, like the home page and its `JobPosting` JSON-LD.
 */
export function jobsSitemap(
  openJobs: Pick<Job, "path" | "posted">[],
  env?: Env
): { url: string; lastModified?: Date }[] {
  const base = siteUrl("jobs", env)
  return [
    { url: base },
    ...openJobs.map((job) => ({ url: `${base}${job.path}`, lastModified: new Date(job.posted) })),
    ...PUBLIC_ROUTES.map((route) => ({ url: `${base}${route}` })),
  ]
}
