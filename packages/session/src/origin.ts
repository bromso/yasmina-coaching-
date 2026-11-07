const forbidden = (message: string) =>
  Response.json({ defined: false, code: "FORBIDDEN", status: 403, message }, { status: 403 })

/**
 * CSRF check for route handlers (server actions get this from Next itself). Same-origin or
 * user-initiated (`none`) requests pass; anything else, including a sibling subdomain, is refused.
 */
export function assertSameOrigin(req: Request): Response | null {
  const site = req.headers.get("sec-fetch-site")
  if (site === "same-origin" || site === "none") return null
  const origin = req.headers.get("origin")
  if (origin && origin === new URL(req.url).origin) return null
  return forbidden("Cross-site request refused")
}

/**
 * A post-login target must be an absolute URL on a subdomain of the cookie domain (`domain`):
 * `https:` in production, `http:` otherwise — except when `domain` is itself a `.localhost`
 * domain (e.g. `.brand.localhost`, the Docker Compose "production-like" stack's default and this
 * repo's e2e harness), which has no real TLS available: there, `http:` and `https:` are both
 * accepted regardless of `production`, the same exception `@repo/sites` already makes for it. The
 * session cookie's own `secure` flag (`packages/session/src/cookie.ts`) has no such exception —
 * it is `production` either way — but it still works over `http:` on `*.localhost` because
 * Chromium and Firefox treat `*.localhost` as a secure context regardless of scheme. The bare
 * parent domain, look-alikes and anything else go to `appUrl`. Credentials in the URL are dropped.
 */
export function safeNextUrl(
  candidate: string | null | undefined,
  { appUrl, production, domain }: { appUrl: string; production: boolean; domain: string }
): string {
  if (!candidate) return appUrl
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return appUrl
  }
  const suffix = (domain.startsWith(".") ? domain : `.${domain}`).toLowerCase()
  const isLocalhostDomain = suffix.endsWith(".localhost")
  const okProtocol = isLocalhostDomain
    ? url.protocol === "http:" || url.protocol === "https:"
    : url.protocol === (production ? "https:" : "http:")
  const ok = okProtocol && suffix.length > 1 && url.hostname.endsWith(suffix)
  if (!ok) return appUrl
  url.username = ""
  url.password = ""
  return url.href
}
