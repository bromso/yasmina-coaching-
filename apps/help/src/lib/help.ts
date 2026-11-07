import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { extractImages } from "@repo/content/checks"
import { type HelpFrontmatter, helpFrontmatterSchema } from "@repo/content/schema"
import { SITES, type SiteId, siteUrl } from "@repo/sites"
import {
  assembleHelp,
  type HelpArticle,
  type HelpArticleInput,
  type HelpCategory,
  type HelpMetaInput,
  nestingProblems,
  REPO_ARTICLES_DIR,
} from "./help-core"
import { source } from "./source"

/** The validated fumadocs loader: importing it from here runs the checks below first. */
export { source }

/** An article as fumadocs loaded it. */
export type Page = ReturnType<typeof source.getPages>[number]

/** Where the articles live, relative to the app (the working directory of `next dev` /
 * `next build`). */
const ARTICLES_DIR = join("content", "articles")
const PUBLIC_DIR = "public"
const FRONTMATTER_KEYS = Object.keys(helpFrontmatterSchema.shape) as (keyof HelpFrontmatter)[]

/**
 * An article's frontmatter alone: fumadocs spreads it into `page.data` next to its own keys
 * (`body`, `toc`, `structuredData`, …), which the strict schema would refuse. fumadocs already
 * refused a bad frontmatter when it compiled the page against the same schema; parsing the picked
 * keys again restores the schema's output types (`updated` as a `Date`).
 */
function frontmatterOf(page: Page): HelpFrontmatter {
  const data = page.data as unknown as Record<string, unknown>
  return helpFrontmatterSchema.parse(
    Object.fromEntries(
      FRONTMATTER_KEYS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])
    )
  )
}

function fileOf(page: Page): string {
  return `${REPO_ARTICLES_DIR}/${page.path}`
}

/**
 * A page two levels deep (`<category>/<article>`) as `assembleHelp` needs it. Called only for
 * pages `nestingProblems` has already accepted — a shallower or deeper page has no sensible
 * category/slug split and is reported there instead.
 */
function toInput(page: Page): HelpArticleInput {
  // fumadocs keeps no raw source, so links, images and headings are read from the file itself.
  const raw = readFileSync(join(process.cwd(), ARTICLES_DIR, page.path), "utf8")
  return {
    file: fileOf(page),
    category: page.slugs[0] as string,
    slug: page.slugs[1] as string,
    frontmatter: frontmatterOf(page),
    source: raw,
    images: extractImages(raw),
    toc: page.data.toc,
  }
}

/** Every file under content/articles, relative to it with `/` separators. Empty when the folder
 * does not exist yet (a fresh checkout before any article is written). */
function listFiles(): string[] {
  const root = join(process.cwd(), ARTICLES_DIR)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((path) => path.split(sep).join("/"))
    .sort()
}

/** Every meta.json under content/articles, with its folder relative to it (`""` at the root,
 * ordering categories; `/<category>` for a category's own, ordering its articles). fumadocs
 * already checked each against its own meta schema at compile. */
function readMetas(): HelpMetaInput[] {
  const root = join(process.cwd(), ARTICLES_DIR)
  if (!existsSync(root)) return []
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path === "meta.json" || path.endsWith(`${sep}meta.json`))
    .sort()
  return files.map((path) => {
    const folder = dirname(path)
    const dir = folder === "." ? "" : `/${folder.split(sep).join("/")}`
    const { pages, title, description } = JSON.parse(readFileSync(join(root, path), "utf8")) as {
      pages?: string[]
      title?: string
      description?: string
    }
    return {
      file: `${REPO_ARTICLES_DIR}/${path.split(sep).join("/")}`,
      dir,
      pages,
      title,
      description,
    }
  })
}

function load(): { categories: HelpCategory[]; articles: HelpArticle[] } {
  const pages = source.getPages()
  const nested = nestingProblems(pages.map((page) => ({ file: fileOf(page), slugs: page.slugs })))
  const inputs = pages.filter((page) => page.slugs.length === 2).map(toInput)
  const ids = Object.keys(SITES) as SiteId[]
  return assembleHelp(
    inputs,
    nested,
    readMetas(),
    {
      hosts: new Set(ids.map((id) => new URL(siteUrl(id)).host)),
      ownHost: new URL(siteUrl("help")).host,
    },
    (path) => existsSync(join(process.cwd(), PUBLIC_DIR, path)),
    listFiles().map((path) => `${REPO_ARTICLES_DIR}/${path}`)
  )
}

/**
 * Every help article, validated once per process when this module loads. Every page and route
 * imports this module (or `source` from it), so a bad article — frontmatter, a meta.json mismatch,
 * nesting, a body h1, a broken or local-host link, a missing image, or a category missing its
 * description — fails `next build` with one `ContentError`.
 */
export const help: { categories: HelpCategory[]; articles: HelpArticle[] } = load()

/** The fumadocs page behind an article (its compiled body component and table of contents). */
export function articlePage(category: string, slug: string): Page | undefined {
  return source.getPage([category, slug])
}

/** A category by slug. */
export function category(slug: string): HelpCategory | undefined {
  return help.categories.find((candidate) => candidate.slug === slug)
}

/** An article by category and slug. */
export function article(categorySlug: string, slug: string): HelpArticle | undefined {
  return category(categorySlug)?.articles.find((candidate) => candidate.slug === slug)
}

/** Articles with `popular: true`, across every category, in category then article order. */
export function popularArticles(): HelpArticle[] {
  return help.articles.filter((candidate) => candidate.popular)
}
