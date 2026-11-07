import { localeCookieAttributes } from "@repo/i18n/cookie"
import type { Locale } from "@repo/i18n/locales"

export const SESSION_COOKIE = "session"
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600

/** The one definition of the session cookie. Every app that sets or clears it uses this. */
export function sessionCookieOptions({
  domain,
  production,
}: {
  domain: string
  production: boolean
}) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    // Lax: our subdomains are one site, so the cookie flows between them; cross-site POSTs never carry it.
    secure: production,
    domain,
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

export const ADMIN_SESSION_COOKIE = "admin_session"
export const ADMIN_SESSION_MAX_AGE_SECONDS = 3600

/**
 * Where the admin's own token waits while they impersonate: host-only on the auth app (no
 * Domain, so no sibling subdomain ever sees it) and sent only under /admin.
 */
export function adminSessionCookieOptions({ production }: { production: boolean }) {
  return {
    name: ADMIN_SESSION_COOKIE,
    httpOnly: true,
    path: "/admin",
    sameSite: "lax" as const,
    secure: production,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  }
}

/**
 * The session token from a raw `Cookie` header, for code that holds a `Request` rather than
 * Next's `cookies()`. The last `session=` wins, as in Next's cookie map. A malformed value reads
 * as no session: any sibling subdomain can set a cookie on the parent domain, so this never throws.
 */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const prefix = `${SESSION_COOKIE}=`
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .at(-1)
    ?.slice(prefix.length)
  if (!raw) return null
  try {
    return decodeURIComponent(raw) || null
  } catch {
    return null
  }
}

/**
 * The `locale` cookie as Next's `cookies().set(name, value, options)` wants it, from
 * `@repo/i18n`'s `localeCookieAttributes` so its attributes keep one definition: one year,
 * `Path=/`, `SameSite=Lax`, `Domain` = `COOKIE_DOMAIN`, `Secure` in production (as the session
 * cookie), never `HttpOnly` — the static apps' switcher writes it from the browser.
 */
export function localeCookieOptions(
  locale: Locale,
  { domain, production }: { domain: string; production: boolean }
) {
  const { name, value, ...options } = localeCookieAttributes(locale, { domain, secure: production })
  return { name, value, options }
}
