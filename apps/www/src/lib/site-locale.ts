import type { Locale } from "@repo/i18n/locales"

/*
 * www's two languages, client-safe (no `next/headers`): the pure half of `src/lib/locale.ts`, so
 * `bun test` and the client components can read it.
 */

export type { Locale }

/** The site's own language: what every visitor sees until they pick English. */
export const SITE_LOCALE: Locale = "sv"

/**
 * The page's language from the `locale` cookie's raw value: English only when the visitor picked
 * it, Swedish otherwise. `Accept-Language` is ignored on purpose — the site is Swedish first, and
 * a browser set to English is not a choice the visitor made here.
 */
export function localeFromCookie(value: string | null | undefined): Locale {
  return value === "en" ? "en" : SITE_LOCALE
}

/** `Intl` locale for dates and times: `sv-SE` or `en-GB` (day-month-year, 24-hour). */
export const INTL_LOCALE: Record<Locale, string> = { sv: "sv-SE", en: "en-GB" }

/** Open Graph's `og:locale`. */
export const OG_LOCALE: Record<Locale, string> = { sv: "sv_SE", en: "en_GB" }
