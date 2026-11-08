import { imageProblems } from "@repo/content/checks"
import { checkLinks } from "@repo/content/links"
import type { Blog, BlogOptions, PostInput } from "@repo/content/posts"
import {
  ContentError,
  createBlog,
  DEFAULT_PAGE_SIZE,
  isPublished,
  localePrefix,
  postPath,
} from "@repo/content/posts"
import type { Author, PostFrontmatter, PostLocale } from "@repo/content/schema"
import { POST_LOCALES, postFrontmatterSchema } from "@repo/content/schema"

/** Each language's feed routes (under its prefix), linkable from any post. */
export const FEEDS = ["/rss.xml", "/atom.xml", "/feed.json"] as const

/** The language served at the blog's root; English lives under `/en`. */
export const ROOT_LOCALE: PostLocale = "sv"

/**
 * Every path the blog serves for these published posts, in each language under its own prefix
 * (`""` for Swedish, `/en` for English): the index and its further pages (`/page/2` on; page 1 is
 * the index), each post, each tag and author with a published post in that language, and the
 * feeds. Both indexes and both sets of feeds always exist. The link check accepts a root-relative
 * link only when it lands on one of these. Takes posts rather than a built `Blog` so
 * `assembleBlog` can ask even when `createBlog` throws over an unrelated post.
 */
export function knownPaths(
  posts: {
    slug: string
    frontmatter: Pick<PostFrontmatter, "tags" | "author"> & { locale?: PostLocale }
  }[],
  pageSize: number = DEFAULT_PAGE_SIZE,
  rootLocale: PostLocale = ROOT_LOCALE
): Set<string> {
  const paths = new Set<string>()
  for (const locale of POST_LOCALES) {
    const prefix = localePrefix(locale, rootLocale)
    paths.add(prefix || "/")
    for (const feed of FEEDS) paths.add(`${prefix}${feed}`)
    const own = posts.filter((post) => (post.frontmatter.locale ?? "en") === locale)
    const pages = Math.max(1, Math.ceil(own.length / pageSize))
    for (let n = 2; n <= pages; n++) paths.add(`${prefix}/page/${n}`)
    for (const post of own) {
      paths.add(postPath(post.slug, locale, rootLocale))
      for (const tag of post.frontmatter.tags) paths.add(`${prefix}/tags/${tag}`)
      paths.add(`${prefix}/authors/${post.frontmatter.author}`)
    }
  }
  return paths
}

/** A link to another app of the site, `<app>:/<path>` (`www:/book`): its app id and path. */
const SITE_LINK = /^([a-z]+):(.*)$/

/**
 * Problems with a post's links to the site's other apps. A post cannot know the production
 * domain, so it writes `www:/book` and the blog resolves it to `siteUrl("www")` + `/book` when it
 * renders. The app must be one of `ids` other than the blog itself (a blog link is root-relative),
 * and the path must start with `/`. Any other scheme (`https:`, `mailto:`) is not a site link.
 */
export function siteLinkProblems(file: string, links: string[], ids: readonly string[]): string[] {
  const problems: string[] = []
  for (const href of links) {
    const match = href.match(SITE_LINK)
    if (!match || !ids.includes(match[1] ?? "")) continue
    const [, id, path = ""] = match
    if (id === "blog") {
      problems.push(`${file}: link "${href}" points at the blog itself — write "${path}" instead`)
    } else if (!path.startsWith("/") || path.startsWith("//")) {
      problems.push(`${file}: link "${href}" needs a path starting with "/" (like "${id}:/")`)
    }
  }
  return problems
}

/**
 * The `cover` convention: a photo under `/media/` is `<name>-800.jpg` with a `.webp` of the same
 * name beside it (the post page serves the WebP first). Any other cover is checked only for
 * existence, by `imageProblems`.
 */
export function coverProblems(
  file: string,
  cover: { src: string } | undefined,
  exists: (path: string) => boolean
): string[] {
  if (!cover?.src.startsWith("/media/")) return []
  if (!/^\/media\/[a-z-]+-800\.jpg$/.test(cover.src)) {
    return [`${file}: cover "${cover.src}" must be a "/media/<name>-800.jpg" photo`]
  }
  const webp = cover.src.replace(/\.jpg$/, ".webp")
  return exists(cover.src) && !exists(webp) ? [`${file}: cover "${webp}" not found in public/`] : []
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
    loaded = createBlog(inputs, authors, { rootLocale: ROOT_LOCALE, ...options })
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
        paths: knownPaths(published, DEFAULT_PAGE_SIZE, options.rootLocale ?? ROOT_LOCALE),
        hosts: known.hosts,
        ownHost: known.ownHost,
      }),
      ...published.flatMap((input) => [
        ...imageProblems(input.file, input.images, exists),
        ...coverProblems(input.file, input.frontmatter.cover, exists),
      ])
    )
  }

  if (problems.length > 0) throw new ContentError(problems)
  return loaded as Blog
}
