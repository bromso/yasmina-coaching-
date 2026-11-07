import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { ORPCError, onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import {
  EMAIL_CHANGE_RATE_LIMIT,
  EMAIL_CHANGE_RATE_WINDOW_MS,
} from "@repo/api-contract/email-change-limits"
import {
  WEBHOOK_TEST_RATE_LIMIT,
  WEBHOOK_TEST_RATE_WINDOW_MS,
} from "@repo/api-contract/webhooks-limits"
import { createLogger, type Level, type Logger } from "@repo/log"
import {
  type ClientAddress,
  clientKey,
  createBearerCheck,
  createGuard,
  createLifecycle,
  createMemoryRateLimiter,
  createProtect,
  DEFAULT_REQUEST_TIMEOUT_MS,
  errorResponse,
  type FailureLimiter,
  type Handler,
  MAX_CLIENT_ID_LENGTH,
  metricsRoute,
  type ProtectedHandler,
  type RateLimiter,
  REQUEST_TIMEOUT_MESSAGE,
  readyRoute,
} from "@repo/service-kit"
import { siteUrl } from "@repo/sites"
import { BRAND_NAME } from "@repo/sites/brand"
import { parseSuperadminEmails } from "./admin"
import { type AnalyticsProvider, storeAnalyticsProvider } from "./analytics/providers/provider"
import { generateApiKey } from "./api-keys"
import { AUDIT_EXPORT_MAX_ROWS } from "./audit-export"
import { type BillingFactory, mockBilling } from "./billing/create-provider"
import { createWebhookHandler } from "./billing/webhook"
import { capTripLogger } from "./cap-trip"
import { TWO_FACTOR_CHALLENGE_TTL_MS, TWO_FACTOR_MAX_WRONG_CODES } from "./credentials"
import { createDb } from "./db"
import { DEV_MAIL_FROM, DEV_PASSKEY_RP_ID, mailAddress } from "./env"
import { localeFromHeader } from "./i18n"
import { createEnqueue } from "./jobs/enqueue"
import { createWorker, webhookNameLimits } from "./jobs/worker"
import { logMailer } from "./mail/log"
import type { Mailer } from "./mail/mailer"
import { capLimiterLabel, createApiMetrics, registerJobMetrics } from "./metrics"
import type { Provider } from "./oauth/provider"
import { relyingParty } from "./passkeys"
import type { ProviderId } from "./queries/identities"
import type { Broadcaster } from "./realtime/broadcaster"
import { createBroadcaster } from "./realtime/create-broadcaster"
import { createPresence } from "./realtime/presence"
import { createStreamHandler, type StreamSocket } from "./realtime/stream"
import { apiRouteOf, legacyLog, withRequest } from "./request-context"
import { type Context, router } from "./router"
import { localStorage } from "./storage/local"
import type { Storage } from "./storage/storage"
import type { TelemetryProvider } from "./telemetry/provider"
import { recordServerError } from "./telemetry/record"
import { storeProvider } from "./telemetry/store"
import {
  INTERNAL_MESSAGE,
  NOT_FOUND_MESSAGE,
  PAYLOAD_TOO_LARGE_MESSAGE,
  v1Error,
} from "./v1/errors"
import { createApiKeyGuard } from "./v1/guard"
import { createV1Handler, V1_DOCS_PATH, V1_SPEC_PATH } from "./v1/handler"
import type { WebhookFetch } from "./webhooks/deliver"
import { type Resolver, systemResolver } from "./webhooks/ssrf"

export type ServerOptions = {
  hostname: string
  port: number
  databaseUrl: string
  /** Test-only: every database statement waits this long first (`API_TEST_QUERY_DELAY_MS`). */
  queryDelayMs?: number
  development?: boolean
  token: string
  allowedOrigins: string[]
  allowLocalhostOrigins: boolean
  rateLimiter: RateLimiter
  maxBodyBytes: number
  /** Seconds a connection may sit idle before Bun closes it. Defaults to Bun's 10. */
  idleTimeout?: number
  /** How long in-flight requests get to finish on shutdown (Docker kills after 10 s). */
  drainMs?: number
  /** How long /ready answers 503 before the listener closes (raise behind a load balancer). */
  graceMs?: number
  /** How long /ready waits for the database ping before answering 503. Defaults to 2 000 ms. */
  readyTimeoutMs?: number
  /**
   * The server-side request deadline (`REQUEST_TIMEOUT_MS`): a handler that has not answered by
   * then gets 503 instead. Event streams are exempt. Defaults to 30 000 ms; 0 turns it off
   * (programmatic only — `env.ts`'s `REQUEST_TIMEOUT_MS` refuses 0, with a 1 000 ms minimum).
   */
  requestTimeoutMs?: number
  /** The internal `(message, error)` callback. Defaults to `legacyLog(logger)`. */
  log?: (message: string, error: unknown) => void
  /** The structured logger (access lines, `error()`). Defaults to `createLogger({ service: "api" })`. */
  logger?: Logger
  /** Where the default logger writes each line (tests capture lines here). Defaults to the console. */
  logWrite?: (line: string, level: Level) => void
  /** Base URL of the auth app; password-reset links point at `${authUrl}/reset-password`. */
  authUrl: string
  /** Base URL of the account app; the password-changed notice links to `${accountUrl}/security`. */
  accountUrl: string
  /** Base URL of the app; invitation links point at `${appUrl}/invitations/<token>`. */
  appUrl: string
  /** Sends verify, password-reset, password-changed and magic-link email. Defaults to writing it to the log. */
  mailer?: Mailer
  /** Throttles sign-in attempts per email. Defaults to 10 per 15 minutes. */
  signInLimiter?: RateLimiter
  /** Throttles password-reset requests per email, silently. Defaults to 3 per 15 minutes. */
  resetLimiter?: RateLimiter
  /** Caps password-reset requests api-wide, silently. Defaults to 30 per 10 minutes. */
  resetGlobalLimiter?: RateLimiter
  /** Throttles verification resends per user. Defaults to 3 per 15 minutes. */
  verifyLimiter?: RateLimiter
  /** Throttles magic-link requests per email, silently. Defaults to 3 per 15 minutes. */
  magicLimiter?: RateLimiter
  /** Caps magic-link requests api-wide, silently. Defaults to 30 per 10 minutes. */
  magicGlobalLimiter?: RateLimiter
  /** Throttles waitlist joins per x-api-client-id. Defaults to 5 per 15 minutes. */
  waitlistLimiter?: RateLimiter
  /** Throttles support requests per x-api-client-id (an ip hash). Defaults to 5 per hour. */
  supportLimiter?: RateLimiter
  /** Throttles support requests per typed (normalised) email. Defaults to 3 per hour. */
  supportRecipientLimiter?: RateLimiter
  /** Caps support requests api-wide, whatever the client id. Defaults to 100 per hour. */
  supportGlobalLimiter?: RateLimiter
  /**
   * Throttles `auth.notificationEmail.unsubscribe` / `peek` per calling client, spent only by a
   * token that verifies (a forged one costs one HMAC and spends nothing). Defaults to 60 per 10
   * minutes. The auth app's one-click route keys its client id on the token's hash, so this is
   * one bucket per real link; its confirm page keys on the ip hash.
   */
  notificationEmailLimiter?: RateLimiter
  /** Caps both api-wide, spent only by verified tokens. Defaults to 1000 per 10 minutes. */
  notificationEmailGlobalLimiter?: RateLimiter
  /** Where support requests are mailed (SUPPORT_EMAIL, else MAIL_FROM's address). */
  supportEmail?: string
  /** Throttles job applications per x-api-client-id (an ip hash). Defaults to 3 per hour. */
  jobsLimiter?: RateLimiter
  /** Throttles job applications per typed (normalised) email. Defaults to 3 per day. */
  jobsRecipientLimiter?: RateLimiter
  /** Caps job applications api-wide, whatever the client id. Defaults to 50 per hour. */
  jobsGlobalLimiter?: RateLimiter
  /** Where job applications are mailed (HIRING_EMAIL, else `supportEmail`). */
  hiringEmail?: string
  /** Caps sign-ups api-wide, whatever the client id. Defaults to 30 per 10 minutes. */
  signUpLimiter?: RateLimiter
  /** Caps sign-ups per normalised email. Defaults to 3 per hour. */
  signUpEmailLimiter?: RateLimiter
  /** Throttles invitations per workspace. Defaults to 20 per hour. */
  inviteLimiter?: RateLimiter
  /** Throttles invitations per inviting user, across workspaces. Defaults to 50 per hour. */
  inviterLimiter?: RateLimiter
  /** Throttles workspace creation per user. Defaults to 10 per hour. */
  workspaceCreateLimiter?: RateLimiter
  /** The configured sign-in providers (see `createProviders`). Defaults to none. */
  providers?: Map<ProviderId, Provider>
  /** Builds the billing provider once the database is migrated. Defaults to the keyless mock. */
  billing?: BillingFactory
  /** Emails of the platform admins (SUPERADMIN_EMAILS). Defaults to none. */
  superadminEmails?: string[]
  /** Throttles impersonation starts per admin. Defaults to 10 per hour. */
  impersonateLimiter?: RateLimiter
  /** Where new errors go besides the tables. Defaults to the keyless `store` (tables only). */
  telemetry?: TelemetryProvider
  /** Throttles telemetry batches per client id. Defaults to 60 per minute. */
  telemetryLimiter?: RateLimiter
  /** Throttles telemetry batches per app, across client ids. Defaults to 3000 per minute. */
  telemetryAppLimiter?: RateLimiter
  /** Throttles analytics ingest calls per client id. Defaults to 120 per minute. */
  analyticsLimiter?: RateLimiter
  /** The per-app backstop behind `analyticsLimiter`. Defaults to 6000 per minute. */
  analyticsAppLimiter?: RateLimiter
  /** ANALYTICS_RETENTION_DAYS: how long `analytics.prune` keeps raw rows. Defaults to 90. */
  analyticsRetentionDays?: number
  /** BACKUP_RETENTION_DAYS: how long `backup.run` keeps its own objects under `backups/`. Defaults to 14. */
  backupRetentionDays?: number
  /** AUDIT_PII_RETENTION_DAYS: how long `audit.prune` keeps a row's ip/user_agent. Defaults to 90. */
  auditPiiRetentionDays?: number
  /** AUDIT_RETENTION_DAYS: how long `audit.prune` keeps the whole row. Defaults to 365. */
  auditRetentionDays?: number
  /** Where new pageviews/events also go besides the tables. Defaults to the keyless `store`. */
  analytics?: AnalyticsProvider
  /** TWO_FACTOR_ENCRYPTION_KEY (32 bytes, base64): opens the stored TOTP secrets. */
  twoFactorEncryptionKey: string
  /**
   * Counts only wrong two-factor codes per user, with separate sign-in and management budgets
   * (see `Context`'s `twoFactorUserLimiter`). Defaults to 10 per 15 minutes.
   */
  twoFactorUserLimiter?: FailureLimiter
  /** Throttles admin two-factor resets per admin. Defaults to 10 per hour. */
  resetTwoFactorLimiter?: RateLimiter
  /** Throttles admin passkey removals per admin. Defaults to 10 per hour. */
  removePasskeysLimiter?: RateLimiter
  /** Throttles admin suspend/unsuspend calls per admin, one shared budget. Defaults to 20/hour. */
  suspendLimiter?: RateLimiter
  /** Throttles `admin.audit.export` per admin. Defaults to 10 per hour. */
  auditExportLimiter?: RateLimiter
  /** `admin.audit.export`'s row cap (a CONFLICT past it, never a truncated file). Defaults to 100 000. */
  auditExportMaxRows?: number
  /** PASSKEY_RP_ID: the domain passkeys are scoped to. Defaults to `brand.localhost`. */
  passkeyRpId?: string
  /** PASSKEY_RP_NAME: the name the browser's passkey prompt shows. Defaults to BRAND_NAME. */
  passkeyRpName?: string
  /**
   * Counts failed passkey sign-ins per calling client (`passkey:<x-api-client-id>`); a success
   * gives its attempt back. Defaults to 10 per 15 minutes.
   */
  passkeyLimiter?: FailureLimiter
  /** Where uploads live. Defaults to files under `.data/storage`. */
  storage?: Storage
  /** Throttles avatar/logo uploads per calling user. Defaults to 20 per hour. */
  uploadLimiter?: RateLimiter
  /**
   * Throttles `account.email.requestChange` per user (`email-change:<userId>`). Defaults to
   * `EMAIL_CHANGE_RATE_LIMIT` per `EMAIL_CHANGE_RATE_WINDOW_MS` (3 per 15 minutes).
   */
  emailChangeLimiter?: RateLimiter
  /**
   * `workspaces.webhooks.test`, keyed `webhook-test:<workspaceId>`. Defaults to an in-memory
   * `WEBHOOK_TEST_RATE_LIMIT` per `WEBHOOK_TEST_RATE_WINDOW_MS` (20 an hour).
   */
  webhookTestLimiter?: RateLimiter
  /** Base URL files are served from (a CDN or bucket's public URL). Defaults to `/files/<key>`. */
  storagePublicUrl?: string
  /** Run the job worker and scheduler in this process. Defaults to true; tests pass false. */
  jobsWorker?: boolean
  /** Jobs this process runs at once. Defaults to 4. */
  jobsConcurrency?: number
  /** How often the worker looks for due jobs, in ms. Defaults to 1000. */
  jobsPollMs?: number
  /** `webhook.deliver` jobs this process runs at once (WEBHOOK_CONCURRENCY). Defaults to 2. */
  webhookConcurrency?: number
  /**
   * The job worker's and `enqueue`'s clock, and the one a suspension's end date is read against.
   * Defaults to the system clock; tests inject their own.
   */
  now?: () => Date
  /**
   * Which bus publishes/subscribes realtime events. Defaults to the database dialect: `postgres`
   * for Postgres, `memory` for SQLite. `REALTIME_BUS` overrides it either way.
   */
  realtimeBus?: "memory" | "postgres"
  /** Process-wide cap on open event streams (`/events/workspaces/:id` and `/events/me`). Defaults to 1000. */
  realtimeMaxStreams?: number
  /** Open event streams one session may hold, per kind (workspace, `/events/me`). Defaults to 5. */
  realtimeMaxPerSession?: number
  /** Open event streams one user may hold across their sessions, per kind. Defaults to 10. */
  realtimeMaxPerUser?: number
  /** How often every event stream gets a `: ping` and presence is re-published. Defaults to 25 s. */
  realtimePingMs?: number
  /** How often each event stream re-reads its session and membership. Defaults to 60 s. */
  realtimeRecheckMs?: number
  /** The realtime publisher/subscriber. Defaults to one built from `realtimeBus`/`databaseUrl`. */
  broadcaster?: Broadcaster
  /** METRICS_TOKEN: the bearer `/metrics` requires. Unset → `/metrics` answers 404. */
  metricsToken?: string
  /** Throttles `/v1` calls per API key (`api-key:<id>`). Defaults to 600 per minute. */
  apiKeyLimiter?: RateLimiter
  /**
   * Throttles refused `/v1` calls (no key, a bad, revoked or expired one, a lost feature) per
   * caller address (`v1-anon:<ip hash>`). Defaults to 60 per minute.
   */
  apiAnonLimiter?: RateLimiter
  /** Draws a fresh API key. Defaults to `generateApiKey`; a test injects a colliding one. */
  generateApiKey?: typeof generateApiKey
  /** The webhook SSRF guard's DNS: every A/AAAA address of a host. Defaults to the system's. */
  webhookResolve?: Resolver
  /**
   * Allows webhook URLs that are `http`/`https` to `localhost` and `*.localhost` (pinned to
   * loopback). Defaults to false; WEBHOOK_ALLOW_LOCALHOST_HTTP sets it (local development, e2e).
   */
  webhookAllowLocalhostHttp?: boolean
  /** The fetch `webhook.deliver` dials with. Defaults to Bun's; a test injects its own. */
  webhookFetch?: WebhookFetch
}

const notFound = () => errorResponse("NOT_FOUND", { message: "Not found" })

/** A successful realtime stream — the only response whose connection may idle indefinitely. */
export const isEventStream = (res: Response) =>
  res.ok && (res.headers.get("content-type")?.startsWith("text/event-stream") ?? false)

/** What `createEventsHandler` needs from Bun's `server` argument. */
type TimeoutServer = ClientAddress & { timeout(req: Request, seconds: number): void }

/**
 * `GET /events/workspaces/:workspaceId` and `GET /events/me`. Idle timeout is off for the whole call, not just once a
 * stream has opened: `protect` awaits the guard, the rate limiter and `authorize` (a database
 * round trip) before anything is written to the socket, and Bun would otherwise count that wait
 * as idle and cut the connection before the stream ever starts. Once the answer is known, a
 * stream takes over its own timeout from here (`StreamSocket`, used to drop an unread connection
 * quickly); anything else — 401/404/429/503, or `protect`/`streamsHandle` throwing (a database
 * error on connect, answered by Bun's `error()` callback, which never sees the Request and so
 * cannot restore it itself) — gets the ordinary idle timeout back, or its keep-alive socket would
 * stay open forever. Exported so a fake `server` can exercise it without booting a real one.
 */
export function createEventsHandler(
  protect: (handler: Handler) => ProtectedHandler,
  streamsHandle: (req: Request, socket?: StreamSocket) => Promise<Response>,
  idleTimeoutSeconds: number
) {
  return async (req: Request, server: TimeoutServer): Promise<Response> => {
    const socket: StreamSocket = { timeout: (seconds) => server.timeout(req, seconds) }
    server.timeout(req, 0)
    let res: Response
    try {
      res = await protect((r) => streamsHandle(r, socket))(req, server)
    } catch (error) {
      server.timeout(req, idleTimeoutSeconds)
      throw error
    }
    if (!isEventStream(res)) server.timeout(req, idleTimeoutSeconds)
    return res
  }
}

/** The body-size cap an avatar/logo upload gets; every other request keeps `maxBodyBytes`. */
export const UPLOAD_MAX_BODY_BYTES = 3 * 1024 * 1024
/**
 * The body-size cap `jobs.apply` gets: a `MAX_CV_BYTES` (5 MB) PDF plus the form's text fields and
 * the multipart framing. The handler still refuses a CV over 5 MB with its own message.
 */
export const CV_MAX_BODY_BYTES = 6 * 1024 * 1024

const UPLOAD_PATHS = new Set(["/rpc/account/avatar/set", "/rpc/workspaces/logo/set"])
const AVATAR_OPENAPI_PATH = /^\/openapi\/account\/avatar$/
const LOGO_OPENAPI_PATH = /^\/openapi\/workspaces\/[^/]+\/logo$/
const CV_PATHS = new Set(["/rpc/jobs/apply", "/openapi/jobs/apply"])

/**
 * The body cap for `req`: `account.avatar.set` / `workspaces.logo.set` get `UPLOAD_MAX_BODY_BYTES`
 * and `jobs.apply` gets `CV_MAX_BODY_BYTES`, over either transport — the only procedures that take
 * a body anywhere near those; anything else gets null (the caller's `maxBodyBytes`).
 * Method-gated: `DELETE /openapi/account/avatar` (and the logo equivalent) hit the same REST path
 * but carry no body, so they must not get the bigger cap along with the real uploads.
 */
const uploadCap = (req: Request): number | null => {
  if (req.method !== "POST") return null
  const { pathname } = new URL(req.url)
  if (CV_PATHS.has(pathname)) return CV_MAX_BODY_BYTES
  const image =
    UPLOAD_PATHS.has(pathname) ||
    AVATAR_OPENAPI_PATH.test(pathname) ||
    LOGO_OPENAPI_PATH.test(pathname)
  return image ? UPLOAD_MAX_BODY_BYTES : null
}

export async function createServer(options: ServerOptions) {
  const logger = options.logger ?? createLogger({ service: "api", write: options.logWrite })
  const log = options.log ?? legacyLog(logger)
  const db = createDb(options.databaseUrl, { logger, queryDelayMs: options.queryDelayMs })
  await db.migrate()
  const mailer = options.mailer ?? logMailer(logger)
  const signInLimiter =
    options.signInLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 15 * 60_000 })
  const resetLimiter =
    options.resetLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 15 * 60_000 })
  const resetGlobalLimiter =
    options.resetGlobalLimiter ?? createMemoryRateLimiter({ limit: 30, windowMs: 10 * 60_000 })
  const verifyLimiter =
    options.verifyLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 15 * 60_000 })
  const magicLimiter =
    options.magicLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 15 * 60_000 })
  const magicGlobalLimiter =
    options.magicGlobalLimiter ?? createMemoryRateLimiter({ limit: 30, windowMs: 10 * 60_000 })
  const signUpLimiter =
    options.signUpLimiter ?? createMemoryRateLimiter({ limit: 30, windowMs: 10 * 60_000 })
  const signUpEmailLimiter =
    options.signUpEmailLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 60 * 60_000 })
  const waitlistLimiter =
    options.waitlistLimiter ?? createMemoryRateLimiter({ limit: 5, windowMs: 15 * 60_000 })
  const supportLimiter =
    options.supportLimiter ?? createMemoryRateLimiter({ limit: 5, windowMs: 60 * 60_000 })
  const supportRecipientLimiter =
    options.supportRecipientLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 60 * 60_000 })
  const supportGlobalLimiter =
    options.supportGlobalLimiter ?? createMemoryRateLimiter({ limit: 100, windowMs: 60 * 60_000 })
  const notificationEmailLimiter =
    options.notificationEmailLimiter ??
    createMemoryRateLimiter({ limit: 60, windowMs: 10 * 60_000 })
  const notificationEmailGlobalLimiter =
    options.notificationEmailGlobalLimiter ??
    createMemoryRateLimiter({ limit: 1000, windowMs: 10 * 60_000 })
  const supportEmail = options.supportEmail ?? mailAddress(DEV_MAIL_FROM)
  const jobsLimiter =
    options.jobsLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 60 * 60_000 })
  const jobsRecipientLimiter =
    options.jobsRecipientLimiter ??
    createMemoryRateLimiter({ limit: 3, windowMs: 24 * 60 * 60_000 })
  const jobsGlobalLimiter =
    options.jobsGlobalLimiter ?? createMemoryRateLimiter({ limit: 50, windowMs: 60 * 60_000 })
  const hiringEmail = options.hiringEmail ?? supportEmail
  const inviteLimiter =
    options.inviteLimiter ?? createMemoryRateLimiter({ limit: 20, windowMs: 60 * 60_000 })
  const inviterLimiter =
    options.inviterLimiter ?? createMemoryRateLimiter({ limit: 50, windowMs: 60 * 60_000 })
  const workspaceCreateLimiter =
    options.workspaceCreateLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 })
  const impersonateLimiter =
    options.impersonateLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 })
  const superadminEmails = parseSuperadminEmails(options.superadminEmails ?? [])
  const clock = options.now ?? (() => new Date())
  const telemetry = options.telemetry ?? storeProvider
  const analytics = options.analytics ?? storeAnalyticsProvider
  const telemetryLimiter =
    options.telemetryLimiter ?? createMemoryRateLimiter({ limit: 60, windowMs: 60_000 })
  const telemetryAppLimiter =
    options.telemetryAppLimiter ?? createMemoryRateLimiter({ limit: 3000, windowMs: 60_000 })
  const analyticsLimiter =
    options.analyticsLimiter ?? createMemoryRateLimiter({ limit: 120, windowMs: 60_000 })
  const analyticsAppLimiter =
    options.analyticsAppLimiter ?? createMemoryRateLimiter({ limit: 6000, windowMs: 60_000 })
  const twoFactorUserLimiter =
    options.twoFactorUserLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 15 * 60_000 })
  const resetTwoFactorLimiter =
    options.resetTwoFactorLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 })
  const removePasskeysLimiter =
    options.removePasskeysLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 })
  const suspendLimiter =
    options.suspendLimiter ?? createMemoryRateLimiter({ limit: 20, windowMs: 60 * 60_000 })
  const auditExportLimiter =
    options.auditExportLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 60 * 60_000 })
  const auditExportMaxRows = options.auditExportMaxRows ?? AUDIT_EXPORT_MAX_ROWS
  const passkeyLimiter =
    options.passkeyLimiter ?? createMemoryRateLimiter({ limit: 10, windowMs: 15 * 60_000 })
  const passkeyRp = relyingParty({
    id: options.passkeyRpId ?? DEV_PASSKEY_RP_ID,
    name: options.passkeyRpName ?? BRAND_NAME,
    authUrl: options.authUrl,
    accountUrl: options.accountUrl,
  })
  // The window outlives the challenge, so a challenge's count never resets while it can be used.
  const twoFactorChallengeLimiter = createMemoryRateLimiter({
    limit: TWO_FACTOR_MAX_WRONG_CODES - 1,
    windowMs: TWO_FACTOR_CHALLENGE_TTL_MS,
  })
  const providers = options.providers ?? new Map<ProviderId, Provider>()
  const storage = options.storage ?? localStorage(".data/storage")
  const uploadLimiter =
    options.uploadLimiter ?? createMemoryRateLimiter({ limit: 20, windowMs: 60 * 60_000 })
  const emailChangeLimiter =
    options.emailChangeLimiter ??
    createMemoryRateLimiter({
      limit: EMAIL_CHANGE_RATE_LIMIT,
      windowMs: EMAIL_CHANGE_RATE_WINDOW_MS,
    })
  const webhookTestLimiter =
    options.webhookTestLimiter ??
    createMemoryRateLimiter({
      limit: WEBHOOK_TEST_RATE_LIMIT,
      windowMs: WEBHOOK_TEST_RATE_WINDOW_MS,
    })
  // Links in waitlist mail; SITE_DOMAIN in the environment picks the production domain.
  const wwwUrl = siteUrl("www")
  const webhookResolve = options.webhookResolve ?? systemResolver
  // From WEBHOOK_ALLOW_LOCALHOST_HTTP (server-options.ts) in a real process; off unless set.
  const webhookAllowLocalhostHttp = options.webhookAllowLocalhostHttp ?? false

  // Picked from `db`'s own dialect (sqlite → memory, postgres → postgres) unless `realtimeBus`
  // (REALTIME_BUS) overrides it; a test's own `options.broadcaster` skips the bus choice entirely.
  const broadcaster =
    options.broadcaster ??
    (await createBroadcaster({
      bus: options.realtimeBus ?? (db.dialect === "postgres" ? "postgres" : "memory"),
      databaseUrl: options.databaseUrl,
      log,
    }))

  // `enqueue` nudges the worker it is handed, but the worker's own context needs `recordFailure`
  // (below) before it exists: `jobsRef` is filled in once `jobs` is created, a few lines down, so
  // by the time anything actually calls `enqueue` (always after setup finishes) the nudge reaches
  // the real worker. `now` matches the worker's own clock (the system clock, or a test's).
  let jobsRef: ReturnType<typeof createWorker> | undefined
  const enqueue = createEnqueue({ db, nudge: () => jobsRef?.nudge(), now: options.now })

  // The api's own failures become `server` rows for app "api"; detached, so never the response.
  // `log` stays the raw logger here: telemetry's own failures (a database outage) are logged only,
  // never recorded, so they cannot recurse.
  const telemetryDeps = { db, provider: telemetry, enqueue, log }

  // `/metrics`. `streams` is created further down; the gauge reads it only on a scrape.
  const metrics = createApiMetrics({ db, streams: { openCount: () => streams.openCount() } })
  // The job metrics go on the api's registry only when this process runs the worker: with
  // JOBS_WORKER=false a dedicated worker reports them (and the queue) on its own `/metrics`.
  const jobMetrics =
    options.jobsWorker !== false ? registerJobMetrics(metrics.registry, db) : undefined

  // The log line stays throttled per key; the counter moves on every refusal.
  const logCapTripped = capTripLogger(log)
  const noteCapTripped = (key: string) => {
    metrics.limiterRefusal(capLimiterLabel(key))
    logCapTripped(key)
  }
  const recordFailure = (message: string, error: unknown) => {
    log(message, error)
    recordServerError(telemetryDeps, "api", error)
  }

  // After `enqueue`/`recordFailure` exist: the mock provider's "checkout" activates a plan
  // synchronously (never through the webhook) and records `plan_changed` through the mirror.
  // Where an optional notification email links to, and the key its unsubscribe token is derived
  // from (apps/api/src/notification-email.ts): for the billing mirror's `plan.changed` emails.
  const notificationEmail = {
    authUrl: options.authUrl,
    accountUrl: options.accountUrl,
    twoFactorKey: options.twoFactorEncryptionKey,
  }
  const billing = (options.billing ?? mockBilling)({
    db,
    log,
    accountUrl: options.accountUrl,
    enqueue,
    recordFailure,
    broadcaster,
    notificationEmail,
  })

  // A freshly minted key (never null) always resolves to a URL; a stored one may be null (no
  // avatar/logo yet). `storagePublicUrl` (no trailing slash — the env loader strips it) points a
  // CDN or bucket's public URL at the keys; without it, keys are served from this api at /files.
  function fileUrl(key: string): string
  function fileUrl(key: string | null): string | null
  function fileUrl(key: string | null): string | null {
    if (key === null) return null
    return options.storagePublicUrl ? `${options.storagePublicUrl}/${key}` : `/files/${key}`
  }

  // Created even when this process does not run it (`jobsWorker: false`): `enqueue` nudges it, a
  // no-op until started, and tests drive it with `drain()`.
  const jobs = createWorker({
    db,
    context: {
      db,
      mailer,
      storage,
      log,
      recordFailure,
      broadcaster,
      telemetry,
      analyticsRetentionDays: options.analyticsRetentionDays ?? 90,
      backupRetentionDays: options.backupRetentionDays ?? 14,
      auditPiiRetentionDays: options.auditPiiRetentionDays ?? 90,
      auditRetentionDays: options.auditRetentionDays ?? 365,
      analytics,
      accountUrl: options.accountUrl,
      storagePublicUrl: options.storagePublicUrl ?? null,
      billing,
      enqueue,
      twoFactorKey: options.twoFactorEncryptionKey,
      webhookResolve,
      webhookAllowLocalhostHttp,
      webhookFetch: options.webhookFetch,
    },
    concurrency: options.jobsConcurrency ?? 4,
    nameLimits: webhookNameLimits(options.webhookConcurrency ?? 2),
    pollMs: options.jobsPollMs ?? 1000,
    now: options.now,
    log,
    recordFailure,
    metrics: jobMetrics,
  })
  jobsRef = jobs

  // The SSE endpoint's state: who is present here, and every open stream. `replicaId` tags this
  // process's presence snapshots, so clients can merge one snapshot per replica.
  const streams = createStreamHandler({
    db,
    broadcaster,
    presence: createPresence(),
    replicaId: crypto.randomUUID(),
    maxStreams: options.realtimeMaxStreams ?? 1000,
    maxPerSession: options.realtimeMaxPerSession,
    maxPerUser: options.realtimeMaxPerUser,
    pingMs: options.realtimePingMs,
    recheckMs: options.realtimeRecheckMs,
    fileUrl,
    log,
    recordFailure,
    superadminEmails,
    now: clock,
  })

  // Client errors (NOT_FOUND, BAD_REQUEST, …) are part of the contract; log only real failures.
  const logUnexpected = (error: unknown) => {
    if (!(error instanceof ORPCError) || error.status >= 500) {
      log("rpc failed", error)
      recordServerError(telemetryDeps, "api", error)
    }
  }

  // Typed RPC transport for first-party clients (@orpc/client + the contract).
  const rpc = new RPCHandler(router, { interceptors: [onError(logUnexpected)] })

  // The same router as plain REST, plus a generated OpenAPI spec and Scalar docs at /openapi.
  const openapi = new OpenAPIHandler(router, {
    interceptors: [onError(logUnexpected)],
    plugins: [
      new OpenAPIReferencePlugin({
        docsProvider: "scalar",
        docsTitle: "API reference",
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: { info: { title: "API", version: "0.1.0" } },
      }),
    ],
  })

  const handle = async (
    handler: RPCHandler<Context> | OpenAPIHandler<Context>,
    prefix: `/${string}`,
    req: Request
  ) => {
    const { matched, response } = await handler.handle(req, {
      prefix,
      context: {
        db,
        sessionToken: req.headers.get("x-session-token"),
        now: clock,
        mailer,
        authUrl: options.authUrl,
        accountUrl: options.accountUrl,
        appUrl: options.appUrl,
        signInLimiter,
        resetLimiter,
        resetGlobalLimiter,
        verifyLimiter,
        magicLimiter,
        magicGlobalLimiter,
        waitlistLimiter,
        supportLimiter,
        supportRecipientLimiter,
        supportGlobalLimiter,
        notificationEmailLimiter,
        notificationEmailGlobalLimiter,
        supportEmail,
        jobsLimiter,
        jobsRecipientLimiter,
        jobsGlobalLimiter,
        hiringEmail,
        signUpLimiter,
        signUpEmailLimiter,
        inviteLimiter,
        inviterLimiter,
        workspaceCreateLimiter,
        clientId: req.headers.get("x-api-client-id")?.trim().slice(0, MAX_CLIENT_ID_LENGTH) || null,
        ...localeFromHeader(req.headers.get("x-locale")),
        wwwUrl,
        providers,
        log,
        billing,
        superadminEmails,
        analyticsRetentionDays: options.analyticsRetentionDays ?? 90,
        auditPiiRetentionDays: options.auditPiiRetentionDays ?? 90,
        auditRetentionDays: options.auditRetentionDays ?? 365,
        impersonateLimiter,
        telemetry,
        telemetryLimiter,
        telemetryAppLimiter,
        analyticsLimiter,
        analyticsAppLimiter,
        analytics,
        recordFailure,
        noteCapTripped,
        twoFactorKey: options.twoFactorEncryptionKey,
        twoFactorUserLimiter,
        twoFactorChallengeLimiter,
        resetTwoFactorLimiter,
        removePasskeysLimiter,
        suspendLimiter,
        auditExportLimiter,
        auditExportMaxRows,
        passkeyRp,
        passkeyLimiter,
        storage,
        uploadLimiter,
        emailChangeLimiter,
        webhookTestLimiter,
        fileUrl,
        enqueue,
        broadcaster,
        generateApiKey: options.generateApiKey ?? generateApiKey,
        webhookResolve,
        webhookAllowLocalhostHttp,
      },
    })
    return matched ? response : notFound()
  }

  // The global API limiter, counting its refusals as `limiter="api"`.
  const apiRateLimiter: RateLimiter = {
    async hit(key) {
      const verdict = await options.rateLimiter.hit(key)
      if (!verdict.allowed) metrics.limiterRefusal("api")
      return verdict
    },
  }
  const protect = createProtect({
    guard: createGuard(options),
    rateLimiter: apiRateLimiter,
    keyFor: clientKey("x-api-client-id"),
  })

  // Bun's own `maxRequestBodySize` below is the server-wide ceiling (it must cover the largest
  // upload, a CV); this narrower check runs first, so a 10 MB `notes.create` body is refused at
  // `options.maxBodyBytes`, and an avatar at `UPLOAD_MAX_BODY_BYTES`, rather than riding all the way
  // up to `CV_MAX_BODY_BYTES`. A chunked body with no `content-length` skips this check and is
  // bounded by that server-wide cap instead. A configured `maxBodyBytes` above an upload's cap wins.
  const tooLarge = (req: Request) => {
    const length = Number(req.headers.get("content-length") ?? 0)
    return length > Math.max(uploadCap(req) ?? 0, options.maxBodyBytes)
  }
  const withSizeCheck =
    (handler: (req: Request) => Promise<Response>) =>
    (req: Request): Promise<Response> | Response =>
      tooLarge(req)
        ? errorResponse("PAYLOAD_TOO_LARGE", { message: "Payload too large" })
        : handler(req)

  // The public /v1 API: its own guard (an API key, never the service token or a session) and its
  // own per-key limiter instead of `protect`'s, then its own `OpenAPIHandler`.
  const apiKeyLimiter =
    options.apiKeyLimiter ?? createMemoryRateLimiter({ limit: 600, windowMs: 60_000 })
  const v1Guard = createApiKeyGuard({
    db,
    billing,
    now: clock,
    limiter: apiKeyLimiter,
    anonLimiter: options.apiAnonLimiter ?? createMemoryRateLimiter({ limit: 60, windowMs: 60_000 }),
    recordFailure,
    onRateLimited: (limiter) => metrics.limiterRefusal(limiter),
  })
  const v1 = createV1Handler({
    context: { db, now: clock, billing, enqueue, recordFailure, broadcaster },
    onUnexpected: logUnexpected,
  })
  // Every /v1 answer keeps /v1's error shape: a throw in the guard (a database outage) is a 500
  // `internal` here, logged and recorded like any other unexpected failure.
  const v1Protected = async (req: Request, server: ClientAddress): Promise<Response> => {
    try {
      const auth = await v1Guard(req, server.requestIP(req)?.address ?? null)
      if ("response" in auth) return auth.response
      // Only POST reads a body on /v1 (and only `createNote` declares 413); a GET or DELETE body
      // is never read, so refusing it protects nothing. The server-wide cap still bounds it.
      if (req.method === "POST" && tooLarge(req)) {
        return v1Error("validation_failed", PAYLOAD_TOO_LARGE_MESSAGE, { status: 413 })
      }
      return await v1(req, auth.key)
    } catch (error) {
      logUnexpected(error)
      return v1Error("internal", INTERNAL_MESSAGE)
    }
  }

  // Anything that throws past the handlers: log it, never show Bun's error page or a stack.
  const unhandled = (error: unknown) => {
    logger.error("unhandled", { error })
    recordServerError(telemetryDeps, "api", error)
    return errorResponse("INTERNAL_SERVER_ERROR", { message: "Internal error" })
  }

  // Outermost on every logged route, so the guard's own 401/429 carry an id and an access line.
  // A caller's x-request-id is honoured only with the service bearer; anyone else gets a new one.
  const hasServiceToken = createBearerCheck(options.token)
  // Every logged route gets the request deadline except an event stream (`deadline: false`),
  // which never "finishes".
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const logged = <S, Args extends unknown[]>(
    handler: (req: Request, server: S, ...rest: Args) => Response | Promise<Response>,
    {
      deadline = true,
      timeoutResponse,
    }: { deadline?: boolean; timeoutResponse?: () => Response } = {}
  ) =>
    withRequest(handler, {
      timeoutMs: deadline ? requestTimeoutMs : undefined,
      timeoutResponse,
      trusted: hasServiceToken,
      logger,
      routeOf: apiRouteOf,
      clientIdOf: (req, trusted) =>
        trusted ? req.headers.get("x-api-client-id")?.trim().slice(0, MAX_CLIENT_ID_LENGTH) : null,
      onError: unhandled,
      record: metrics.record,
    })

  const drainMs = options.drainMs ?? 8_000
  // The worker stops claiming the moment shutdown starts, and its jobs drain alongside the
  // requests (same `drainMs`); the database closes only once both are done.
  let jobsStopped: Promise<void> | undefined
  const lifecycle = createLifecycle({
    drainMs,
    graceMs: options.graceMs,
    onShutdown: () => {
      jobsStopped = jobs.stop(drainMs)
      // Open event streams never finish on their own: end them now, so the drain does not wait.
      streams.closeAll()
    },
    cleanup: async () => {
      await (jobsStopped ?? jobs.stop(drainMs))
      try {
        await broadcaster.close()
      } finally {
        await db.close()
      }
    },
  })

  const server = Bun.serve({
    hostname: options.hostname,
    port: options.port,
    development: options.development,
    idleTimeout: options.idleTimeout,
    // Bun rejects larger bodies with 413 before any parsing; this is the server-wide ceiling, so
    // it must cover the largest thing any route accepts — a job application's CV.
    maxRequestBodySize: Math.max(options.maxBodyBytes, UPLOAD_MAX_BODY_BYTES, CV_MAX_BODY_BYTES),
    routes: {
      // Liveness: a static response Bun dispatches without running JS.
      "/health": new Response("OK"),
      // Readiness: the database answers and the server is not shutting down.
      "/ready": readyRoute(lifecycle, () => db.ping(), { timeoutMs: options.readyTimeoutMs }),
      // Token-gated, and outside `logged`/`protect`: never rate-limited, counted or access-logged.
      "/metrics": { GET: metricsRoute(metrics.registry, options.metricsToken) },
      "/rpc/*": logged(protect(withSizeCheck((req) => handle(rpc, "/rpc", req)))),
      // Docs and spec are open; every REST procedure under /openapi/* is protected.
      "/openapi": { GET: (req) => handle(openapi, "/openapi", req) },
      "/openapi/spec.json": { GET: (req) => handle(openapi, "/openapi", req) },
      "/openapi/*": logged(protect(withSizeCheck((req) => handle(openapi, "/openapi", req)))),
      // Spec and docs are open, like /openapi's; every other /v1 route needs an API key.
      [V1_SPEC_PATH]: { GET: (req) => v1(req, null) },
      [V1_DOCS_PATH]: { GET: (req) => v1(req, null) },
      // A request past its deadline answers /v1's shape too: 503 `internal`.
      "/v1/*": logged(v1Protected, {
        timeoutResponse: () => v1Error("internal", REQUEST_TIMEOUT_MESSAGE, { status: 503 }),
      }),
      "/v1": () => v1Error("not_found", NOT_FOUND_MESSAGE),
      // See `createEventsHandler`: idle timeout is off for the whole call (the guard, the rate
      // limiter and `authorize` all run before anything reaches the socket), and restored only
      // when the answer turns out not to be a stream.
      "/events/workspaces/:workspaceId": {
        GET: logged(createEventsHandler(protect, streams.handle, options.idleTimeout ?? 10), {
          deadline: false,
        }),
      },
      // The caller's own notifications: the same guard, limiter, caps and idle-timeout handling.
      "/events/me": {
        GET: logged(createEventsHandler(protect, streams.handleMe, options.idleTimeout ?? 10), {
          deadline: false,
        }),
      },
      // Deliberately outside `protect`: Stripe sends no bearer token and no x-api-client-id. The
      // signature over the raw body is the auth; `withSizeCheck` holds that body to
      // `maxBodyBytes` like every other non-upload request (the server-wide cap is 6 MB).
      "/billing/webhook": {
        POST: logged(
          withSizeCheck(
            createWebhookHandler({
              db,
              billing,
              log,
              recordFailure,
              enqueue,
              broadcaster,
              notificationEmail,
            })
          )
        ),
      },
    },
    fetch: notFound,
    // The logged routes answer their own throws (`unhandled`, inside the request context);
    // this catches the rest, with no request id.
    error: unhandled,
  })

  // After the listener is up: a startup failure (port in use) leaves no worker polling.
  if (options.jobsWorker !== false) jobs.start()

  // `db` is returned for tests that need a row the api cannot produce (an expired token);
  // `billing` so they can drive the provider directly (the mock's `change`); `superadminEmails` is
  // the live set, so a test can take an address away at runtime (the real revocation case);
  // `telemetry` is the provider new error rows are forwarded to; `analytics` the one new
  // pageviews/events are forwarded to; `storage` so a test can read back what a procedure stored;
  // `jobs` so a test can `drain()` the queue; `enqueue` for a test that builds its own
  // `RecordDeps` (recordServerError) outside a request; `broadcaster` so a test can
  // publish/subscribe directly, or check which bus was picked; `streams` to count open event
  // streams; `recordFailure` so an entrypoint that built `storage` before this function (its
  // `onForbidden` can only be wired up once this returns) can finish that wiring.
  return {
    server,
    lifecycle,
    db,
    billing,
    superadminEmails,
    telemetry,
    analytics,
    storage,
    jobs,
    enqueue,
    broadcaster,
    streams,
    recordFailure,
    metrics,
    stop: () => lifecycle.shutdown(server),
  }
}
