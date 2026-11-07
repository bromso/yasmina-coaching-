import { createMemoryRateLimiter, isDevLike } from "@repo/service-kit"
import type { AnalyticsProvider } from "./analytics/providers/provider"
import { createBillingFactory } from "./billing/create-provider"
import { bookingEmailOf, type Env, hiringEmailOf, supportEmailOf } from "./env"
import type { Mailer } from "./mail/mailer"
import { createProviders } from "./oauth/providers"
import type { ServerOptions } from "./server"
import type { Storage } from "./storage/storage"
import type { TelemetryProvider } from "./telemetry/provider"

/** What `index.ts` builds before the server (each may exit the process on bad config). */
export type ServerDeps = {
  mailer: Mailer
  storage: Storage
  telemetry: TelemetryProvider
  analytics: AnalyticsProvider
}

/**
 * Every `createServer` option the environment decides. Kept out of `index.ts` (which starts the
 * process on import) so a test can check that a parsed setting actually reaches the server.
 */
export function serverOptionsFromEnv(env: Env, deps: ServerDeps): ServerOptions {
  return {
    hostname: env.HOST,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    queryDelayMs: env.API_TEST_QUERY_DELAY_MS,
    development: env.NODE_ENV === "development",
    token: env.API_SERVICE_TOKEN,
    allowedOrigins: env.API_ALLOWED_ORIGINS,
    allowLocalhostOrigins: isDevLike(env.NODE_ENV),
    rateLimiter: createMemoryRateLimiter({
      limit: env.API_RATE_LIMIT,
      windowMs: env.API_RATE_WINDOW_SECONDS * 1000,
    }),
    maxBodyBytes: env.API_MAX_BODY_BYTES,
    authUrl: env.AUTH_URL,
    accountUrl: env.ACCOUNT_URL,
    appUrl: env.APP_URL,
    supportEmail: supportEmailOf(env),
    hiringEmail: hiringEmailOf(env),
    bookingEmail: bookingEmailOf(env),
    twoFactorEncryptionKey: env.TWO_FACTOR_ENCRYPTION_KEY,
    passkeyRpId: env.PASSKEY_RP_ID,
    passkeyRpName: env.PASSKEY_RP_NAME,
    mailer: deps.mailer,
    storage: deps.storage,
    storagePublicUrl: env.STORAGE_PUBLIC_URL,
    providers: createProviders(env, env.AUTH_URL),
    billing: createBillingFactory(env),
    superadminEmails: env.SUPERADMIN_EMAILS,
    signUpLimiter: createMemoryRateLimiter({
      limit: env.SIGNUP_RATE_LIMIT,
      windowMs: env.SIGNUP_RATE_WINDOW_SECONDS * 1000,
    }),
    signUpEmailLimiter: createMemoryRateLimiter({
      limit: env.SIGNUP_EMAIL_RATE_LIMIT,
      windowMs: 60 * 60_000,
    }),
    resetGlobalLimiter: createMemoryRateLimiter({
      limit: env.PASSWORD_RESET_RATE_LIMIT,
      windowMs: env.PASSWORD_RESET_RATE_WINDOW_SECONDS * 1000,
    }),
    telemetryLimiter: createMemoryRateLimiter({
      limit: env.TELEMETRY_RATE_LIMIT,
      windowMs: 60_000,
    }),
    analyticsLimiter: createMemoryRateLimiter({
      limit: env.ANALYTICS_RATE_LIMIT,
      windowMs: 60_000,
    }),
    analyticsRetentionDays: env.ANALYTICS_RETENTION_DAYS,
    backupRetentionDays: env.BACKUP_RETENTION_DAYS,
    auditPiiRetentionDays: env.AUDIT_PII_RETENTION_DAYS,
    auditRetentionDays: env.AUDIT_RETENTION_DAYS,
    analytics: deps.analytics,
    magicGlobalLimiter: createMemoryRateLimiter({
      limit: env.MAGIC_LINK_RATE_LIMIT,
      windowMs: env.MAGIC_LINK_RATE_WINDOW_SECONDS * 1000,
    }),
    telemetry: deps.telemetry,
    jobsWorker: env.JOBS_WORKER,
    jobsConcurrency: env.JOBS_CONCURRENCY,
    jobsPollMs: env.JOBS_POLL_MS,
    webhookConcurrency: env.WEBHOOK_CONCURRENCY,
    realtimeBus: env.REALTIME_BUS,
    realtimeMaxStreams: env.REALTIME_MAX_STREAMS,
    metricsToken: env.METRICS_TOKEN,
    readyTimeoutMs: env.READY_TIMEOUT_MS,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    // An explicit opt-in (local development, e2e): the only way localhost delivery is turned on.
    webhookAllowLocalhostHttp: env.WEBHOOK_ALLOW_LOCALHOST_HTTP,
  }
}
