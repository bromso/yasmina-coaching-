/**
 * The security headers every Next app sends, built in one place. Applied per request by
 * `createSecurityProxy` (./security-proxy) from each app's `src/proxy.ts`.
 *
 * Two headers here have side effects the CSP does not show:
 * - Cross-Origin-Embedder-Policy: credentialless also blocks cross-origin <iframe>s whose origin
 *   does not send COEP itself, so `csp: { "frame-src": [...] }` alone cannot embed a third-party
 *   frame; that needs a shared-header decision, not an app-level extra.
 * - Cross-Origin-Opener-Policy: same-origin severs window.opener, which breaks popup-based
 *   OAuth; switch to same-origin-allow-popups here if that is ever adopted.
 */

export type CspDirective =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "media-src"
  | "font-src"
  | "connect-src"
  | "worker-src"
  | "manifest-src"
  | "frame-src"
  | "frame-ancestors"
  | "form-action"
  | "base-uri"
  | "object-src"

export type SecurityHeaderOptions = {
  /** Development relaxations for Next HMR; never set in production. */
  dev?: boolean
  /** Extra sources per directive, appended to the base policy. The only extension point. */
  csp?: Partial<Record<CspDirective, string[]>>
}

// Next's hydration scripts are inline, so script-src needs 'unsafe-inline' (or a per-request
// nonce, which would make every page dynamic). 'unsafe-eval' is dev-only: HMR needs it.
const BASE_POLICY: Array<[CspDirective, string[]]> = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'"]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  ["img-src", ["'self'", "data:", "blob:", "https:"]],
  ["font-src", ["'self'", "data:"]],
  // Iconify API for icons outside the bundled set; GitHub raw for the bklit choropleth topology.
  ["connect-src", ["'self'", "https://api.iconify.design", "https://raw.githubusercontent.com"]],
  ["worker-src", ["'self'"]],
  ["manifest-src", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
  ["form-action", ["'self'"]],
  ["base-uri", ["'self'"]],
  ["object-src", ["'none'"]],
]

const DEV_EXTRAS: Partial<Record<CspDirective, string[]>> = {
  "script-src": ["'unsafe-eval'"],
  "connect-src": ["ws:", "wss:"],
}

function contentSecurityPolicy(dev: boolean, extras: SecurityHeaderOptions["csp"] = {}): string {
  const policy = new Map<CspDirective, string[]>(
    BASE_POLICY.map(([name, sources]) => [name, [...sources]])
  )
  const append = (additions: Partial<Record<CspDirective, string[]>>) => {
    for (const [name, sources] of Object.entries(additions) as Array<[CspDirective, string[]]>) {
      policy.set(name, [...(policy.get(name) ?? []), ...sources])
    }
  }
  if (dev) append(DEV_EXTRAS)
  append(extras)
  const directives = [...policy].map(([name, sources]) => `${name} ${sources.join(" ")}`)
  // The apps run on http://*.localhost in development; upgrading would break them.
  if (!dev) directives.push("upgrade-insecure-requests")
  return directives.join("; ")
}

export function securityHeaders({
  dev = false,
  csp,
}: SecurityHeaderOptions = {}): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(dev, csp),
    // HSTS is meaningless over plain http and would pin a dev hostname.
    ...(dev ? {} : { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
  }
}
