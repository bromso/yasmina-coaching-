import type { AnalyticsProvider, ForwardItem } from "./provider"

type Log = (message: string, error: unknown) => void
/** Fetch-shaped, structurally: `typeof fetch` in Bun also demands `preconnect`, which a mock lacks. */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/**
 * `user:<id>` when the row has a user, else `workspace:<id>` (a webhook's `plan_changed` has a
 * workspace and no user), else `visitor:<visitorId>`, else null: the shared "anonymous" id, sent
 * with `$process_person_profile: false` so PostHog never builds one person out of everyone.
 */
function distinctIdFor(item: ForwardItem): string | null {
  if (item.userId !== null) return `user:${item.userId}`
  if (item.workspaceId !== null) return `workspace:${item.workspaceId}`
  if (item.visitorId !== null) return `visitor:${item.visitorId}`
  return null
}

/**
 * Forwards one pageview or event to PostHog's capture endpoint over plain fetch. A pageview
 * becomes `$pageview` with `$current_url` built from the app's site url and the (already
 * collapsed) path; an event keeps its name and props as-is. `$ip` is always explicitly null,
 * `$geoip_disable` always true (otherwise PostHog would geolocate the api server's own ip onto
 * every person it never actually saw), and no user agent is ever sent — the row itself never
 * carried either. `uuid` is sent as PostHog's own dedup key: it comes from the row's stored job
 * payload, so a redelivered forward (a 5xx/429/timeout that eventually succeeds) resends the same
 * id and PostHog drops the duplicate instead of double-counting it.
 */
export function posthogProvider(options: {
  host: string
  apiKey: string
  siteUrl: (app: string) => string
  fetch?: FetchLike
  timeoutMs?: number
  log: Log
}): AnalyticsProvider {
  const f = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const endpoint = `${options.host.replace(/\/+$/, "")}/i/v0/e/`
  return {
    kind: "posthog",
    async forward(item) {
      const event = item.kind === "pageview" ? "$pageview" : item.name
      const distinctId = distinctIdFor(item)
      const properties: Record<string, unknown> =
        item.kind === "pageview"
          ? { $current_url: options.siteUrl(item.app) + item.path, $ip: null, $geoip_disable: true }
          : { ...item.props, $ip: null, $geoip_disable: true }
      if (distinctId === null) properties.$process_person_profile = false
      let res: Response
      try {
        res = await f(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: options.apiKey,
            event,
            distinct_id: distinctId ?? "anonymous",
            properties,
            timestamp: item.at,
            uuid: item.uuid,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        // PostHog never saw it (network error, timeout): retry.
        throw error instanceof Error ? error : new Error(String(error))
      }
      if (res.ok) return
      if (res.status === 429 || res.status >= 500) throw new Error(`posthog answered ${res.status}`)
      options.log(`posthog answered ${res.status}`, undefined)
    },
  }
}
