import { parseLocaleCookie } from "@repo/i18n/cookie"
import { type LegalLocale, legalUrl } from "@repo/sites/legal"
import { localeFromCookie } from "@/lib/site-locale"

/**
 * www's retired legal pages: the privacy policy and the terms now live on the legal app
 * (`legal.<domain>`), and these paths only redirect there. Named once here, for the two redirect
 * route handlers and robots' disallow (`scripts/legal-links.test.ts` allows this file and no other).
 */
export const LEGACY_LEGAL_PATHS = { privacy: "/privacy", terms: "/terms" } as const

type LegacyLegalPage = keyof typeof LEGACY_LEGAL_PATHS

/**
 * Where www's old `/privacy` or `/terms` sends a reader: the legal app's page in their language,
 * Swedish when there is none. Server-only: `legalUrl` reads `SITE_DOMAIN`.
 */
export function legalTarget(
  page: LegacyLegalPage,
  locale: LegalLocale = "sv",
  env: Record<string, string | undefined> = process.env
): string {
  return legalUrl(page, locale, env)
}

/**
 * The `GET` handler of `app/privacy/route.ts` and `app/terms/route.ts`: a permanent (308) redirect
 * to the legal app, in the language the `locale` cookie picks the way `getLocale()` does (English
 * only for `en`). A route handler rather than a page, so the redirect ships no page bundle.
 * `Cache-Control: private, no-store`: a 308 without freshness headers is cached by browsers
 * indefinitely, and its target depends on the cookie, so a reader who switched language would
 * keep landing on the old one.
 */
export function legalRedirect(
  page: LegacyLegalPage,
  env: Record<string, string | undefined> = process.env
): (request: Request) => Response {
  return (request) => {
    const locale = localeFromCookie(parseLocaleCookie(request.headers.get("cookie")))
    return new Response(null, {
      status: 308,
      headers: {
        location: legalTarget(page, locale, env),
        "cache-control": "private, no-store",
      },
    })
  }
}
