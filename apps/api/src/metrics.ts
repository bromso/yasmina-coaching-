import { createRegistry, DEFAULT_BUCKETS, type Registry } from "@repo/service-kit"
import pkg from "../package.json" with { type: "json" }
import type { Db } from "./db"
import { JOBS } from "./jobs/registry"

export type JobOutcome = "succeeded" | "retried" | "dead"

export type BuildInfo = { version: string; commit: string }

/** `build_info`'s labels: the api's package version, and `GIT_COMMIT` (or "unknown"). */
export function buildInfo(env: Record<string, string | undefined> = Bun.env): BuildInfo {
  return { version: pkg.version, commit: env.GIT_COMMIT?.trim() || "unknown" }
}

/** `200` → `"2xx"`; anything outside 100–599 is folded into `"5xx"` so the label stays bounded. */
export function statusClass(status: number): string {
  const hundreds = Math.floor(status / 100)
  return hundreds >= 1 && hundreds <= 5 ? `${hundreds}xx` : "5xx"
}

/** The process gauges both services expose, plus `build_info`. */
function processMetrics(registry: Registry, build: BuildInfo) {
  registry.gauge(
    "process_resident_memory_bytes",
    "Resident memory size in bytes.",
    [],
    () => process.memoryUsage().rss
  )
  registry.gauge("process_uptime_seconds", "Seconds since the process started.", [], () =>
    process.uptime()
  )
  registry.gauge("build_info", "The running build; always 1.", ["version", "commit"], () => [
    { labels: { version: build.version, commit: build.commit }, value: 1 },
  ])
}

const KNOWN_JOBS = new Set(JOBS.map((job) => job.name))

/**
 * The job metrics, on `registry`: `jobs_queue{status}` (read from the database on scrape),
 * `job_runs_total{name,outcome}`, `job_duration_seconds{name}` and `scheduler_lag_seconds`. A job
 * name the registry does not define (a row written by newer code) is labelled `"other"`.
 */
export function registerJobMetrics(registry: Registry, db: Db, knownJobs = KNOWN_JOBS) {
  registry.gauge("jobs_queue", "Jobs in the queue by status.", ["status"], async () => {
    const counts = await db.jobs.counts()
    return (["queued", "running", "dead"] as const).map((status) => ({
      labels: { status },
      value: counts[status],
    }))
  })
  const runs = registry.counter("job_runs_total", "Job runs by outcome.", ["name", "outcome"])
  const duration = registry.histogram(
    "job_duration_seconds",
    "How long a job run took.",
    ["name"],
    [...DEFAULT_BUCKETS, 30, 60]
  )
  const lag = registry.gauge(
    "scheduler_lag_seconds",
    "How late the scheduler's last minute tick fired."
  )
  // Read fresh from the jobs table on every scrape, like `jobs_queue` above: no value until
  // backup.run has ever succeeded (BACKUP_ENABLED is off by default), so nothing is exposed then.
  registry.gauge(
    "backup_last_success_timestamp_seconds",
    "Unix timestamp of the last successful backup.run job.",
    [],
    async () => {
      const at = await db.jobs.lastSucceededAt("backup.run")
      return at ? [{ labels: {}, value: at.getTime() / 1000 }] : []
    }
  )
  return {
    /** One finished attempt; `seconds` is omitted when the job never ran (killed before it). */
    jobOutcome(name: string, outcome: JobOutcome, seconds?: number) {
      const label = knownJobs.has(name) ? name : "other"
      runs.inc({ name: label, outcome })
      if (seconds !== undefined) duration.observe({ name: label }, seconds)
    },
    schedulerLag(seconds: number) {
      lag.set({}, Math.max(0, seconds))
    },
  }
}

export type JobMetrics = ReturnType<typeof registerJobMetrics>

/** The dedicated worker's registry: the job metrics plus the process gauges. */
export function createWorkerMetrics({
  db,
  build = buildInfo(),
  knownJobs,
}: {
  db: Db
  build?: BuildInfo
  knownJobs?: Set<string>
}) {
  const registry = createRegistry()
  const jobs = registerJobMetrics(registry, db, knownJobs)
  processMetrics(registry, build)
  return { registry, ...jobs }
}

/**
 * The api's registry. `route` is always a bounded label (see `apiRouteOf`); `limiter` is one of
 * a fixed set of names (`api`, or a cap's key with any per-app suffix dropped, see
 * `capLimiterLabel`).
 */
export function createApiMetrics({
  db,
  streams,
  build = buildInfo(),
}: {
  db: Db
  streams: { openCount(): number }
  build?: BuildInfo
}) {
  const registry = createRegistry()
  const requests = registry.counter("http_requests_total", "HTTP requests answered.", [
    "route",
    "method",
    "status_class",
  ])
  const duration = registry.histogram(
    "http_request_duration_seconds",
    "Time to the response's headers.",
    ["route", "method"],
    [...DEFAULT_BUCKETS]
  )
  const refusals = registry.counter(
    "rate_limit_refusals_total",
    "Requests refused by a rate limiter.",
    ["limiter"]
  )
  registry.gauge("realtime_streams_open", "Open realtime event streams.", [], () =>
    streams.openCount()
  )
  registry.gauge(
    "db_ping_seconds",
    "How long a database ping took, sampled on scrape.",
    [],
    async () => {
      const started = performance.now()
      await db.ping()
      return (performance.now() - started) / 1000
    }
  )
  processMetrics(registry, build)
  return {
    registry,
    record(route: string, method: string, status: number, seconds: number) {
      requests.inc({ route, method, status_class: statusClass(status) })
      duration.observe({ route, method }, seconds)
    },
    limiterRefusal(limiter: string) {
      refusals.inc({ limiter })
    },
  }
}

export type ApiMetrics = ReturnType<typeof createApiMetrics>

/**
 * A tripped cap's key as a `limiter` label: the per-app caps (`telemetry:app:<app>`,
 * `analytics-app:<app>`) lose their app so the label set stays fixed; the rest are already fixed
 * names (`signup:global`, `reset:global`, …).
 */
export function capLimiterLabel(key: string): string {
  if (key.startsWith("telemetry:app:")) return "telemetry:app"
  if (key.startsWith("analytics-app:")) return "analytics:app"
  return key
}
