import { ANALYTICS_EVENT_NAMES, type AnalyticsEventName } from "@repo/api-contract/analytics"
import { z } from "zod"
import type { ForwardItem } from "../../analytics/providers/provider"
import { defineJob } from "../define"

/** A day in milliseconds — the one definition every UTC-day calculation here, in `admin.analytics.summary` and in their tests shares. */
export const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD`, in UTC — the one definition `admin.analytics.summary` and its tests import, rather than each keeping its own copy. */
export const dayOf = (iso: string) => iso.slice(0, 10)

/** Yesterday's day string (UTC) relative to `now`: the newest day `analytics.rollup` rebuilds by default. */
export function yesterday(now: Date): string {
  return dayOf(new Date(now.getTime() - DAY_MS).toISOString())
}

export type AnalyticsEventPayload = {
  name: AnalyticsEventName
  userId: number | null
  workspaceId: number | null
  props: Record<string, unknown>
  /** ISO timestamp of the event itself (when `recordEvent` was called), not of the job run. */
  at: string
}

const eventPayload: z.ZodType<AnalyticsEventPayload> = z.object({
  name: z.enum(ANALYTICS_EVENT_NAMES as [AnalyticsEventName, ...AnalyticsEventName[]]),
  userId: z.number().int().positive().nullable(),
  workspaceId: z.number().int().positive().nullable(),
  props: z.record(z.string(), z.unknown()),
  at: z.string(),
})

const forwardItemSchema: z.ZodType<ForwardItem> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pageview"),
    app: z.string(),
    path: z.string(),
    referrerHost: z.string().nullable(),
    visitorId: z.string().nullable(),
    userId: z.number().int().positive().nullable(),
    workspaceId: z.number().int().positive().nullable(),
    at: z.string(),
    uuid: z.string(),
  }),
  z.object({
    kind: z.literal("event"),
    name: z.string(),
    source: z.string(),
    props: z.record(z.string(), z.unknown()),
    visitorId: z.string().nullable(),
    userId: z.number().int().positive().nullable(),
    workspaceId: z.number().int().positive().nullable(),
    at: z.string(),
    uuid: z.string(),
  }),
])

/**
 * Forwards one pageview or event to the configured provider (PostHog, Plausible). Enqueued by
 * `analytics.ingest` (apps/api/src/router.ts) and by `analytics.event`'s own run below, only when
 * the provider is not the keyless `store` — a `store` provider's `forward` is a no-op, so there is
 * nothing to queue for the common case of no provider configured. A provider that throws (a bad
 * response, a timeout it does not swallow itself) retries like any other job and eventually dies,
 * recorded through `recordFailure`.
 */
export const analyticsForwardJob = defineJob<ForwardItem>({
  name: "analytics.forward",
  payload: forwardItemSchema,
  run: async (item, ctx) => {
    await ctx.analytics.forward(item)
  },
})

/**
 * Writes one product event row: `source` "api" (never forgeable by a client), no `visitor_id`.
 * `recordEvent` (apps/api/src/analytics/record.ts) is the only enqueuer — every instrumented
 * procedure goes through it, never this job's name directly.
 */
export const analyticsEventJob = defineJob<AnalyticsEventPayload>({
  name: "analytics.event",
  payload: eventPayload,
  run: async (job, ctx) => {
    await ctx.db.analytics.insertEvent({
      name: job.name,
      source: "api",
      props: job.props,
      visitorId: null,
      userId: job.userId,
      workspaceId: job.workspaceId,
      day: dayOf(job.at),
      createdAt: job.at,
    })
    // The row is already committed: a failure to enqueue its forward (a database hiccup) must
    // not fail — let alone retry, which would re-run the insert above — this job. This one
    // event's forward is lost (nothing else enqueues it), which is better than a duplicate row.
    if (ctx.analytics.kind !== "store") {
      try {
        await ctx.enqueue(analyticsForwardJob, {
          kind: "event",
          name: job.name,
          source: "api",
          props: job.props,
          visitorId: null,
          userId: job.userId,
          workspaceId: job.workspaceId,
          at: job.at,
          uuid: crypto.randomUUID(),
        })
      } catch (error) {
        ctx.recordFailure("analytics.forward enqueue failed", error)
      }
    }
  },
})

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type AnalyticsRollupPayload = { day?: string }

/**
 * The days the scheduled rollup (no `day` in its payload) rebuilds: yesterday and the day before
 * (UTC), oldest first. An event job still queued (or retrying) at 00:10 lands its row on
 * yesterday after yesterday's first rollup; the next night's run rebuilds that day again as its
 * D-2, so the late row reaches `analytics_daily` instead of being lost to the dashboard.
 */
export function rollupDays(now: Date): [string, string] {
  return [yesterday(new Date(now.getTime() - DAY_MS)), yesterday(now)]
}

/**
 * Rebuilds `analytics_daily` from the raw pageview and event tables: for the given `day` alone
 * when the payload names one (a manual re-run), else for yesterday and the day before
 * (`rollupDays`). Each day's rebuild is idempotent, so a redelivery or a manual re-run always
 * lands on the same rows; a day with no raw rows left (past retention) keeps its rows untouched.
 */
export const analyticsRollupJob = defineJob<AnalyticsRollupPayload>({
  name: "analytics.rollup",
  payload: z.object({ day: z.string().regex(DAY_PATTERN).optional() }),
  run: async (job, ctx) => {
    const days = job.day ? [job.day] : rollupDays(ctx.now())
    for (const day of days) await ctx.db.analytics.rollup(day)
  },
})

/**
 * Deletes raw `analytics_pageviews` / `analytics_events` rows past `analyticsRetentionDays` and
 * `analytics_daily_salts` rows older than today (a salt is never read back once its day is gone —
 * see `analyticsQueries.saltFor`). The cutoff is floored at the oldest day `rollupDays` still
 * rebuilds (yesterday and the day before), so a short `analyticsRetentionDays` can never delete a
 * day the nightly rollup has not rebuilt yet. `analytics_daily`, the rollup's own output, is kept
 * forever.
 */
export const analyticsPruneJob = defineJob<Record<string, never>>({
  name: "analytics.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const now = ctx.now()
    const today = dayOf(now.toISOString())
    const retentionCutoff = dayOf(
      new Date(now.getTime() - ctx.analyticsRetentionDays * DAY_MS).toISOString()
    )
    // Never prune the days the nightly rollup rebuilds (yesterday and the day before): with a
    // short retention the cutoff would otherwise reach a day whose rollup has not run yet.
    const [oldestRolled] = rollupDays(now)
    // biome-ignore lint/complexity/useMathMinMax: these are YYYY-MM-DD strings; Math.min would give NaN
    const before = retentionCutoff < oldestRolled ? retentionCutoff : oldestRolled
    const result = await ctx.db.analytics.prune(before, today)
    ctx.log(
      `analytics.prune: ${result.pageviews} pageview(s), ${result.events} event(s), ${result.salts} salt(s)`,
      undefined
    )
  },
})
