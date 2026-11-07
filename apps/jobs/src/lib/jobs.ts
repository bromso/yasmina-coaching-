import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { extractImages } from "@repo/content/checks"
import { type JobFrontmatter, jobFrontmatterSchema } from "@repo/content/schema"
import { SITES, type SiteId, siteUrl } from "@repo/sites"
import { assembleJobs, type Job, type JobInput, nestingProblems, REPO_JOBS_DIR } from "./jobs-core"
import { source } from "./source"

export type { Job } from "./jobs-core"
export { EMPLOYMENT_LABEL, isOpen, jobsByTeam, teamAnchor } from "./jobs-core"
/** The validated fumadocs loader: importing it from here runs the checks below first. */
export { source }

/** A posting as fumadocs loaded it. */
export type Page = ReturnType<typeof source.getPages>[number]

/** Where the postings live, relative to the app (the working directory of `next dev` /
 * `next build`). */
const JOBS_DIR = join("content", "jobs")
const PUBLIC_DIR = "public"
const FRONTMATTER_KEYS = Object.keys(jobFrontmatterSchema.shape) as (keyof JobFrontmatter)[]

/**
 * A posting's frontmatter alone: fumadocs spreads it into `page.data` next to its own keys
 * (`body`, `toc`, `structuredData`, …), which the strict schema would refuse. fumadocs already
 * refused a bad frontmatter when it compiled the page against the same schema; parsing the picked
 * keys again restores the schema's output types (`status` defaulted, `posted` as a string).
 */
function frontmatterOf(page: Page): JobFrontmatter {
  const data = page.data as unknown as Record<string, unknown>
  return jobFrontmatterSchema.parse(
    Object.fromEntries(
      FRONTMATTER_KEYS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])
    )
  )
}

function fileOf(page: Page): string {
  return `${REPO_JOBS_DIR}/${page.path}`
}

/**
 * A page one level deep (its slug alone) as `assembleJobs` needs it. Called only for pages
 * `nestingProblems` has already accepted — a page in a subfolder has no sensible slug and is
 * reported there instead.
 */
function toInput(page: Page): JobInput {
  // fumadocs keeps no raw source, so links, images and headings are read from the file itself.
  const raw = readFileSync(join(process.cwd(), JOBS_DIR, page.path), "utf8")
  return {
    file: fileOf(page),
    slug: page.slugs[0] as string,
    frontmatter: frontmatterOf(page),
    source: raw,
    images: extractImages(raw),
  }
}

/** Today, UTC, as `YYYY-MM-DD` — the date postings are judged open or closed against. Read once
 * per process, like the rest of the build. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function load(): { jobs: Job[] } {
  const pages = source.getPages()
  const nested = nestingProblems(pages.map((page) => ({ file: fileOf(page), slugs: page.slugs })))
  const inputs = pages.filter((page) => page.slugs.length === 1).map(toInput)
  const ids = Object.keys(SITES) as SiteId[]
  return assembleJobs(
    inputs,
    nested,
    {
      hosts: new Set(ids.map((id) => new URL(siteUrl(id)).host)),
      ownHost: new URL(siteUrl("jobs")).host,
    },
    (path) => existsSync(join(process.cwd(), PUBLIC_DIR, path)),
    todayUtc()
  )
}

/**
 * Every job posting, validated once per process when this module loads. Every page and route
 * imports this module (or `source` from it), so a bad posting — frontmatter, nesting, a reserved
 * slug, `closes` before `posted`, a body h1, a broken or local-host link, or a missing image —
 * fails `next build` with one `ContentError`.
 */
export const jobs: { jobs: Job[] } = load()

/** The fumadocs page behind a posting (its compiled body component and table of contents). */
export function jobPage(slug: string): Page | undefined {
  return source.getPage([slug])
}

/** Every job posting, open and closed alike. */
export function allJobs(): Job[] {
  return jobs.jobs
}

/** Open postings only: left out of the index, the sitemap and JSON-LD like a closed one. */
export function openJobs(): Job[] {
  return allJobs().filter((candidate) => candidate.open)
}

/** A posting by slug, open or closed. */
export function job(slug: string): Job | undefined {
  return allJobs().find((candidate) => candidate.slug === slug)
}
