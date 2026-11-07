// Zero zod, like `browser.ts`: this module ships in every app's client bundle, static apps
// included, so it must import only from the zod-free `@repo/api-contract/route` — never the
// contract's index or `/analytics` (both pull zod in). `analytics.test.ts`'s bundle-size guard
// enforces this the same way `browser.test.ts` does for `browser.ts`.
import { collapseRoute } from "@repo/api-contract/route"

const ENDPOINT = "/api/analytics"
// AnalyticsIngestSchema's own cap (packages/api-contract/src/analytics.ts); kept here too so an
// oversized pathname is trimmed before it is ever sent, not just collapsed.
const MAX_PATH = 300

function doNotTrack(): boolean {
  return typeof navigator !== "undefined" && navigator.doNotTrack === "1"
}

/**
 * `new URL(referrer).host`, or `""` when `referrer` is empty or unparsable. The route only ever
 * needs a host (to drop a same-origin referrer and nothing else), and the raw URL — which can
 * carry a same-origin one-time token, e.g. `/magic?token=…` — must never leave the browser.
 */
function toReferrerHost(referrer: string): string {
  if (!referrer) return ""
  try {
    return new URL(referrer).host
  } catch {
    return ""
  }
}

/**
 * `sendBeacon` survives unload; `fetch keepalive` is the fallback. Never throws. Nothing in
 * development (`next dev`'s every edit-reload must not reach the dev api) and nothing with Do Not
 * Track — both checked here, once, so every call site (`sendPageview`, `track`) is covered without
 * its own copy.
 */
function beacon(body: Record<string, unknown>): void {
  try {
    if (process.env.NODE_ENV === "development") return
    if (doNotTrack()) return
    const json = JSON.stringify(body)
    const blob = new Blob([json], { type: "application/json" })
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, blob)) return
    void fetch(ENDPOINT, {
      method: "POST",
      body: json,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting must never break the page.
  }
}

/**
 * A pageview beacon: `pathname` is reduced the same way telemetry's routes are (no query string or
 * hash, every opaque segment collapsed to `:id`) before it ever leaves the browser. `referrer` is
 * `document.referrer` for the first pageview of a page load and `""` for a later client-side
 * navigation — the caller (`<Analytics />`) decides which; this reduces it to a host (never the
 * raw URL, which can carry a same-origin one-time token such as `/magic?token=…`) before it is
 * ever sent. The route drops it entirely when that host is its own. Skipped entirely in
 * development and with Do Not Track (both inside `beacon`).
 */
export function sendPageview(pathname: string, referrer: string): void {
  const raw = pathname.split(/[?#]/)[0] || "/"
  const path = collapseRoute(raw).slice(0, MAX_PATH)
  beacon({ kind: "pageview", path, referrerHost: toReferrerHost(referrer) })
}

/** A client-side product event — only events marked `client: true` in `ANALYTICS_EVENTS` mean
 * anything; the api validates the name and the prop allowlist, this call just ships what it's given. */
export function track(name: string, props?: Record<string, unknown>): void {
  beacon({ kind: "event", name, props })
}
