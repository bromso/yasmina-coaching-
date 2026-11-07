import type { AnalyticsProvider } from "./provider"

type Log = (message: string, error: unknown) => void
/** Fetch-shaped, structurally: `typeof fetch` in Bun also demands `preconnect`, which a mock lacks. */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** "api" has no site of its own in @repo/sites; group its events under the app's site instead. */
function siteApp(source: string): string {
  return source === "api" ? "app" : source
}

/**
 * Forwards a pageview or product event to Plausible's event endpoint over plain fetch. Plausible's
 * `/api/event` requires a `url` on every hit: a pageview always carries its own app and path, so
 * the url is `siteUrl(app) + path`; a product event carries `source` instead (the reporting app,
 * or "api" for a server-recorded one) and no path of its own, so it is attributed to
 * `siteUrl(siteApp(source)) + "/"` — the api's own events group under the app's site, since "api"
 * is not a routed app in @repo/sites. An event's `props` go through as Plausible's custom props.
 *
 * Two accepted limitations, deliberately not worked around:
 * - **No dedup key.** Unlike PostHog's `uuid` (see posthog.ts), Plausible's event API has no
 *   idempotency key, so a retried forward (a 5xx/429/timeout that eventually succeeds) can be
 *   double-counted on Plausible's side. The first-party `analytics_daily` tables never
 *   double-count — the insert this row came from already committed exactly once — so they remain
 *   the source of truth; Plausible is a secondary, best-effort mirror.
 * - **The user agent is the api's own placeholder** (`boilerplate-bun analytics`), never a faked
 *   browser one. Plausible may therefore classify a server-sent hit as a bot and silently drop it
 *   (its bot filtering is undocumented and not something this provider can see the outcome of).
 *   That is fine: the first-party tables already counted it before this request was ever made: a
 *   hit missing from Plausible is not a hit missing from this api's own dashboard.
 */
export function plausibleProvider(options: {
  host: string
  domain: string
  siteUrl: (app: string) => string
  fetch?: FetchLike
  timeoutMs?: number
  log: Log
}): AnalyticsProvider {
  const f = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const endpoint = `${options.host.replace(/\/+$/, "")}/api/event`
  return {
    kind: "plausible",
    async forward(item) {
      const body: Record<string, unknown> =
        item.kind === "pageview"
          ? {
              domain: options.domain,
              name: "pageview",
              url: options.siteUrl(item.app) + item.path,
            }
          : {
              domain: options.domain,
              name: item.name,
              url: `${options.siteUrl(siteApp(item.source))}/`,
              props: item.props,
            }
      if (item.kind === "pageview" && item.referrerHost) {
        body.referrer = `https://${item.referrerHost}`
      }
      let res: Response
      try {
        res = await f(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "boilerplate-bun analytics",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        // Plausible never saw it (network error, timeout): retry.
        throw error instanceof Error ? error : new Error(String(error))
      }
      if (res.ok) return
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`plausible answered ${res.status}`)
      }
      options.log(`plausible answered ${res.status}`, undefined)
    },
  }
}
