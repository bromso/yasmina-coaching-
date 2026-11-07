import type { Author, PostFrontmatter } from "./schema"
import { postFrontmatterSchema, SLUG_PATTERN, TAG_PATTERN } from "./schema"

export interface PostInput {
  /** Repo-relative path, for error messages. */
  file: string
  slug: string
  frontmatter: PostFrontmatter
  /** Plain text of the body (reading time). */
  text: string
  /** Every href in the body. */
  links: string[]
}

export interface Post extends PostFrontmatter {
  slug: string
  url: string
  readingMinutes: number
}

export interface BlogOptions {
  mode: "production" | "development"
  now: Date
}

export class ContentError extends Error {
  problems: string[]

  constructor(problems: string[]) {
    super(`Content errors:\n${problems.map((problem) => `- ${problem}`).join("\n")}`)
    this.name = "ContentError"
    this.problems = problems
  }
}

export interface Blog {
  /** Published, newest first (date desc, then slug). */
  posts(): Post[]
  post(slug: string): Post | undefined
  /** `size` defaults to `DEFAULT_PAGE_SIZE` (12); `pages` is always at least 1. */
  page(n: number, size?: number): { posts: Post[]; page: number; pages: number }
  /** By count desc, then tag. */
  tags(): { tag: string; count: number }[]
  byTag(tag: string): Post[]
  /** Keys with at least one published post. */
  authors(): string[]
  byAuthor(key: string): Post[]
  author(key: string): Author | undefined
  /** `limit` defaults to 3. */
  related(slug: string, limit?: number): Post[]
  neighbours(slug: string): { newer?: Post; older?: Post }
}

/** `ceil(words / 200)`, minimum 1. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

/** Posts per list page: `/`, `/page/2`, … */
export const DEFAULT_PAGE_SIZE = 12

/**
 * Slugs a post cannot take: each would collide with a route the blog serves at the root (list
 * pages, tag and author indexes, metadata images, feeds and well-known files) or an app route.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "page",
  "tags",
  "authors",
  "opengraph-image",
  "twitter-image",
  "rss",
  "atom",
  "feed",
  "sitemap",
  "robots",
  "manifest",
  "api",
  "files",
])

/** UTC calendar day, for comparing dates regardless of time of day or caller time zone. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Whether a post publishes: everything does under `next dev`; in production a draft never does,
 * and a dated post only from its UTC calendar day on (compared with `now`'s UTC day).
 */
export function isPublished(
  frontmatter: Pick<PostFrontmatter, "draft" | "date">,
  options: BlogOptions
): boolean {
  if (options.mode === "development") return true
  if (frontmatter.draft) return false
  return utcDay(frontmatter.date) <= utcDay(options.now)
}

export function createBlog(
  inputs: PostInput[],
  authors: Record<string, Author>,
  options: BlogOptions
): Blog {
  const problems: string[] = []
  const fileBySlug = new Map<string, string>()
  // The schema's defaults and coercion (e.g. `type` defaulting to "Blog Post") only apply to the
  // parsed result, so every later step reads from here, never from the raw `input.frontmatter`.
  const parsed: PostFrontmatter[] = []

  for (const { file, slug, frontmatter } of inputs) {
    const result = postFrontmatterSchema.safeParse(frontmatter)
    const fm = result.success ? result.data : frontmatter
    parsed.push(fm)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path.length > 0 ? issue.path.join(".") : "frontmatter"
        problems.push(`${file}: ${field}: ${issue.message}`)
      }
    }

    if (!SLUG_PATTERN.test(slug)) {
      problems.push(`${file}: slug "${slug}" must be lowercase kebab-case`)
    } else if (RESERVED_SLUGS.has(slug)) {
      problems.push(`${file}: slug "${slug}" is reserved`)
    }

    const tags = Array.isArray(fm.tags) ? fm.tags : []
    for (const tag of tags) {
      if (!TAG_PATTERN.test(tag)) {
        problems.push(`${file}: tag "${tag}" must be lowercase kebab-case`)
      }
    }

    if (typeof fm.author === "string" && !Object.hasOwn(authors, fm.author)) {
      problems.push(`${file}: unknown author "${fm.author}"`)
    }

    const existing = fileBySlug.get(slug)
    if (existing) {
      problems.push(`${file}: duplicate slug "${slug}" (also ${existing})`)
    } else {
      fileBySlug.set(slug, file)
    }
  }

  if (problems.length > 0) {
    throw new ContentError(problems)
  }

  const posts: Post[] = inputs
    .map((input, index) => ({ input, frontmatter: parsed[index] as PostFrontmatter }))
    .filter(({ frontmatter }) => isPublished(frontmatter, options))
    .map(({ input, frontmatter }) => ({
      ...frontmatter,
      slug: input.slug,
      url: `/${input.slug}`,
      readingMinutes: readingMinutes(input.text),
    }))
    .sort((a, b) => {
      const byDate = b.date.getTime() - a.date.getTime()
      return byDate !== 0 ? byDate : a.slug.localeCompare(b.slug)
    })

  const bySlug = new Map(posts.map((post) => [post.slug, post]))

  return {
    posts: () => posts,
    post: (slug) => bySlug.get(slug),
    page: (n, size = DEFAULT_PAGE_SIZE) => {
      const pages = Math.max(1, Math.ceil(posts.length / size))
      const start = (n - 1) * size
      return { posts: posts.slice(start, start + size), page: n, pages }
    },
    tags: () => {
      const counts = new Map<string, number>()
      for (const post of posts) {
        for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    },
    byTag: (tag) => posts.filter((post) => post.tags.includes(tag)),
    authors: () => [...new Set(posts.map((post) => post.author))].sort(),
    byAuthor: (key) => posts.filter((post) => post.author === key),
    author: (key) => authors[key],
    related: (slug, limit = 3) => {
      const post = bySlug.get(slug)
      if (!post) return []
      const postTags = new Set(post.tags)
      return posts
        .filter((candidate) => candidate.slug !== slug)
        .map((candidate) => ({
          candidate,
          shared: candidate.tags.filter((tag) => postTags.has(tag)).length,
        }))
        .filter(({ shared }) => shared > 0)
        .sort(
          (a, b) => b.shared - a.shared || b.candidate.date.getTime() - a.candidate.date.getTime()
        )
        .slice(0, limit)
        .map(({ candidate }) => candidate)
    },
    neighbours: (slug) => {
      const index = posts.findIndex((post) => post.slug === slug)
      if (index === -1) return {}
      return {
        newer: index > 0 ? posts[index - 1] : undefined,
        older: index < posts.length - 1 ? posts[index + 1] : undefined,
      }
    },
  }
}
