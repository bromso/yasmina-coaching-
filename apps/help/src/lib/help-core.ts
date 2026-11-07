import { extractLinks, headingProblems, imageProblems } from "@repo/content/checks"
import { checkLinks } from "@repo/content/links"
import { ContentError } from "@repo/content/posts"
import type { HelpFrontmatter } from "@repo/content/schema"
import type { TocItem } from "@repo/ui/blocks/toc"

/** Where help articles live, repo-relative, for messages about a file that may not exist (a
 * missing `meta.json` has no `file` of its own to name). */
export const REPO_ARTICLES_DIR = "apps/help/content/articles"

/** Routes the help center serves besides the articles themselves. */
const EXTRA_PATHS = ["/all", "/api/search", "/contact"] as const

/** Top-level names the app's own routes take (`/all`, `/contact`, `/og/…`, `/api/…` and the root
 * metadata files `/opengraph-image`, `/twitter-image`, `/manifest.webmanifest`, `/sitemap.xml`,
 * `/robots.txt`): a category named so would be shadowed by them. */
const RESERVED = new Set([
  "all",
  "contact",
  "og",
  "api",
  "opengraph-image",
  "twitter-image",
  "manifest.webmanifest",
  "sitemap.xml",
  "robots.txt",
])

/** One article as the checks and the build need it: the repo-relative file (for messages), its
 * category and slug, its frontmatter, its raw MDX source and every image `src` it references, and
 * its compiled table of contents. */
export interface HelpArticleInput {
  file: string
  category: string
  slug: string
  frontmatter: HelpFrontmatter
  /** Raw MDX source: links, images and the body-h1 check all read it directly. */
  source: string
  images: string[]
  toc: TocItem[]
}

/** One `meta.json`: its file (for messages), its folder (`""` for the root meta.json that orders
 * categories, `/<category>` for a category's own, which also orders its articles), its `pages`
 * order and, for a category, its `title` and `description`. */
export interface HelpMetaInput {
  file: string
  dir: string
  pages?: string[]
  title?: string
  description?: string
}

export interface HelpArticle extends Pick<HelpFrontmatter, "title" | "description" | "tags"> {
  slug: string
  category: string
  /** `/<category>/<slug>`. */
  path: string
  updated?: Date
  popular: boolean
  toc: TocItem[]
}

export interface HelpCategory {
  slug: string
  title: string
  description: string
  articles: HelpArticle[]
}

/**
 * A `meta.yaml` / `meta.yml` under content/articles: fumadocs would read it, but only `meta.json`
 * is checked here, so one is refused rather than left unchecked. `files` are repo-relative paths.
 */
export function metaFormatProblems(files: string[]): string[] {
  return files
    .filter((file) => /(?:^|\/)meta\.ya?ml$/.test(file))
    .map((file) => `${file}: use meta.json (meta.yaml is not checked)`)
}

/**
 * Unlike the docs sidebar, a help `meta.json`'s `pages` only orders its folder's names — no
 * separators, rest tokens, icons or link entries, since help has no sidebar tree. A name that
 * matches neither a category (the root meta.json) nor an article (a category's own) is reported.
 */
export function metaProblems(
  metas: HelpMetaInput[],
  known: (dir: string, name: string) => boolean
): string[] {
  const problems: string[] = []
  for (const { file, dir, pages } of metas) {
    for (const name of pages ?? []) {
      if (!known(dir, name))
        problems.push(`${file}: "${name}" in pages matches no category or article`)
    }
  }
  return problems
}

/**
 * A help article sits exactly two levels deep, `content/articles/<category>/<article>.mdx`
 * (`slugs` is fumadocs' per-page path segments): shallower (a top-level article) or deeper (a
 * sub-folder) would get an address the help center's routes do not serve.
 */
export function nestingProblems(pages: { file: string; slugs: string[] }[]): string[] {
  return pages
    .filter(({ slugs }) => slugs.length !== 2)
    .map(({ file }) => `${file}: help articles must sit in content/articles/<category>/<article>`)
}

/**
 * A category whose URL is a reserved top-level name would never be served: the built-in route at
 * that path wins. One problem per article, naming its file.
 */
export function reservedProblems(pages: { url: string; file: string }[]): string[] {
  return pages.flatMap(({ url, file }) => {
    const name = url.split("/")[1] ?? ""
    return RESERVED.has(name)
      ? [`${file}: "${name}" is reserved (it would be shadowed by a built-in route)`]
      : []
  })
}

/** Every path a root-relative help link may land on: `/`, every category, every article, and the
 * app's own extra routes. The link check drops `?query` and `#anchor` before it asks. */
export function helpKnownPaths(
  categories: string[],
  articles: { category: string; slug: string }[]
): Set<string> {
  const paths = new Set<string>(["/", ...EXTRA_PATHS])
  for (const category of categories) paths.add(`/${category}`)
  for (const article of articles) paths.add(`/${article.category}/${article.slug}`)
  return paths
}

/** Title-cases a kebab-case slug ("two-step-verification" → "Two step verification") for a
 * category with no explicit `title` in its `meta.json`. */
function titleFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean)
  if (words.length === 0) return slug
  const [first, ...rest] = words as [string, ...string[]]
  return [`${first.charAt(0).toUpperCase()}${first.slice(1)}`, ...rest].join(" ")
}

/**
 * `names`, ordered by a `meta.json`'s `pages` (its explicit order), with any name `pages` does not
 * mention appended afterwards, alphabetically. A `pages` entry matching nothing is reported by
 * `metaProblems` elsewhere and ignored here.
 */
export function orderedNames(names: string[], pages?: string[]): string[] {
  const known = new Set(names)
  const ordered = (pages ?? []).filter((name) => known.has(name))
  const seen = new Set(ordered)
  const rest = names.filter((name) => !seen.has(name)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...rest]
}

function toArticle(category: string, input: HelpArticleInput): HelpArticle {
  const { frontmatter } = input
  return {
    slug: input.slug,
    category,
    path: `/${category}/${input.slug}`,
    title: frontmatter.title,
    description: frontmatter.description,
    updated: frontmatter.updated,
    tags: frontmatter.tags,
    popular: frontmatter.popular ?? false,
    toc: input.toc,
  }
}

/**
 * Builds `{ categories, articles }` from already-parsed inputs, collecting every problem it can
 * find into one thrown `ContentError`, rather than stopping at the first stage that fails:
 * `priorProblems` (nesting, already computed by the caller from fumadocs' own page list),
 * `meta.yaml` files, `meta.json` entries matching nothing, a category under a reserved name, a
 * body `#` h1, broken or local-host links, missing images under `public/`, and a category whose
 * `meta.json` has no `description`. Nothing is built when there is any problem — the caller never
 * sees a partial `{ categories, articles }`.
 */
export function assembleHelp(
  inputs: HelpArticleInput[],
  priorProblems: string[],
  metas: HelpMetaInput[],
  known: { hosts: Set<string>; ownHost: string },
  imageExists: (path: string) => boolean,
  files?: string[]
): { categories: HelpCategory[]; articles: HelpArticle[] } {
  const problems = [...priorProblems, ...metaFormatProblems(files ?? [])]

  const categoryNames = [...new Set(inputs.map((input) => input.category))]
  const articlesByCategory = new Map<string, HelpArticleInput[]>()
  for (const input of inputs) {
    const list = articlesByCategory.get(input.category) ?? []
    list.push(input)
    articlesByCategory.set(input.category, list)
  }

  const entryExists = (dir: string, name: string): boolean =>
    dir === ""
      ? categoryNames.includes(name)
      : (articlesByCategory.get(dir.slice(1))?.some((article) => article.slug === name) ?? false)

  const metaByDir = new Map(metas.map((meta) => [meta.dir, meta]))

  problems.push(
    ...metaProblems(metas, entryExists),
    ...reservedProblems(
      inputs.map((input) => ({ url: `/${input.category}/${input.slug}`, file: input.file }))
    ),
    ...inputs.flatMap((input) => headingProblems(input.file, input.source, "article")),
    ...checkLinks(
      inputs.map((input) => ({ file: input.file, links: extractLinks(input.source) })),
      {
        paths: helpKnownPaths(
          categoryNames,
          inputs.map((input) => ({ category: input.category, slug: input.slug }))
        ),
        hosts: known.hosts,
        ownHost: known.ownHost,
      }
    ),
    ...inputs.flatMap((input) => imageProblems(input.file, input.images, imageExists))
  )

  for (const category of categoryNames) {
    const meta = metaByDir.get(`/${category}`)
    if (!meta?.description) {
      const file = meta?.file ?? `${REPO_ARTICLES_DIR}/${category}/meta.json`
      problems.push(`${file}: missing "description"`)
    }
  }

  if (problems.length > 0) throw new ContentError(problems)

  const rootMeta = metaByDir.get("")
  const orderedCategorySlugs = orderedNames(categoryNames, rootMeta?.pages)

  const categories: HelpCategory[] = orderedCategorySlugs.map((slug) => {
    const meta = metaByDir.get(`/${slug}`)
    const articleInputs = articlesByCategory.get(slug) ?? []
    const orderedArticleSlugs = orderedNames(
      articleInputs.map((article) => article.slug),
      meta?.pages
    )
    const bySlug = new Map(articleInputs.map((article) => [article.slug, article]))
    const articles = orderedArticleSlugs.map((articleSlug) => {
      const input = bySlug.get(articleSlug)
      if (!input) throw new Error(`unreachable: "${articleSlug}" is not an article of "${slug}"`)
      return toArticle(slug, input)
    })
    return {
      slug,
      title: meta?.title || titleFromSlug(slug),
      description: meta?.description ?? "",
      articles,
    }
  })

  return { categories, articles: categories.flatMap((category) => category.articles) }
}
