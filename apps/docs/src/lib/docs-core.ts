import { extractLinks, headingProblems, imageProblems } from "@repo/content/checks"
import { checkLinks } from "@repo/content/links"
import { ContentError } from "@repo/content/posts"

/** Routes the docs serve besides the pages themselves: the page index and the search index. */
const EXTRA_PATHS = ["/all", "/api/search"] as const

/** Top-level names the app's own routes take (`/all`, `/og/…`, `/api/…` and the root metadata
 * files `/opengraph-image`, `/twitter-image`, `/manifest.webmanifest`, `/sitemap.xml`,
 * `/robots.txt`): a page or folder named so would be shadowed by them. */
const RESERVED = new Set([
  "all",
  "og",
  "api",
  "opengraph-image",
  "twitter-image",
  "manifest.webmanifest",
  "sitemap.xml",
  "robots.txt",
])

/** fumadocs' separator (`---Name---`, `---[icon]Name---`, or a bare `---`), copied verbatim from
 * fumadocs-core 16.16.2's page-tree builder: the first form is not end-anchored, so `---a---b` is
 * a separator, while `------` (no name) is not one and is looked up as a file. Built from the
 * pattern's source text because the app's TypeScript target (ES2017) refuses named groups in a
 * regex literal; the runtime supports them. */
// biome-ignore lint/complexity/useRegexLiterals: a literal with named groups fails tsc at ES2017.
const SEPARATOR = new RegExp(String.raw`^---(?:\[(?<icon>[^\]]+)])?(?<name>.+)---|^---$`)
/** fumadocs' rest tokens: every remaining entry, in order or reversed. */
const REST = new Set(["...", "z...a"])
/** fumadocs' link entry, `[Text](url)`, optionally `external:` and/or `[icon]` first: a sidebar
 * link, not a file. */
const LINK_ENTRY = /^(?:external:)?(?:\[[^\]]+])?\[[^\]]+]\([^)]+\)$/
/** fumadocs' prefix that hides a page or folder from the rest tokens; checked by the name after it. */
const EXCLUDE_PREFIX = "!"
/** fumadocs' prefix that inlines a folder's children; it names a folder only (a page is ignored). */
const EXTRACT_PREFIX = "..."

/** What a name in a `meta.json`'s folder is: a page (`<name>.mdx` / `.md`), a folder, or nothing. */
export type EntryKind = "page" | "folder" | undefined

/** One `meta.json`: its file (for the message), its folder relative to `content/docs` (`""` at the
 * root, `/guides` for `content/docs/guides`) and its `pages` list, when it has one. */
export interface MetaInput {
  file: string
  dir: string
  pages?: string[]
}

/**
 * A `pages` entry that names neither a page (`<name>.mdx`) nor a subfolder of its `meta.json`'s
 * folder is dropped from the sidebar by fumadocs without a word, so it is reported instead.
 * Entries are classified in fumadocs' own order: the rest tokens, separators and link entries name
 * no file and are skipped; `!name` is checked by the name after the prefix; `...name` must name a
 * folder (fumadocs silently ignores a page there). `kind(dir, name)` says whether `<dir>/<name>` is
 * a page, a folder or nothing.
 */
export function metaProblems(
  metas: MetaInput[],
  kind: (dir: string, name: string) => EntryKind
): string[] {
  const problems: string[] = []
  for (const { file, dir, pages } of metas) {
    for (const name of pages ?? []) {
      if (REST.has(name) || SEPARATOR.test(name) || LINK_ENTRY.test(name)) continue
      if (name.startsWith(EXCLUDE_PREFIX)) {
        if (!kind(dir, name.slice(EXCLUDE_PREFIX.length)))
          problems.push(`${file}: "${name}" in pages matches no page or folder`)
      } else if (name.startsWith(EXTRACT_PREFIX)) {
        if (kind(dir, name.slice(EXTRACT_PREFIX.length)) !== "folder")
          problems.push(`${file}: "${name}" must name a folder`)
      } else if (!kind(dir, name)) {
        problems.push(`${file}: "${name}" in pages matches no page or folder`)
      }
    }
  }
  return problems
}

/** A `meta.yaml` / `meta.yml` under content/docs: fumadocs would read it, but only `meta.json` is
 * checked here, so one is refused rather than left unchecked. `files` are repo-relative paths. */
export function metaFormatProblems(files: string[]): string[] {
  return files
    .filter((file) => /(?:^|\/)meta\.ya?ml$/.test(file))
    .map((file) => `${file}: use meta.json (meta.yaml is not checked)`)
}

/**
 * A page whose URL starts with a reserved name — a top-level `all.mdx`, or any page in a top-level
 * `api/` folder — would never be served: the built-in route at that path wins. One problem per
 * page, naming its file.
 */
export function reservedProblems(pages: { url: string; file: string }[]): string[] {
  return pages.flatMap(({ url, file }) => {
    const name = url.split("/")[1] ?? ""
    return RESERVED.has(name)
      ? [`${file}: "${name}" is reserved (it would be shadowed by a built-in route)`]
      : []
  })
}

/** Every path a root-relative docs link may land on: each page's URL, `/all` and `/api/search`.
 * The link check drops `?query` and `#anchor` before it asks. */
export function docsKnownPaths(urls: string[]): Set<string> {
  return new Set([...urls, ...EXTRA_PATHS])
}

/** A docs page as the checks need it: the repo-relative file (for messages), its URL, its raw MDX
 * source and every image `src` it references. */
export interface DocInput {
  file: string
  url: string
  source: string
  images: string[]
}

/**
 * Checks every docs page and `meta.json` and throws one `ContentError` listing every problem:
 * `meta.yaml` files, `meta.json` entries that match nothing, pages under a reserved name, body `#` h1s, broken,
 * relative or local-host links, and root-relative images missing under `public/` (`imageExists`).
 * Frontmatter is not checked here: fumadocs already refused a bad one when it compiled the page.
 */
export function assembleDocs(
  inputs: DocInput[],
  meta: {
    metas: MetaInput[]
    kind: (dir: string, name: string) => EntryKind
    /** Every file under content/docs, repo-relative, for the `meta.yaml` check. */
    files?: string[]
  },
  known: { hosts: Set<string>; ownHost: string },
  imageExists: (path: string) => boolean
): void {
  const paths = docsKnownPaths(inputs.map((input) => input.url))
  const problems = [
    ...metaFormatProblems(meta.files ?? []),
    ...metaProblems(meta.metas, meta.kind),
    ...reservedProblems(inputs),
    ...inputs.flatMap((input) => headingProblems(input.file, input.source)),
    ...checkLinks(
      inputs.map((input) => ({ file: input.file, links: extractLinks(input.source) })),
      { paths, hosts: known.hosts, ownHost: known.ownHost }
    ),
    ...inputs.flatMap((input) => imageProblems(input.file, input.images, imageExists)),
  ]
  if (problems.length > 0) throw new ContentError(problems)
}
