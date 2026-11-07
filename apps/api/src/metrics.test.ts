import { afterEach, describe, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createMemoryRateLimiter, metricsRoute } from "@repo/service-kit"
import { z } from "zod"
import { storeAnalyticsProvider } from "./analytics/providers/provider"
import { backupRunJob } from "./jobs/builtin/backup"
import { defineJob } from "./jobs/define"
import { createEnqueue } from "./jobs/enqueue"
import { createWorker } from "./jobs/worker"
import { capLimiterLabel, createWorkerMetrics, statusClass } from "./metrics"
import { memoryBroadcaster } from "./realtime/memory"
import { localStorage } from "./storage/local"
import { storeProvider } from "./telemetry/store"
import { auth, captureMailer, clientFor, signUpWithWorkspace, start } from "./test-server"

const METRICS_TOKEN = "metrics-token-0123456789abcdef"
const bearer = { authorization: `Bearer ${METRICS_TOKEN}` }

type App = Awaited<ReturnType<typeof start>>
const apps: App[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.stop()
})

async function boot(overrides: Parameters<typeof start>[0] = {}) {
  const app = await start({ metricsToken: METRICS_TOKEN, ...overrides })
  apps.push(app)
  return app
}

async function scrape(app: App) {
  const res = await fetch(new URL("/metrics", app.server.url), { headers: bearer })
  expect(res.status).toBe(200)
  return res.text()
}

/** The value of the sample line `name{labels}` exactly, or undefined. */
function sample(body: string, series: string): number | undefined {
  const line = body.split("\n").find((l) => l.startsWith(`${series} `))
  return line === undefined ? undefined : Number(line.slice(series.length + 1))
}

describe("api /metrics", () => {
  test("404 when METRICS_TOKEN is unset", async () => {
    const app = await boot({ metricsToken: undefined })
    const res = await fetch(new URL("/metrics", app.server.url), { headers: bearer })
    expect(res.status).toBe(404)
  })

  test("401 without the token or with the service token", async () => {
    const app = await boot()
    const url = new URL("/metrics", app.server.url)
    expect((await fetch(url)).status).toBe(401)
    expect((await fetch(url, { headers: auth })).status).toBe(401)
  })

  test("200 with the exposition: requests, latency, process and build gauges", async () => {
    const app = await boot()
    await fetch(new URL("/rpc/auth/providers", app.server.url), { method: "POST", headers: auth })
    const res = await fetch(new URL("/metrics", app.server.url), { headers: bearer })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8")
    const body = await res.text()
    expect(body).toContain("# TYPE http_requests_total counter")
    expect(body).toContain("http_request_duration_seconds_bucket{")
    expect(body).toContain('le="0.005"')
    expect(body).toContain('le="10"')
    expect(body).toMatch(/^process_resident_memory_bytes \d+/m)
    expect(body).toMatch(/^process_uptime_seconds [\d.]+/m)
    expect(body).toMatch(/^build_info\{version="0\.1\.0",commit="[^"]+"\} 1$/m)
    expect(body).toMatch(/^realtime_streams_open 0$/m)
    expect(body).toMatch(/^db_ping_seconds [\d.e-]+$/m)
  })

  test("one notes.list call counts once under its procedure and 2xx", async () => {
    const app = await boot()
    const { client, workspaceId } = await signUpWithWorkspace(app)
    await client.notes.list({ workspaceId })
    const body = await scrape(app)
    expect(
      sample(body, 'http_requests_total{route="/rpc/notes/list",method="POST",status_class="2xx"}')
    ).toBe(1)
  })

  test("a REST path with an id is counted under its root, never the raw id", async () => {
    const app = await boot()
    await fetch(new URL("/openapi/admin/users/123", app.server.url), { headers: auth })
    await fetch(new URL("/rpc/made/up/987654", app.server.url), { method: "POST", headers: auth })
    const body = await scrape(app)
    expect(body).toContain('route="openapi:admin",method="GET"')
    expect(body).toContain('http_requests_total{route="other",method="POST",status_class="4xx"} 1')
    expect(body).not.toContain("users/123")
    expect(body).not.toContain("987654")
  })

  test("/metrics itself is neither counted nor access-logged", async () => {
    const lines: string[] = []
    const app = await boot({ logWrite: (line) => void lines.push(line) })
    await scrape(app)
    const body = await scrape(app)
    expect(body).not.toContain("http_requests_total")
    expect(lines.filter((line) => line.includes('"request"') || line.includes("request "))).toEqual(
      []
    )
  })

  test("refusals count by limiter: the global api limiter and a named cap", async () => {
    const app = await boot({
      rateLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
      signUpLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    const anonymous = clientFor(app)
    await anonymous.auth.signUp({ email: "a@example.com", password: "correct horse battery" })
    await anonymous.auth
      .signUp({ email: "b@example.com", password: "correct horse battery" })
      .catch(() => {})
    const ping = () =>
      fetch(new URL("/rpc/auth/providers", app.server.url), {
        method: "POST",
        headers: { ...auth, "x-api-client-id": "test-client" },
      })
    await ping()
    // The fourth call from this client id is over the api limiter's budget of 3.
    expect((await ping()).status).toBe(429)
    const body = await scrape(app)
    expect(sample(body, 'rate_limit_refusals_total{limiter="signup:global"}')).toBe(1)
    expect(sample(body, 'rate_limit_refusals_total{limiter="api"}')).toBe(1)
  })

  test("the in-process worker's job metrics ride on the api's /metrics", async () => {
    // A fixed clock half a minute past a boundary: the scheduler's first tick is 30 s away.
    const app = await boot({
      jobsWorker: true,
      jobsPollMs: 60_000,
      now: () => new Date("2026-10-15T12:00:30.000Z"),
    })
    await signUpWithWorkspace(app)
    await app.drain()
    const counts = await app.db.jobs.counts()
    const body = await scrape(app)
    expect(sample(body, 'jobs_queue{status="queued"}')).toBe(counts.queued)
    expect(sample(body, 'job_runs_total{name="mail.send",outcome="succeeded"}')).toBeGreaterThan(0)
    expect(body).toContain('job_duration_seconds_bucket{name="mail.send",le="+Inf"}')
  })

  test("with JOBS_WORKER off the api leaves the job metrics to the dedicated worker", async () => {
    const app = await boot()
    const body = await scrape(app)
    expect(body).not.toContain("jobs_queue")
  })
})

describe("worker /metrics", () => {
  test("queue gauge, outcomes by name (succeeded, retried, dead) and unknown names as other", async () => {
    const app = await boot()
    const db = app.db
    const ok = defineJob({ name: "t.ok", payload: z.object({}), run: async () => {} })
    const flaky = defineJob({
      name: "t.fail",
      payload: z.object({}),
      maxAttempts: 2,
      run: async () => {
        throw new Error("boom")
      },
    })
    const metrics = createWorkerMetrics({ db, knownJobs: new Set(["t.ok", "t.fail"]) })
    const worker = createWorker({
      db,
      context: {
        db,
        mailer: captureMailer(),
        storage: localStorage(join(tmpdir(), "metrics-test-unused")),
        log: () => {},
        recordFailure: () => {},
        telemetry: storeProvider,
        analyticsRetentionDays: 90,
        backupRetentionDays: 14,
        broadcaster: memoryBroadcaster(() => {}),
        auditPiiRetentionDays: 90,
        auditRetentionDays: 365,
        accountUrl: "http://account.example.com",
        storagePublicUrl: null,
        billing: { kind: "mock" as const, cancelSubscription: async () => {} },
        twoFactorKey: "unused",
        webhookResolve: async () => [],
        webhookAllowLocalhostHttp: false,
        analytics: storeAnalyticsProvider,
        enqueue: async () => 0,
      },
      jobs: [ok, flaky],
      schedules: [],
      concurrency: 2,
      pollMs: 60_000,
      log: () => {},
      recordFailure: () => {},
      metrics,
    })
    const enqueue = createEnqueue({ db, nudge: () => {} })
    await enqueue(ok, {})
    await enqueue(flaky, {})
    await db.jobs.insert({
      name: "ghost.job",
      payload: "{}",
      maxAttempts: 1,
      runAt: new Date(0).toISOString(),
      createdAt: new Date(0).toISOString(),
    })
    const route = metricsRoute(metrics.registry, METRICS_TOKEN)
    const render = async () =>
      (await route(new Request("http://w/metrics", { headers: bearer }))).text()

    const before = await render()
    expect(sample(before, 'jobs_queue{status="queued"}')).toBe((await db.jobs.counts()).queued)
    expect(sample(before, 'jobs_queue{status="queued"}')).toBe(3)

    await worker.drain()
    const after = await render()
    expect(sample(after, 'job_runs_total{name="t.ok",outcome="succeeded"}')).toBe(1)
    expect(sample(after, 'job_runs_total{name="t.fail",outcome="retried"}')).toBe(1)
    expect(sample(after, 'job_runs_total{name="other",outcome="dead"}')).toBe(1)
    expect(after).not.toContain("ghost.job")
    expect(after).toContain('job_duration_seconds_count{name="t.ok"} 1')
    expect(sample(after, 'jobs_queue{status="queued"}')).toBe((await db.jobs.counts()).queued)
    expect(after).toMatch(/^build_info\{version="0\.1\.0",commit="[^"]+"\} 1$/m)
    expect(after).toMatch(/^process_resident_memory_bytes \d+/m)
  })

  test("404 unset, 401 wrong", async () => {
    const app = await boot()
    const { registry } = createWorkerMetrics({ db: app.db })
    const req = new Request("http://w/metrics", { headers: { authorization: "Bearer nope" } })
    expect((await metricsRoute(registry, undefined)(req)).status).toBe(404)
    expect((await metricsRoute(registry, METRICS_TOKEN)(req)).status).toBe(401)
  })

  test("backup_last_success_timestamp_seconds: unset until backup.run succeeds", async () => {
    const app = await boot()
    const db = app.db
    const at = new Date("2026-10-06T02:00:00Z")
    const metrics = createWorkerMetrics({ db })
    const worker = createWorker({
      db,
      context: {
        db,
        mailer: captureMailer(),
        storage: localStorage(join(tmpdir(), "metrics-test-backup-unused")),
        log: () => {},
        recordFailure: () => {},
        telemetry: storeProvider,
        analyticsRetentionDays: 90,
        backupRetentionDays: 14,
        broadcaster: memoryBroadcaster(() => {}),
        auditPiiRetentionDays: 90,
        auditRetentionDays: 365,
        accountUrl: "http://account.example.com",
        storagePublicUrl: null,
        billing: { kind: "mock" as const, cancelSubscription: async () => {} },
        twoFactorKey: "unused",
        webhookResolve: async () => [],
        webhookAllowLocalhostHttp: false,
        analytics: storeAnalyticsProvider,
        enqueue: async () => 0,
      },
      jobs: [backupRunJob],
      schedules: [],
      concurrency: 1,
      pollMs: 60_000,
      now: () => at,
      log: () => {},
      recordFailure: () => {},
      metrics,
    })
    const enqueue = createEnqueue({ db, now: () => at, nudge: () => {} })

    expect(await metrics.registry.render()).not.toContain("backup_last_success_timestamp_seconds")
    await enqueue(backupRunJob, {})
    await worker.drain()
    const body = await metrics.registry.render()
    expect(body).toMatch(
      new RegExp(`^backup_last_success_timestamp_seconds ${at.getTime() / 1000}$`, "m")
    )
  })

  test("scheduler lag never goes negative", async () => {
    const app = await boot()
    const metrics = createWorkerMetrics({ db: app.db })
    metrics.schedulerLag(-1)
    expect(await metrics.registry.render()).toMatch(/^scheduler_lag_seconds 0$/m)
    metrics.schedulerLag(2.5)
    expect(await metrics.registry.render()).toMatch(/^scheduler_lag_seconds 2\.5$/m)
  })
})

describe("labels", () => {
  test("status classes", () => {
    expect(statusClass(200)).toBe("2xx")
    expect(statusClass(304)).toBe("3xx")
    expect(statusClass(429)).toBe("4xx")
    expect(statusClass(503)).toBe("5xx")
    expect(statusClass(0)).toBe("5xx")
  })

  test("per-app caps lose their app", () => {
    expect(capLimiterLabel("telemetry:app:www")).toBe("telemetry:app")
    expect(capLimiterLabel("analytics-app:docs")).toBe("analytics:app")
    expect(capLimiterLabel("signup:global")).toBe("signup:global")
  })
})
