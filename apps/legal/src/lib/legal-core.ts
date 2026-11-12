import { createLegal, type Legal, type LegalInput } from "@repo/content/legal"
import { ContentError } from "@repo/content/posts"
import { LEGAL_PAGES, type LegalLocale } from "@repo/sites/legal"
import { ROOT_LOCALE } from "@/content/ui"

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
 * `content/pages/`), the frontmatter as parsed, and the raw body without the frontmatter as the
 * text to scan for placeholders (a placeholder in a title would not be marked on the page).
 */
export function toLegalInput(name: string, frontmatter: unknown, raw: string): LegalInput {
  return {
    file: `apps/legal/content/pages/${name}`,
    slug: slugOf(name),
    frontmatter,
    text: raw.replace(FRONTMATTER, ""),
  }
}

/**
 * The legal pages from their inputs, every problem in one `ContentError`: `priorProblems` (the
 * caller's own checks, such as a body `# h1`) first, then `createLegal`'s.
 */
export function assembleLegal(inputs: LegalInput[], priorProblems: string[]): Legal {
  const problems = [...priorProblems]
  let legal: Legal | null = null
  try {
    legal = createLegal(inputs, LEGAL_PAGES, { rootLocale: ROOT_LOCALE })
  } catch (error) {
    if (!(error instanceof ContentError)) throw error
    problems.push(...error.problems)
  }
  if (problems.length > 0 || !legal) throw new ContentError(problems)
  return legal
}
