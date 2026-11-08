import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { extractImages, extractLinks, headingProblems } from "@repo/content/checks"
import type { Blog } from "@repo/content/posts"
import type { PostFrontmatter } from "@repo/content/schema"
import { postFrontmatterSchema } from "@repo/content/schema"
import { SITES, type SiteId, siteUrl } from "@repo/sites"
import { authors } from "../../content/authors"
import { assembleBlog, type BlogInput, nestingProblems, siteLinkProblems } from "./blog-core"
import { source } from "./source"

/** Every author, by key, with their bio in one language: the cards' bylines. */
export { authorsFor } from "../../content/authors"
export { knownPaths, nestingProblems } from "./blog-core"

/** A post as fumadocs loaded it. */
export type Page = ReturnType<typeof source.getPages>[number]

/** Where the posts live, relative to the app (the working directory of `next dev` / `next build`). */
const POSTS_DIR = join("content", "posts")
const PUBLIC_DIR = "public"
const FRONTMATTER_KEYS = Object.keys(postFrontmatterSchema.shape) as (keyof PostFrontmatter)[]

/**
 * A page's frontmatter alone: fumadocs spreads it into `page.data` next to its own keys (`body`,
 * `toc`, `structuredData`, …), which the strict schema would refuse. Unknown authored keys were
 * already refused when fumadocs compiled the file against the same strict schema.
 */
function frontmatterOf(page: Page): PostFrontmatter {
  const data = page.data as unknown as Record<string, unknown>
  return Object.fromEntries(
    FRONTMATTER_KEYS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])
  ) as unknown as PostFrontmatter
}

function fileOf(page: Page): string {
  return `apps/blog/content/posts/${page.path}`
}

function toInput(page: Page): BlogInput & { headings: string[]; siteLinks: string[] } {
  // fumadocs keeps no raw source, so links and images are read from the file itself.
  const raw = readFileSync(join(process.cwd(), POSTS_DIR, page.path), "utf8")
  const frontmatter = frontmatterOf(page)
  const bodyImages = extractImages(raw)
  // cover.src is checked the same way as a body image — root-relative and present under public/.
  const images = frontmatter.cover ? [...bodyImages, frontmatter.cover.src] : bodyImages
  const links = extractLinks(raw)
  return {
    file: fileOf(page),
    slug: page.slugs[0] ?? "",
    frontmatter,
    text: page.data.structuredData.contents.map((c) => c.content).join(" "),
    links,
    images,
    headings: headingProblems(fileOf(page), raw, "post"),
    siteLinks: siteLinkProblems(fileOf(page), links, Object.keys(SITES)),
  }
}

function load(): Blog {
  const pages = source.getPages()
  const nested = nestingProblems(pages.map((page) => ({ file: fileOf(page), slugs: page.slugs })))
  const inputs = pages.map(toInput)
  // Checked for every post, drafts too, like the frontmatter: an h1 or a malformed `www:/` link is
  // a mistake in any post.
  const headings = inputs.flatMap((input) => [...input.headings, ...input.siteLinks])
  const ids = Object.keys(SITES) as SiteId[]
  const exists = (path: string) => existsSync(join(process.cwd(), PUBLIC_DIR, path))
  return assembleBlog(
    inputs,
    [...nested, ...headings],
    authors,
    {
      mode: process.env.NODE_ENV === "production" ? "production" : "development",
      now: new Date(),
    },
    {
      hosts: new Set(ids.map((id) => new URL(siteUrl(id)).host)),
      ownHost: new URL(siteUrl("blog")).host,
    },
    exists
  )
}

/**
 * Every post, in both languages, validated once per process when this module loads. Every page
 * imports it, so a bad post — frontmatter, author, tag, slug, language, translation, nesting, a
 * broken internal link or a missing image — fails `next build`. Pages read one language through
 * `blog.inLocale(locale)`.
 */
export const blog: Blog = load()

/** The fumadocs page behind a post, by its slug (`en-<rest>` for an English post). */
export function postPage(slug: string): Page | undefined {
  return source.getPage([slug])
}
