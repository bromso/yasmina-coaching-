/**
 * The legal app's pages and how to link to them, so no app hard-codes a path. Swedish is served
 * at the root (`/integritet`), English under `/en` (`/en/privacy`). Zod-free; everything but
 * `legalUrl` is client-safe — `legalUrl` reads `SITE_DOMAIN`, so call it on the server and pass
 * the href down as a prop.
 */

import { siteUrl } from "./index"

/** Each legal page's slug in each language. */
export const LEGAL_PAGES = {
  privacy: { sv: "integritet", en: "privacy" },
  terms: { sv: "villkor", en: "terms" },
  accessibility: { sv: "tillganglighet", en: "accessibility" },
  company: { sv: "foretaget", en: "company" },
} as const

export type LegalPageId = keyof typeof LEGAL_PAGES
export type LegalLocale = "sv" | "en"

/** The page's path on the legal app: `/integritet`, `/en/privacy`. */
export function legalPath(page: LegalPageId, locale: LegalLocale): string {
  const slug = LEGAL_PAGES[page][locale]
  return locale === "sv" ? `/${slug}` : `/${locale}/${slug}`
}

/** The page's absolute URL: `siteUrl("legal", env)` plus `legalPath`. Server-only (reads env). */
export function legalUrl(
  page: LegalPageId,
  locale: LegalLocale,
  env: Record<string, string | undefined> = process.env
): string {
  return `${siteUrl("legal", env)}${legalPath(page, locale)}`
}
