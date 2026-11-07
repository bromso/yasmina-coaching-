/**
 * What `analytics.forward` (jobs/builtin/analytics.ts) hands to the provider: either a pageview
 * (carries its own app and path) or a product event (`source` instead: the reporting app, or
 * "api" for a server-recorded one — an account action, not page-scoped, so no path). Never an ip
 * or user agent: `shapeIngest` / `recordEvent` already discard them before anything is stored,
 * and this is a second place that could not leak them even if it wanted to.
 *
 * `uuid` is generated once, when the forward job is enqueued (never here), and is part of that
 * job's stored payload — so a retried delivery (a 5xx/429/timeout that eventually succeeds) always
 * resends the same id. PostHog dedups on it; Plausible has no such key (see plausible.ts).
 */
export type ForwardItem =
  | {
      kind: "pageview"
      app: string
      path: string
      referrerHost: string | null
      visitorId: string | null
      userId: number | null
      /** Only PostHog's `distinct_id` reads it (a row with no user); never sent as a property. */
      workspaceId: number | null
      at: string
      uuid: string
    }
  | {
      kind: "event"
      name: string
      source: string
      props: Record<string, unknown>
      visitorId: string | null
      userId: number | null
      /** Only PostHog's `distinct_id` reads it (a row with no user); never sent as a property. */
      workspaceId: number | null
      at: string
      uuid: string
    }

/** Where a pageview or event also goes besides the tables. `store` is the keyless default. */
export type AnalyticsProvider = {
  kind: "store" | "posthog" | "plausible"
  /**
   * Called once per pageview or event, from the `analytics.forward` job (never detached from the
   * ingest request or the event job's insert directly — see `apps/api/src/analytics/ingest.ts`
   * and `apps/api/src/jobs/builtin/analytics.ts`). Throw for a failure the job should retry (a
   * transient one: the provider unreachable, overloaded, or rate-limiting); the job retries with
   * backoff and eventually dies, recorded through `recordFailure`. Return normally (log, don't
   * throw) for a failure retrying would just repeat (a permanent one, e.g. a 4xx from the
   * provider).
   */
  forward(item: ForwardItem): Promise<void>
}

/** The default: the tables are the only record, nothing is forwarded. */
export const storeAnalyticsProvider: AnalyticsProvider = {
  kind: "store",
  forward: async () => {},
}
