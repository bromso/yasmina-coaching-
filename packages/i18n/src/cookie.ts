// Mirrors @repo/ui/src/lib/consent.ts's shape exactly: a tolerant parse of a Cookie header and a
// hand-built Set-Cookie value, kept dependency-free for the same reason locales.ts is.
import { isLocale, type Locale } from "./locales"

export const LOCALE_COOKIE = "locale"
export const LOCALE_MAX_AGE = 31_536_000 // 1 year

/** Reads the locale cookie out of a Cookie header: the first recognised value wins, unrecognised
 * duplicates and other cookies are skipped, and anything not a supported locale is `null` (not a
 * choice to honour). */
export function parseLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.split("=")
    if (name?.trim() !== LOCALE_COOKIE) continue
    const value = rest.join("=").trim()
    if (isLocale(value)) return value
  }
  return null
}

/** The locale cookie's one definition, structured: one year, `SameSite=Lax`, `Path=/`, `Domain`
 * only when given, `Secure` only over https, never `HttpOnly` — the static apps' switcher writes
 * it client-side and every app's switcher reads it back. `localeCookie` and `@repo/session`'s
 * Next options both derive from it. */
export function localeCookieAttributes(
  locale: Locale,
  { domain, secure }: { domain?: string; secure: boolean }
) {
  return {
    name: LOCALE_COOKIE,
    value: locale,
    maxAge: LOCALE_MAX_AGE,
    path: "/",
    sameSite: "lax" as const,
    domain: domain || undefined,
    secure,
    httpOnly: false as const,
  }
}

/** The cookie string a locale switcher writes (also valid as a Set-Cookie value), from
 * `localeCookieAttributes`. */
export function localeCookie(
  locale: Locale,
  options: { domain?: string; secure: boolean }
): string {
  const a = localeCookieAttributes(locale, options)
  const parts = [`${a.name}=${a.value}`, `Path=${a.path}`, `Max-Age=${a.maxAge}`, "SameSite=Lax"]
  if (a.domain) parts.push(`Domain=${a.domain}`)
  if (a.secure) parts.push("Secure")
  return parts.join("; ")
}
