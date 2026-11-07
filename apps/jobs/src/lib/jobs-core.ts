import { extractLinks, headingProblems, imageProblems } from "@repo/content/checks"
import { checkLinks } from "@repo/content/links"
import { ContentError } from "@repo/content/posts"
import type { JobFrontmatter } from "@repo/content/schema"

/** Where job postings live, repo-relative, for messages about a file. */
export const REPO_JOBS_DIR = "apps/jobs/content/jobs"

/** Top-level names the app's own routes take (`/<slug>/apply`, `/og/…`, `/api/…` and the root
 * metadata files `/opengraph-image`, `/twitter-image`, `/manifest.webmanifest`, `/sitemap.xml`,
 * `/robots.txt`): a posting slug matching one of these would be shadowed by it. */
const RESERVED = new Set([
  "apply",
  "og",
  "api",
  "opengraph-image",
  "twitter-image",
  "manifest.webmanifest",
  "sitemap.xml",
  "robots.txt",
])

/** One job posting as the checks and the build need it: the repo-relative file (for messages),
 * its slug, its frontmatter and its raw MDX source and the image `src`s it references. */
export interface JobInput {
  file: string
  slug: string
  frontmatter: JobFrontmatter
  /** Raw MDX source: links, images and the body-h1 check all read it directly. */
  source: string
  images: string[]
}

export interface Job {
  slug: string
  /** `/<slug>`. */
  path: string
  title: string
  description: string
  team: string
  location: string
  employment: JobFrontmatter["employment"]
  /** UTC `YYYY-MM-DD`. */
  posted: string
  /** UTC `YYYY-MM-DD`. */
  closes?: string
  status: JobFrontmatter["status"]
  salary?: string
  /** Computed at build time from `status` and `closes` against today's UTC date. */
  open: boolean
}

/**
 * A posting is open when its `status` is `open` and, when it sets `closes`, that date is today
 * (UTC) or later. `today` is a UTC `YYYY-MM-DD` string, comparable to `closes` with plain string
 * `>=` because both take that one canonical form.
 */
export function isOpen(job: Pick<Job, "status" | "closes">, today: string): boolean {
  return job.status === "open" && (!job.closes || job.closes >= today)
}

/**
 * A posting sits directly in content/jobs/ (`slugs` is fumadocs' per-page path segments): a
 * subfolder would get a multi-segment address the jobs board's routes do not serve.
 */
export function nestingProblems(pages: { file: string; slugs: string[] }[]): string[] {
  return pages
    .filter(({ slugs }) => slugs.length !== 1)
    .map(({ file }) => `${file}: job postings must sit directly in content/jobs/`)
}

/** A posting whose slug is a reserved top-level name would never be served: the built-in route
 * at that path wins. */
export function reservedProblems(inputs: { slug: string; file: string }[]): string[] {
  return inputs.flatMap(({ slug, file }) =>
    RESERVED.has(slug)
      ? [`${file}: "${slug}" is reserved (it would be shadowed by a built-in route)`]
      : []
  )
}

/** `closes` set before `posted` is a contradiction no reader could act on. */
export function closesProblems(
  inputs: { file: string; frontmatter: Pick<JobFrontmatter, "posted" | "closes"> }[]
): string[] {
  return inputs.flatMap(({ file, frontmatter }) =>
    frontmatter.closes && frontmatter.closes < frontmatter.posted
      ? [`${file}: "closes" (${frontmatter.closes}) is before "posted" (${frontmatter.posted})`]
      : []
  )
}

/** Every path a root-relative jobs-board link may land on: `/`, every posting, and `/<slug>/apply`
 * for a posting that is open (a closed posting's apply route does not exist — `dynamicParams` is
 * `false` and `generateStaticParams` lists open postings only). The link check drops `?query` and
 * `#anchor` before it asks. */
export function jobsKnownPaths(jobs: Pick<Job, "slug" | "open">[]): Set<string> {
  const paths = new Set<string>(["/"])
  for (const job of jobs) {
    paths.add(`/${job.slug}`)
    if (job.open) paths.add(`/${job.slug}/apply`)
  }
  return paths
}

function toJob(input: JobInput, today: string): Job {
  const { frontmatter } = input
  return {
    slug: input.slug,
    path: `/${input.slug}`,
    title: frontmatter.title,
    description: frontmatter.description,
    team: frontmatter.team,
    location: frontmatter.location,
    employment: frontmatter.employment,
    posted: frontmatter.posted,
    closes: frontmatter.closes,
    status: frontmatter.status,
    salary: frontmatter.salary,
    open: isOpen(frontmatter, today),
  }
}

/**
 * Builds `{ jobs }` from already-parsed inputs, collecting every problem it can find into one
 * thrown `ContentError`, rather than stopping at the first stage that fails: `priorProblems`
 * (nesting, already computed by the caller from fumadocs' own page list), a reserved slug, `closes`
 * before `posted`, a body `#` h1, broken or local-host links, and missing images under `public/`.
 * Nothing is built when there is any problem — the caller never sees a partial `{ jobs }`.
 */
export function assembleJobs(
  inputs: JobInput[],
  priorProblems: string[],
  known: { hosts: Set<string>; ownHost: string },
  imageExists: (path: string) => boolean,
  today: string
): { jobs: Job[] } {
  const problems = [...priorProblems]

  problems.push(
    ...reservedProblems(inputs.map((input) => ({ slug: input.slug, file: input.file }))),
    ...closesProblems(inputs),
    ...inputs.flatMap((input) => headingProblems(input.file, input.source, "posting"))
  )

  const jobs = inputs.map((input) => toJob(input, today))

  problems.push(
    ...checkLinks(
      inputs.map((input) => ({ file: input.file, links: extractLinks(input.source) })),
      { paths: jobsKnownPaths(jobs), hosts: known.hosts, ownHost: known.ownHost }
    ),
    ...inputs.flatMap((input) => imageProblems(input.file, input.images, imageExists))
  )

  if (problems.length > 0) throw new ContentError(problems)

  return { jobs }
}

/** Open jobs, grouped by team: team order is alphabetical by team name (first appearance among
 * equal names makes no difference — a team name either is or isn't the same string). Jobs within
 * a team keep the order they were given in. */
export function jobsByTeam(jobs: Job[]): { team: string; jobs: Job[] }[] {
  const teams = [...new Set(jobs.map((job) => job.team))].sort((a, b) => a.localeCompare(b))
  return teams.map((team) => ({ team, jobs: jobs.filter((job) => job.team === team) }))
}

/** The display label for a posting's `employment` value. */
export const EMPLOYMENT_LABEL: Record<JobFrontmatter["employment"], string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
}

/**
 * A team name's anchor id on the home page (`#team-engineering`): lowercased, non-alphanumeric
 * runs collapsed to one hyphen, leading and trailing hyphens trimmed. Free-text team names have no
 * other guaranteed-unique, URL-safe form, and the home page's filter links and section ids must
 * agree on it.
 */
export function teamAnchor(team: string): string {
  return `team-${team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`
}
