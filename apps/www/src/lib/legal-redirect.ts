import { type LegalLocale, legalUrl } from "@repo/sites/legal"

/**
 * www's retired legal pages: the privacy policy and the terms now live on the legal app
 * (`legal.<domain>`), and these paths only redirect there. Named once here, for the two redirect
 * pages and robots' disallow (`scripts/legal-links.test.ts` allows this file and no other).
 */
export const LEGACY_LEGAL_PATHS = { privacy: "/privacy", terms: "/terms" } as const

/**
 * Where www's old `/privacy` or `/terms` sends a reader: the legal app's page in their language
 * (`getLocale()`, from the `locale` cookie), Swedish when there is none. Server-only: `legalUrl`
 * reads `SITE_DOMAIN`.
 */
export function legalTarget(
  page: keyof typeof LEGACY_LEGAL_PATHS,
  locale: LegalLocale = "sv",
  env: Record<string, string | undefined> = process.env
): string {
  return legalUrl(page, locale, env)
}
