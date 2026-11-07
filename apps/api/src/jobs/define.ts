import type { z } from "zod"
import type { AnalyticsProvider } from "../analytics/providers/provider"
import type { BillingProvider } from "../billing/provider"
import type { Db } from "../db"
import type { Mailer } from "../mail/mailer"
import type { Broadcaster } from "../realtime/broadcaster"
import type { Storage } from "../storage/storage"
import type { TelemetryProvider } from "../telemetry/provider"
import type { WebhookFetch } from "../webhooks/deliver"
import type { Resolver } from "../webhooks/ssrf"
import { parseCron } from "./cron"
import type { Enqueue } from "./enqueue"

/** Same shape as `Context.log` / `Context.recordFailure` in router.ts. */
export type Log = (message: string, error: unknown) => void

export type JobContext = {
  db: Db
  mailer: Mailer
  storage: Storage
  log: Log
  /** For a detached failure inside the job: logs it and records it as a telemetry `server` row. */
  recordFailure: (message: string, error: unknown) => void
  /**
   * The realtime bus, for a job that writes a notification (`notifyUser` publishes on the user's
   * channel once it commits). The api's own in-process worker shares the api's; a dedicated
   * worker builds its own — on Postgres that reaches every api replica's subscribers, on SQLite
   * (an in-process bus) it reaches none, so the badge there updates on the next page load.
   */
  broadcaster: Broadcaster
  telemetry: TelemetryProvider
  /** ANALYTICS_RETENTION_DAYS: how long `analytics.prune` keeps raw pageview/event rows. */
  analyticsRetentionDays: number
  /** BACKUP_RETENTION_DAYS: how long `backup.run` keeps its own objects under `backups/`. */
  backupRetentionDays: number
  /** AUDIT_PII_RETENTION_DAYS: how long `audit.prune` keeps a row's ip/user_agent. */
  auditPiiRetentionDays: number
  /** AUDIT_RETENTION_DAYS: how long `audit.prune` keeps the whole row. */
  auditRetentionDays: number
  /** Where new pageviews/events also go besides the tables (store = nowhere else). */
  analytics: AnalyticsProvider
  /** Base URL of the account app (ACCOUNT_URL), for links in mail a job sends on its own. */
  accountUrl: string
  /** STORAGE_PUBLIC_URL, or null when images are served from each app's `/files/<key>`. */
  storagePublicUrl: string | null
  /**
   * The billing provider: `privacy.purge` cancels a deleted user's workspace subscriptions;
   * `webhook.deliver` reads entitlements (`kind`) to re-check the `api` feature.
   */
  billing: Pick<BillingProvider, "cancelSubscription" | "kind">
  /** TWO_FACTOR_ENCRYPTION_KEY: opens a webhook endpoint's stored signing secret. */
  twoFactorKey: string
  /** The webhook SSRF guard's DNS, run again before every delivery attempt. */
  webhookResolve: Resolver
  /** WEBHOOK_ALLOW_LOCALHOST_HTTP: webhooks to `http`/`https` on `*.localhost` (dialled at loopback). */
  webhookAllowLocalhostHttp: boolean
  /** The fetch a webhook delivery dials with; defaults to Bun's. A test injects its own. */
  webhookFetch?: WebhookFetch
  /**
   * Puts a job on the queue and nudges the worker. `analytics.event`'s own run uses this to
   * enqueue `analytics.forward` after its insert commits — never the other way around, so a
   * transient enqueue failure (caught by the caller) cannot turn into a duplicate insert on retry.
   */
  enqueue: Enqueue
  /** Aborts when the worker (Task 2) times this attempt out at `timeoutMs`. */
  signal: AbortSignal
  /** The attempt this run is (1 on the first try). */
  attempt: number
  /**
   * The row's own `max_attempts` (fixed at enqueue time): `attempt === maxAttempts` is the last
   * try, even for a job queued before a deploy changed its definition's `maxAttempts`.
   */
  maxAttempts: number
  /** The worker's clock (tests inject their own): use this, never `new Date()`, for a job's own time-based logic (age checks, retention cutoffs). */
  now: () => Date
}

export type JobDefinition<P> = {
  name: string
  payload: z.ZodType<P>
  maxAttempts: number
  timeoutMs: number
  run: (payload: P, ctx: JobContext) => Promise<void>
}

const DEFAULT_MAX_ATTEMPTS = 5
/** A job's `timeoutMs` unless it sets its own (exported for `audit.prune`'s budget). */
export const DEFAULT_TIMEOUT_MS = 60_000

/** Fills in the shared defaults (`maxAttempts` 5, `timeoutMs` 60 000) for a job definition. */
export function defineJob<P>(def: {
  name: string
  payload: z.ZodType<P>
  maxAttempts?: number
  timeoutMs?: number
  run: JobDefinition<P>["run"]
}): JobDefinition<P> {
  return {
    name: def.name,
    payload: def.payload,
    maxAttempts: def.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    timeoutMs: def.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    run: def.run,
  }
}

export type ScheduleDefinition = {
  name: string
  cron: string
  // biome-ignore lint/suspicious/noExplicitAny: each schedule pairs its own job and payload type; a single field type cannot express that without erasing it.
  job: JobDefinition<any>
  payload: unknown
  /**
   * Checked by the scheduler on every tick (never cached at import time): a schedule behind a
   * flag (`backup.run`'s `BACKUP_ENABLED`, `storage.sweep`'s `STORAGE_SWEEP_ENABLED`) reads it here
   * instead of being left out of the list outright, and a test can set it after import. A running
   * process's env does not change from outside, so in production a toggle still means a restart.
   * Omitted means always enabled.
   */
  enabled?: () => boolean
}

/** Registers a cron schedule. Parses `cron` eagerly, so a bad expression fails at import time. */
export function defineSchedule(def: ScheduleDefinition): ScheduleDefinition {
  parseCron(def.cron)
  return def
}
