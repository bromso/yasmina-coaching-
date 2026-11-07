import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, sep } from "node:path"
import { extractImages } from "@repo/content/checks"
import { type DocFrontmatter, docFrontmatterSchema } from "@repo/content/schema"
import { SITES, type SiteId, siteUrl } from "@repo/sites"
import { assembleDocs, type DocInput, type EntryKind, type MetaInput } from "./docs-core"
import { source } from "./source"

/** The validated fumadocs loader: importing it from here runs the checks below first. */
export { source }

/** A docs page as fumadocs loaded it. */
export type Page = ReturnType<typeof source.getPages>[number]

/** A docs page's address, files and frontmatter, as plain data. */
export interface DocEntry {
  /** The page's URL: `/` for content/docs/index.mdx, `/guides` for content/docs/guides/index.mdx. */
  url: string
  /** The file relative to content/docs (`guides/deploying.mdx`), for "Edit on GitHub". */
  path: string
  /** The file relative to the repo root, as content problems name it. */
  file: string
  frontmatter: DocFrontmatter
}

/** Where the docs live, relative to the app (the working directory of `next dev` / `next build`). */
const DOCS_DIR = join("content", "docs")
const PUBLIC_DIR = "public"
const REPO_DOCS_DIR = "apps/docs/content/docs"
const FRONTMATTER_KEYS = Object.keys(docFrontmatterSchema.shape) as (keyof DocFrontmatter)[]

/**
 * A page's frontmatter alone: fumadocs spreads it into `page.data` next to its own keys (`body`,
 * `toc`, `structuredData`, …), which the strict schema would refuse. fumadocs already refused a
 * bad frontmatter when it compiled the page against the same schema; parsing the picked keys again
 * restores the schema's output types (`updated` as a `Date`).
 */
function frontmatterOf(page: Page): DocFrontmatter {
  const data = page.data as unknown as Record<string, unknown>
  return docFrontmatterSchema.parse(
    Object.fromEntries(
      FRONTMATTER_KEYS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])
    )
  )
}

function toInput(page: Page): DocInput {
  // fumadocs keeps no raw source, so links, images and headings are read from the file itself.
  const source = readFileSync(join(process.cwd(), DOCS_DIR, page.path), "utf8")
  return {
    file: `${REPO_DOCS_DIR}/${page.path}`,
    url: page.url,
    source,
    images: extractImages(source),
  }
}

/** Every file under content/docs, relative to it with `/` separators. */
function listFiles(): string[] {
  const root = join(process.cwd(), DOCS_DIR)
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((path) => path.split(sep).join("/"))
    .sort()
}

/** Every meta.json under content/docs, with its folder relative to content/docs (`""` at the root,
 * `/guides` below it). fumadocs already checked each against its meta schema at compile. */
function readMetas(): MetaInput[] {
  const root = join(process.cwd(), DOCS_DIR)
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path === "meta.json" || path.endsWith(`${sep}meta.json`))
    .sort()
  return files.map((path) => {
    const folder = dirname(path)
    const dir = folder === "." ? "" : `/${folder.split(sep).join("/")}`
    const { pages } = JSON.parse(readFileSync(join(root, path), "utf8")) as { pages?: string[] }
    return { file: `${REPO_DOCS_DIR}/${path.split(sep).join("/")}`, dir, pages }
  })
}

/** Whether a meta.json's `name` is a folder or a page (`name.mdx` / `name.md`) in its own folder
 * — the folder first, as fumadocs resolves it. */
function entryKind(dir: string, name: string): EntryKind {
  const base = join(process.cwd(), DOCS_DIR, dir, name)
  if (existsSync(base) && statSync(base).isDirectory()) return "folder"
  if (existsSync(`${base}.mdx`) || existsSync(`${base}.md`)) return "page"
  return undefined
}

function load(): DocEntry[] {
  const pages = source.getPages()
  const ids = Object.keys(SITES) as SiteId[]
  assembleDocs(
    pages.map(toInput),
    {
      metas: readMetas(),
      kind: entryKind,
      files: listFiles().map((path) => `${REPO_DOCS_DIR}/${path}`),
    },
    {
      hosts: new Set(ids.map((id) => new URL(siteUrl(id)).host)),
      ownHost: new URL(siteUrl("docs")).host,
    },
    (path) => existsSync(join(process.cwd(), PUBLIC_DIR, path))
  )
  return pages.map((page) => ({
    url: page.url,
    path: page.path,
    file: `${REPO_DOCS_DIR}/${page.path}`,
    frontmatter: frontmatterOf(page),
  }))
}

/**
 * Every docs page, validated once per process when this module loads. Every page and route imports
 * this module (or `source` from it), so a bad page — a `meta.json` entry matching nothing, a body
 * h1, a broken or local-host link, a missing image — fails `next build` with one `ContentError`.
 */
export const docs: { pages: DocEntry[] } = { pages: load() }
