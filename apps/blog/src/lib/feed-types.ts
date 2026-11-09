import { BRAND_NAME } from "@repo/sites/brand"
import { type BlogLocale, prefixFor, UI } from "@/content/ui"

/** A language's feeds' own title, and the title each page's `<link rel="alternate">` gives them. */
export function feedTitle(locale: BlogLocale): string {
  return `${BRAND_NAME} · ${UI[locale].title}`
}

/**
 * The RSS, Atom and JSON feed links of one language, for a page's `alternates.types`. Next
 * replaces (never merges) a segment's whole `alternates` object with its parent's, so the root
 * layout's own `alternates.types` is wiped out on every page that sets a canonical — each spreads
 * this in too (through `pageAlternates`), so the feeds stay discoverable there.
 */
export function feedTypes(locale: BlogLocale) {
  const prefix = prefixFor(locale)
  const title = feedTitle(locale)
  return {
    "application/rss+xml": [{ url: `${prefix}/rss.xml`, title }],
    "application/atom+xml": [{ url: `${prefix}/atom.xml`, title }],
    "application/feed+json": [{ url: `${prefix}/feed.json`, title }],
  }
}

/**
 * A page's whole `alternates`: its own `canonical`, its language's feeds and, when the page
 * exists in both languages, an hreflang link to each (`x-default` the Swedish one).
 */
export function pageAlternates(
  canonical: string,
  locale: BlogLocale,
  languages?: Partial<Record<BlogLocale, string>>
) {
  const both = languages?.sv && languages.en
  return {
    canonical,
    types: feedTypes(locale),
    ...(both
      ? { languages: { sv: languages.sv, en: languages.en, "x-default": languages.sv } }
      : {}),
  }
}
