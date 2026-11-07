import { imageProblems } from "@repo/content/checks"
import { checkLinks } from "@repo/content/links"
import type { Blog, BlogOptions, PostInput } from "@repo/content/posts"
import { ContentError, createBlog, DEFAULT_PAGE_SIZE, isPublished } from "@repo/content/posts"
import type { Author, PostFrontmatter } from "@repo/content/schema"
import { postFrontmatterSchema } from "@repo/content/schema"

/** The blog's feed routes, linkable from any post. */
const FEEDS = ["/rss.xml", "/atom.xml", "/feed.json"] as const

/** The one description for the blog as a whole: the layout's `<meta name="description">` and
 * every feed's own `description`, so the two never drift apart. */
export const BLOG_DESCRIPTION = "Notes, releases and guides"

/**
 * Every path the blog serves for these published posts: the index and its further pages
 * (`/page/2` on; page 1 is `/`), each post, each tag and author with a published post, and the
 * feeds. The link check accepts a root-relative link only when it lands on one of these. Takes
 * posts rather than a built `Blog` so `assembleBlog` can ask even when `createBlog` throws over an
 * unrelated post.
 */
export function knownPaths(
  posts: { slug: string; frontmatter: Pick<PostFrontmatter, "tags" | "author"> }[],
  pageSize: number = DEFAULT_PAGE_SIZE
): Set<string> {
  const paths = new Set<string>(["/", ...FEEDS])
  const pages = Math.max(1, Math.ceil(posts.length / pageSize))
  for (let n = 2; n <= pages; n++) paths.add(`/page/${n}`)
  for (const post of posts) {
    paths.add(`/${post.slug}`)
    for (const tag of post.frontmatter.tags) paths.add(`/tags/${tag}`)
    paths.add(`/authors/${post.frontmatter.author}`)
  }
  return paths
}

/**
 * Posts nested in a folder (`content/posts/2026/x.mdx` has slugs `["2026", "x"]`) would get a
 * multi-segment address the blog's routes do not serve, so every post must be one level deep.
 */
export function nestingProblems(pages: { file: string; slugs: string[] }[]): string[] {
  return pages
    .filter(({ slugs }) => slugs.length !== 1)
    .map(({ file }) => `${file}: posts must sit directly in content/posts/`)
}

/** A post input, plus every image `src` it references — body images and, when set, `cover.src`
 * (checked the same way: root-relative and present under `public/`, or left alone). */
export type BlogInput = PostInput & { images: string[] }

/**
 * Builds a `Blog` from already-parsed inputs, collecting every problem it can find into one
 * thrown `ContentError`, rather than stopping at the first stage that fails: `priorProblems`
 * (nesting and body-h1 issues, already computed by the caller), `createBlog`'s own checks
 * (frontmatter, author, tag and slug format, duplicate slugs), and — for the posts that would
 * publish — broken links and missing images (`cover` included, via `images`).
 *
 * Link and image checks run against the posts that would publish (`isPublished`, the rule
 * `createBlog` applies), never against `createBlog`'s own return value: when `createBlog` throws
 * (a bad post, anywhere), there is no built `Blog` left to ask, and a bad tag on one post must not
 * hide a broken link on another — both belong in the same `ContentError`. A post whose
 * frontmatter does not parse is skipped here (`createBlog` has already reported it), so a missing
 * date or tag list cannot surface as a TypeError instead. They run only when at least one post
 * would publish.
 */
export function assembleBlog(
  inputs: BlogInput[],
  priorProblems: string[],
  authors: Record<string, Author>,
  options: BlogOptions,
  known: { hosts: Set<string>; ownHost: string },
  exists: (path: string) => boolean
): Blog {
  const problems = [...priorProblems]

  let loaded: Blog | null = null
  try {
    loaded = createBlog(inputs, authors, options)
  } catch (error) {
    if (!(error instanceof ContentError)) throw error
    problems.push(...error.problems)
  }

  const published = inputs.flatMap((input) => {
    const parsed = postFrontmatterSchema.safeParse(input.frontmatter)
    if (!parsed.success || !isPublished(parsed.data, options)) return []
    return [{ ...input, frontmatter: parsed.data }]
  })
  if (published.length > 0) {
    problems.push(
      ...checkLinks(published, {
        paths: knownPaths(published),
        hosts: known.hosts,
        ownHost: known.ownHost,
      }),
      ...published.flatMap((input) => imageProblems(input.file, input.images, exists))
    )
  }

  if (problems.length > 0) throw new ContentError(problems)
  return loaded as Blog
}
