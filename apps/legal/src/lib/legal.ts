import { readFileSync } from "node:fs"
import { join } from "node:path"
import { headingProblems } from "@repo/content/checks"
import type { Legal, LegalDoc } from "@repo/content/legal"
import { type LegalFrontmatter, legalFrontmatterSchema } from "@repo/content/schema"
import { assembleLegal, fileSlug, toLegalInput } from "./legal-core"
import { source } from "./source"

/** A page as fumadocs loaded it. */
export type Page = ReturnType<typeof source.getPages>[number]

/** Where the pages live, relative to the app (the working directory of `next dev` / `next build`). */
const PAGES_DIR = join("content", "pages")
const FRONTMATTER_KEYS = Object.keys(legalFrontmatterSchema.shape) as (keyof LegalFrontmatter)[]

/**
 * A page's frontmatter alone: fumadocs spreads it into `page.data` next to its own keys (`body`,
 * `toc`, `structuredData`, …), which the strict schema would refuse.
 */
function frontmatterOf(page: Page): LegalFrontmatter {
  const data = page.data as unknown as Record<string, unknown>
  return Object.fromEntries(
    FRONTMATTER_KEYS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])
  ) as unknown as LegalFrontmatter
}

function load(): Legal {
  const pages = source.getPages()
  const files = pages.map((page) => ({
    page,
    // fumadocs keeps no raw source, so the body is read from the file itself.
    raw: readFileSync(join(process.cwd(), PAGES_DIR, page.path), "utf8"),
  }))
  return assembleLegal(
    files.map(({ page, raw }) => toLegalInput(page.path, frontmatterOf(page), raw)),
    files.flatMap(({ page, raw }) => headingProblems(`apps/legal/content/pages/${page.path}`, raw))
  )
}

/**
 * Every legal page, in both languages, validated once per process when this module loads. Every
 * page imports it, so a bad page — frontmatter, an unknown or missing page, a slug that does not
 * match `LEGAL_PAGES`, a change log out of order or out of step with its translation, a malformed
 * placeholder or a body `# h1` — fails `next build`.
 */
export const legal: Legal = load()

/** The fumadocs page behind a legal page: its compiled body and headings. */
export function legalPage(doc: LegalDoc): Page | undefined {
  return source.getPage([fileSlug(doc.slug, doc.locale)])
}
