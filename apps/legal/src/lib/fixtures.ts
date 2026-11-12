import type { LegalInput } from "@repo/content/legal"
import { LEGAL_PAGES, type LegalLocale, type LegalPageId } from "@repo/sites/legal"

/** A test input for one page in one language, as `lib/legal.ts` builds it from a file. */
export function legalInput(
  page: LegalPageId,
  locale: LegalLocale,
  overrides: { text?: string; changes?: { date: string; summary: string }[] } = {}
): LegalInput {
  const slug = LEGAL_PAGES[page][locale]
  return {
    file: `apps/legal/content/pages/${locale === "sv" ? slug : `en-${slug}`}.mdx`,
    slug,
    frontmatter: {
      title: `${page} (${locale})`,
      description: `About ${page}.`,
      locale,
      page,
      changes: overrides.changes ?? [{ date: "2026-11-12", summary: "Första utkastet." }],
    },
    text: overrides.text ?? "Text",
  }
}

/** Every page in both languages. */
export function allInputs(): LegalInput[] {
  return (Object.keys(LEGAL_PAGES) as LegalPageId[]).flatMap((page) => [
    legalInput(page, "sv"),
    legalInput(page, "en"),
  ])
}
