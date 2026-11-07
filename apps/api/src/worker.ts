// A dedicated job worker: the queue's worker and scheduler, no api. Run it as `bun src/worker.ts`
// (with JOBS_WORKER=false on the api processes, so they only enqueue). It serves `/health` on
// HOST:PORT for the container's health check: 200 while the database answers, 503 when it does
// not, or not within READY_TIMEOUT_MS (or once shutdown began); and `/metrics` (job metrics,
// behind METRICS_TOKEN, 404 unset).
import { createLogger } from "@repo/log"
import { createLifecycle, errorResponse, metricsRoute, readyRoute } from "@repo/service-kit"
import { siteUrl } from "@repo/sites"
import { createAnalyticsProvider } from "./analytics/providers/create-provider"
import { createBillingFactory } from "./billing/create-provider"
import { createDb } from "./db"
import { loadEnv } from "./env"
import { createEnqueue } from "./jobs/enqueue"
import { createWorker, webhookNameLimits } from "./jobs/worker"
import { createMailer } from "./mail/create-mailer"
import { createWorkerMetrics } from "./metrics"
import { createBroadcaster } from "./realtime/create-broadcaster"
import { legacyLog } from "./request-context"
import { createStorage } from "./storage/create-storage"
import { createTelemetryProvider } from "./telemetry/create-provider"
import { recordServerError } from "./telemetry/record"
import { systemResolver } from "./webhooks/ssrf"
import { webhookStartupWarnings } from "./webhooks/startup"

/** How long jobs in flight get to finish on shutdown (Docker kills after 10 s). */
const DRAIN_MS = 8_000

// Same as the api's process logger (see index.ts), as service "worker".
const logger = createLogger({
  service: "worker",
  env: { ...Bun.env, NODE_ENV: Bun.env.NODE_ENV || "production" },
})

function cannotStart(error: unknown): never {
  logger.error(`cannot start: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const log = legacyLog(logger)

let env: ReturnType<typeof loadEnv>
let mailer: ReturnType<typeof createMailer>
let telemetry: ReturnType<typeof createTelemetryProvider>
let analytics: ReturnType<typeof createAnalyticsProvider>
try {
  env = loadEnv(Bun.env, { warn: (message) => logger.warn(message) })
  mailer = createMailer(env, logger)
  telemetry = createTelemetryProvider(env, (message, error) =>
    error == null ? logger.warn(message) : logger.error(message, { error })
  )
  analytics = createAnalyticsProvider(
    env,
    { siteUrl: (app) => siteUrl(app as Parameters<typeof siteUrl>[0]) },
    (message, error) => (error == null ? logger.warn(message) : logger.error(message, { error }))
  )
} catch (error) {
  cannotStart(error)
}

let db: ReturnType<typeof createDb>
try {
  db = createDb(env.DATABASE_URL, { logger, queryDelayMs: env.API_TEST_QUERY_DELAY_MS })
  // The migration lock makes this safe next to an api replica migrating at the same time.
  await db.migrate()
} catch (error) {
  cannotStart(error)
}

// Same late-bound nudge as server.ts: `enqueue` (used only by telemetry's own forwarding here)
// nudges the worker it is handed, but the worker's context needs `recordFailure` before `worker`
// exists.
let workerRef: ReturnType<typeof createWorker> | undefined
const enqueue = createEnqueue({ db, nudge: () => workerRef?.nudge() })

// Same as the api's: a failed job is logged and recorded as a `server` row for app "api".
const telemetryDeps = { db, provider: telemetry, enqueue, log }
const recordFailure = (message: string, error: unknown) => {
  log(message, error)
  recordServerError(telemetryDeps, "api", error)
}

// Built only now, after `recordFailure` exists above (unlike `index.ts`, nothing here needs
// `storage` before this point, so this is a plain reorder rather than a late-bound ref).
let storage: ReturnType<typeof createStorage>
try {
  storage = createStorage(env, {
    onForbidden: (_key, error) => recordFailure("storage read forbidden", error),
  })
} catch (error) {
  cannotStart(error)
}

// The bus a job's notifications publish on, picked like the api's (REALTIME_BUS, else the
// dialect): on Postgres its NOTIFY reaches every api replica's streams; on SQLite the in-process
// bus reaches no api process, so a notification a job writes shows on the next page load.
let broadcaster: Awaited<ReturnType<typeof createBroadcaster>>
try {
  broadcaster = await createBroadcaster({
    bus: env.REALTIME_BUS ?? (db.dialect === "postgres" ? "postgres" : "memory"),
    databaseUrl: env.DATABASE_URL,
    log,
  })
} catch (error) {
  cannotStart(error)
}

// The same provider the api builds: `privacy.purge` cancels a deleted user's subscriptions.
let billing: ReturnType<ReturnType<typeof createBillingFactory>>
try {
  billing = createBillingFactory(env)({
    db,
    log,
    accountUrl: env.ACCOUNT_URL,
    enqueue,
    recordFailure,
    broadcaster,
    notificationEmail: {
      authUrl: env.AUTH_URL,
      accountUrl: env.ACCOUNT_URL,
      twoFactorKey: env.TWO_FACTOR_ENCRYPTION_KEY,
    },
  })
} catch (error) {
  cannotStart(error)
}

const metrics = createWorkerMetrics({ db })

const worker = createWorker({
  db,
  context: {
    db,
    mailer,
    storage,
    log,
    recordFailure,
    broadcaster,
    telemetry,
    analyticsRetentionDays: env.ANALYTICS_RETENTION_DAYS,
    backupRetentionDays: env.BACKUP_RETENTION_DAYS,
    auditPiiRetentionDays: env.AUDIT_PII_RETENTION_DAYS,
    auditRetentionDays: env.AUDIT_RETENTION_DAYS,
    analytics,
    accountUrl: env.ACCOUNT_URL,
    storagePublicUrl: env.STORAGE_PUBLIC_URL ?? null,
    billing,
    enqueue,
    twoFactorKey: env.TWO_FACTOR_ENCRYPTION_KEY,
    webhookResolve: systemResolver,
    // The same opt-in the api reads (server-options.ts).
    webhookAllowLocalhostHttp: env.WEBHOOK_ALLOW_LOCALHOST_HTTP,
  },
  concurrency: env.JOBS_CONCURRENCY,
  nameLimits: webhookNameLimits(env.WEBHOOK_CONCURRENCY),
  pollMs: env.JOBS_POLL_MS,
  log,
  recordFailure,
  metrics,
})
workerRef = worker

// Same shape as the api's: claiming stops the moment shutdown starts; the database closes once
// the jobs in flight finished (or DRAIN_MS passed).
let workerStopped: Promise<void> | undefined
const lifecycle = createLifecycle({
  drainMs: DRAIN_MS,
  onShutdown: () => {
    workerStopped = worker.stop(DRAIN_MS)
  },
  cleanup: async () => {
    await (workerStopped ?? worker.stop(DRAIN_MS))
    await broadcaster.close()
    await db.close()
  },
})

let server: ReturnType<typeof Bun.serve>
try {
  server = Bun.serve({
    hostname: env.HOST,
    port: env.PORT,
    routes: {
      "/health": readyRoute(lifecycle, () => db.ping(), { timeoutMs: env.READY_TIMEOUT_MS }),
      "/metrics": { GET: metricsRoute(metrics.registry, env.METRICS_TOKEN) },
    },
    fetch: () => errorResponse("NOT_FOUND", { message: "Not found" }),
  })
} catch (error) {
  cannotStart(error)
}

lifecycle.installSignalHandlers(server)
for (const message of webhookStartupWarnings(env, Bun.env)) logger.warn(message)
worker.start()

logger.info(
  `Job worker running (${env.JOBS_CONCURRENCY} at a time, at most ${env.WEBHOOK_CONCURRENCY} of them webhooks, polling every ${env.JOBS_POLL_MS} ms); health on ${new URL("/health", server.url)}`
)
