import { DEV_API_TOKEN } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { siteUrl } from "@repo/sites"
import { createAnalyticsProvider } from "./analytics/providers/create-provider"
import { hiringEmailOf, loadEnv, supportEmailOf } from "./env"
import { createMailer } from "./mail/create-mailer"
import { legacyLog } from "./request-context"
import { createServer } from "./server"
import { serverOptionsFromEnv } from "./server-options"
import { createStorage } from "./storage/create-storage"
import { createTelemetryProvider } from "./telemetry/create-provider"
import { webhookStartupWarnings } from "./webhooks/startup"

// One logger for the process, built before the env is parsed so a config error is logged the
// same way. NODE_ENV defaults to production as `loadEnv` does (Bun never sets it), so an unset
// NODE_ENV logs JSON; LOG_LEVEL / LOG_FORMAT are read (and validated) by createLogger itself.
const logger = createLogger({
  service: "api",
  env: { ...Bun.env, NODE_ENV: Bun.env.NODE_ENV || "production" },
})
const log = legacyLog(logger)

/** Startup failures (bad config, port in use, a failing migration) log one line and exit 1. */
function cannotStart(error: unknown): never {
  logger.error(`cannot start: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

let env: ReturnType<typeof loadEnv>
try {
  env = loadEnv(Bun.env, { warn: (message) => logger.warn(message) })
} catch (error) {
  cannotStart(error)
}

let mailer: ReturnType<typeof createMailer>
try {
  mailer = createMailer(env, logger)
} catch (error) {
  cannotStart(error)
}

// `createServer` builds the api's `recordFailure` (it needs `db`/`enqueue`, created inside it),
// but `storage` must exist before that call since it is one of its options — so `onForbidden`
// is wired through a ref, filled in once `createServer` returns `recordFailure` below. Nothing
// can call `storage.get()` before then (requests and the job worker both start inside
// `createServer`), so the ref is never read while still unset.
let onStorageForbidden: ((key: string, error: unknown) => void) | undefined
const storage = createStorage(env, {
  onForbidden: (key, error) => onStorageForbidden?.(key, error),
})

let telemetry: ReturnType<typeof createTelemetryProvider>
try {
  telemetry = createTelemetryProvider(env, (message, error) =>
    error == null ? logger.warn(message) : logger.error(message, { error })
  )
} catch (error) {
  cannotStart(error)
}

let analytics: ReturnType<typeof createAnalyticsProvider>
try {
  analytics = createAnalyticsProvider(
    env,
    // A pageview always carries a real app (one of @repo/sites's SITES); an event carries none
    // at all (see analytics/providers/provider.ts), so this is never called with anything else.
    { siteUrl: (app) => siteUrl(app as Parameters<typeof siteUrl>[0]) },
    (message, error) => (error == null ? logger.warn(message) : logger.error(message, { error }))
  )
} catch (error) {
  cannotStart(error)
}

const { server, lifecycle, recordFailure } = await createServer({
  ...serverOptionsFromEnv(env, { mailer, storage, telemetry, analytics }),
  logger,
  log,
}).catch(cannotStart)
onStorageForbidden = (_key, error) => recordFailure("storage read forbidden", error)
lifecycle.installSignalHandlers(server)

if (env.API_SERVICE_TOKEN === DEV_API_TOKEN) {
  logger.warn(
    `⚠ Using the public development token "${DEV_API_TOKEN}" — anyone can call this service. ` +
      "Set API_SERVICE_TOKEN before exposing it."
  )
}

if (mailer.kind === "log" && env.NODE_ENV === "production") {
  logger.warn(
    "⚠ MAIL_PROVIDER=log: emails are written to the log only. Set MAIL_PROVIDER=smtp or resend."
  )
}

if (mailer.kind === "file" && env.NODE_ENV === "production") {
  logger.warn(
    "⚠ MAIL_PROVIDER=file: emails are written to disk, not sent. Set MAIL_PROVIDER=smtp or resend."
  )
}

if (env.BILLING_PROVIDER === "mock" && env.NODE_ENV === "production") {
  logger.warn(
    "⚠ BILLING_PROVIDER=mock: plans activate without payment. Set BILLING_PROVIDER=stripe."
  )
}

if (!env.SUPPORT_EMAIL && env.NODE_ENV === "production") {
  logger.warn(
    `⚠ SUPPORT_EMAIL is not set: support requests go to MAIL_FROM's address (${supportEmailOf(env)}).`
  )
}

if (!env.HIRING_EMAIL && env.NODE_ENV === "production") {
  logger.warn(`⚠ HIRING_EMAIL is not set: job applications go to ${hiringEmailOf(env)}.`)
}

for (const message of webhookStartupWarnings(env, Bun.env)) logger.warn(message)

if (storage.kind === "local" && env.NODE_ENV === "production") {
  logger.warn(
    "STORAGE_PROVIDER=local: uploads are on this machine's disk — fine for one node with a volume, lost or split across several"
  )
}

logger.info(`API ready on ${server.url} — docs at ${new URL("/openapi", server.url)}`)
