import { extractLinks } from "@repo/content/checks"
import { createLegal, type Legal, type LegalInput } from "@repo/content/legal"
import { ContentError } from "@repo/content/posts"
import { LEGAL_PAGES, type LegalLocale } from "@repo/sites/legal"
import { ROOT_LOCALE, UI } from "@/content/ui"

/** A page file's frontmatter block, which `toLegalInput` leaves out of the placeholder scan. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/

/** A page's slug from its file name: `integritet.mdx` → `integritet`, `en-privacy.mdx` → `privacy`. */
export function slugOf(name: string): string {
  const base = name.replace(/\.mdx$/, "")
  return base.startsWith("en-") ? base.slice(3) : base
}

/** The way back: a page's file name without `.mdx`, which is also its fumadocs slug. */
export function fileSlug(slug: string, locale: LegalLocale): string {
  return locale === ROOT_LOCALE ? slug : `${locale}-${slug}`
}

/**
 * One page file as `createLegal` takes it: the slug from its name (`name`, relative to
 * `content/pages/`), the frontmatter as parsed, the raw body without the frontmatter as the text
 * to scan for placeholders (a placeholder in a title would not be marked on the page) and for
 * links, and the ids of its headings (`anchors`, as the renderer slugs them) for the link check.
 */
export function toLegalInput(
  name: string,
  frontmatter: unknown,
  raw: string,
  anchors: string[] = []
): LegalInput {
  const text = raw.replace(FRONTMATTER, "")
  return {
    file: `apps/legal/content/pages/${name}`,
    slug: slugOf(name),
    frontmatter,
    text,
    anchors,
    links: extractLinks(text),
  }
}

/** The `PUBLIC_ROUTES` array of www's `src/lib/routes.ts`, and the strings it lists. */
const PUBLIC_ROUTES = /export const PUBLIC_ROUTES = \[([^\]]*)\]/
const QUOTED = /"([^"]*)"/g

/**
 * The marketing site's pages a `www:/…` link may name, read from the source of www's
 * `src/lib/routes.ts` (an app is not a package another app can import). Throws when the list
 * cannot be found, so a reshaped file fails the build loudly rather than passing every link.
 */
export function wwwRoutesFrom(source: string): string[] {
  const list = PUBLIC_ROUTES.exec(source)?.[1]
  const routes = list ? [...list.matchAll(QUOTED)].map((match) => match[1] as string) : []
  if (routes.length === 0) throw new Error("apps/www/src/lib/routes.ts: no PUBLIC_ROUTES found")
  return routes
}

/**
 * The legal pages from their inputs, every problem in one `ContentError`: `priorProblems` (the
 * caller's own checks, such as a body `# h1`) first, then `createLegal`'s — among them a body
 * heading that takes the change log's id, and a link to no page, no heading, or (given
 * `wwwPaths`) no page on the marketing site.
 */
export function assembleLegal(
  inputs: LegalInput[],
  priorProblems: string[],
  wwwPaths?: readonly string[]
): Legal {
  const problems = [...priorProblems]
  let legal: Legal | null = null
  try {
    legal = createLegal(inputs, LEGAL_PAGES, {
      rootLocale: ROOT_LOCALE,
      changeLogIds: { sv: UI.sv.changeLogId, en: UI.en.changeLogId },
      wwwPaths,
    })
  } catch (error) {
    if (!(error instanceof ContentError)) throw error
    problems.push(...error.problems)
  }
  if (problems.length > 0 || !legal) throw new ContentError(problems)
  return legal
}
