import { DEV_API_TOKEN } from "@repo/api-contract"
import { resolveServiceToken } from "@repo/service-kit"
import { BRAND_NAME, siteDomain, siteUrl } from "@repo/sites"
import { z } from "zod"
import { pemToPkcs8 } from "./oauth/provider"
import { ENCRYPTION_KEY_PATTERN } from "./two-factor/secret"

// Blank values in .env files arrive as "" and pasted secrets often carry a trailing newline:
// trim, and treat what is left empty as unset.
const optionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )

const TRUTHY_VALUES = ["true", "1", "yes", "on"]

// true/false, 1/0, yes/no, on/off (any case); blank counts as unset. Anything else is a typo that
// must not silently pick a side.
const booleanish = (fallback: boolean) =>
  optionalString
    .pipe(
      z
        .string()
        .toLowerCase()
        .pipe(z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]))
        .optional()
    )
    .transform((value) => (value === undefined ? fallback : TRUTHY_VALUES.includes(value)))

/**
 * The same truthy parsing as `booleanish`, for a raw value read outside `loadEnv` (the schedule
 * registry's lazy `enabled` checks for `BACKUP_ENABLED` and `STORAGE_SWEEP_ENABLED`, evaluated
 * per tick rather than at import time, so a test or a process that sets the variable later is
 * seen). Unset or blank is `fallback`. Never throws: an invalid value reads as "not enabled" here
 * rather than stopping the process (`loadEnv` refuses it at startup anyway).
 */
export function isEnvEnabled(value: string | undefined, fallback = false): boolean {
  const normalised = (value ?? "").trim().toLowerCase()
  if (normalised === "") return fallback
  return TRUTHY_VALUES.includes(normalised)
}

// An integer with a default, where a blank value (`KEY=` copied from .env.example) means unset
// rather than 0 — which would fail the range check, or worse, pass it.
const intOr = (fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  optionalString
    .pipe(z.coerce.number<string | undefined>().int().min(min).max(max).optional())
    .transform((value) => value ?? fallback)

export const DEFAULT_DATABASE_URL = "sqlite://.data/api.db"

const EnvSchema = z.object({
  // Bun never sets NODE_ENV, so an unset value must fail closed: `bun dev` opts into development.
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  HOST: z.string().default("api.brand.localhost"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3007),
  // Bun.sql reads the engine from the URL: sqlite:// and postgres:// are the tested ones.
  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  API_SERVICE_TOKEN: optionalString,
  API_ALLOWED_ORIGINS: csv,
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  API_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  // Sign-ups, api-wide (independent of the caller's client id, which a proxy-less deployment
  // cannot trust): each one mails a verify link, so a burst beyond this is refused for everyone.
  SIGNUP_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  SIGNUP_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  // Sign-ups per normalised address, per hour: repeats for one inbox and CONFLICT probes.
  SIGNUP_EMAIL_RATE_LIMIT: z.coerce.number().int().positive().default(3),
  // Magic-link requests, api-wide, for the same reason as SIGNUP_RATE_LIMIT. Silent when tripped.
  MAGIC_LINK_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  MAGIC_LINK_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  // Password-reset requests, api-wide (mail goes to existing accounts only). Silent when tripped.
  PASSWORD_RESET_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  // Telemetry events per browser (`telemetry:<ip hash>`) per minute; the per-app cap stays 3000.
  TELEMETRY_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  // Analytics ingest calls per client id per minute; the per-app cap stays 6000.
  ANALYTICS_RATE_LIMIT: intOr(120, 1),
  // How long analytics.prune keeps raw pageview/event rows; analytics_daily is kept indefinitely.
  ANALYTICS_RETENTION_DAYS: intOr(90, 1),
  // Analytics: the tables are always written; posthog/plausible also forward each pageview/event.
  ANALYTICS_PROVIDER: optionalString
    .pipe(z.enum(["store", "posthog", "plausible"]).optional())
    .transform((value) => value ?? "store"),
  POSTHOG_KEY: optionalString,
  POSTHOG_HOST: optionalString.pipe(z.string().url().optional()),
  PLAUSIBLE_DOMAIN: optionalString,
  PLAUSIBLE_HOST: optionalString.pipe(z.string().url().optional()),
  API_MAX_BODY_BYTES: z.coerce.number().int().positive().default(262_144),
  // Where password-reset links point: the auth app. Required in production (see loadEnv).
  AUTH_URL: optionalString.pipe(z.string().url().optional()),
  // Where account links in mail point (password-changed notice). Required in production.
  ACCOUNT_URL: optionalString.pipe(z.string().url().optional()),
  // The site's parent domain (@repo/sites). Mail links read it through siteUrl(); here it is
  // PASSKEY_RP_ID's default. Unset → brand.localhost.
  SITE_DOMAIN: optionalString,
  // The WebAuthn relying party id — the registrable domain a passkey is scoped to, shared by
  // every subdomain app. Unset → SITE_DOMAIN (normalised like @repo/sites does), else
  // brand.localhost. loadEnv refuses one that does not cover both the AUTH_URL and ACCOUNT_URL hosts.
  PASSKEY_RP_ID: optionalString,
  // The name shown by the browser's passkey prompt. Unset → BRAND_NAME.
  PASSKEY_RP_NAME: optionalString,
  // Where invitation links in mail point: the app. Required in production.
  APP_URL: optionalString.pipe(z.string().url().optional()),
  MAIL_PROVIDER: optionalString
    .pipe(z.enum(["log", "smtp", "resend", "file"]).optional())
    .transform((value) => value ?? "log"),
  MAIL_FROM: optionalString,
  // Where help-center support requests are mailed. Unset → MAIL_FROM's address (warned in
  // production, see index.ts).
  SUPPORT_EMAIL: optionalString.pipe(z.email().optional()),
  // Where job applications are mailed. Unset → where support requests go (SUPPORT_EMAIL, else
  // MAIL_FROM's address).
  HIRING_EMAIL: optionalString.pipe(z.email().optional()),
  SMTP_URL: optionalString,
  RESEND_API_KEY: optionalString,
  MAIL_DIR: optionalString,
  // Social sign-in: a provider is offered only when every one of its keys is set (see loadEnv).
  OAUTH_GOOGLE_CLIENT_ID: optionalString,
  OAUTH_GOOGLE_CLIENT_SECRET: optionalString,
  OAUTH_GITHUB_CLIENT_ID: optionalString,
  OAUTH_GITHUB_CLIENT_SECRET: optionalString,
  OAUTH_APPLE_CLIENT_ID: optionalString,
  OAUTH_APPLE_TEAM_ID: optionalString,
  OAUTH_APPLE_KEY_ID: optionalString,
  OAUTH_APPLE_PRIVATE_KEY: optionalString,
  // Billing: the keyless mock activates plans without payment; stripe needs every key below.
  BILLING_PROVIDER: optionalString
    .pipe(z.enum(["mock", "stripe"]).optional())
    .transform((value) => value ?? "mock"),
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PRICE_PRO_MONTH: optionalString,
  STRIPE_PRICE_PRO_YEAR: optionalString,
  STRIPE_PRICE_TEAM_MONTH: optionalString,
  STRIPE_PRICE_TEAM_YEAR: optionalString,
  // Platform admins: comma-separated emails. A listed address is a superadmin once it is verified.
  SUPERADMIN_EMAILS: csv,
  // Telemetry: errors and vitals always land in the api's tables; sentry also forwards errors.
  TELEMETRY_PROVIDER: optionalString
    .pipe(z.enum(["store", "sentry"]).optional())
    .transform((value) => value ?? "store"),
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString,
  // Encrypts the stored TOTP secret (AES-256-GCM), 32 bytes base64. Required in production; a
  // fixed dev key otherwise. Not derived from API_SERVICE_TOKEN — rotating that would lock every
  // 2FA user out.
  TWO_FACTOR_ENCRYPTION_KEY: optionalString,
  // Storage: files on disk by default; any S3-compatible bucket with s3 (see loadEnv).
  STORAGE_PROVIDER: optionalString
    .pipe(z.enum(["local", "s3"]).optional())
    .transform((value) => value ?? "local"),
  STORAGE_DIR: optionalString.transform((value) => value ?? ".data/storage"),
  // Serve files from a public bucket or CDN instead of the apps' /files route.
  STORAGE_PUBLIC_URL: optionalString
    .pipe(z.string().url().optional())
    .transform((value) => value?.replace(/\/+$/, "")),
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ENDPOINT: optionalString.pipe(z.string().url().optional()),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  // Background jobs: run the worker and scheduler in this process (false when a dedicated
  // `bun src/worker.ts` process runs them), how many jobs at once, and how often to poll.
  JOBS_WORKER: booleanish(true),
  JOBS_CONCURRENCY: intOr(4, 1, 50),
  JOBS_POLL_MS: intOr(1000, 100, 60_000),
  // How many webhook.deliver jobs one process runs at once (1 to JOBS_CONCURRENCY; loadEnv checks
  // the upper bound, and an unset value never exceeds JOBS_CONCURRENCY), so a flood of slow
  // endpoints leaves the other slots to mail and every other job.
  WEBHOOK_CONCURRENCY: intOr(2, 1, 50),
  // Nightly backups (backup.run, 0 2 * * *): off by default — a deployment opts in once it has
  // somewhere the bucket actually persists. BACKUP_RETENTION_DAYS is how long backup.run keeps its
  // own objects under backups/ (it prunes older ones itself; storage.sweep never looks there).
  BACKUP_ENABLED: booleanish(false),
  BACKUP_RETENTION_DAYS: intOr(14, 1, 365),
  // storage.sweep (30 3 * * *) on by default; false pauses it without stopping every other job —
  // after a restore, until the bucket and the database agree again (docs/guides/operations.md).
  STORAGE_SWEEP_ENABLED: booleanish(true),
  // Outgoing webhooks to http/https on localhost and *.localhost (dialled at 127.0.0.1): off unless
  // set, in every NODE_ENV. For local development and the e2e stack only — never a real deployment
  // (the api and the worker warn at startup when it is on in production).
  WEBHOOK_ALLOW_LOCALHOST_HTTP: booleanish(false),
  // audit.prune (45 3 * * *): how long audit rows keep their ip/user_agent (default 90) before
  // audit.prune nulls them, and how long the whole row lives (default 365, 180-1095, CNIL's
  // general case to its internal-control maximum) before audit.prune deletes it. loadEnv checks
  // the cross-field order (pii strictly < row) and the row bound (raised to 3650 only with
  // AUDIT_RETENTION_JUSTIFIED=true).
  AUDIT_PII_RETENTION_DAYS: intOr(90, 1),
  AUDIT_RETENTION_DAYS: intOr(365, 1),
  // Lets AUDIT_RETENTION_DAYS go up to 3650 instead of 1095; loadEnv then warns once at startup
  // that the longer period should be documented (a legal obligation or a DPIA).
  AUDIT_RETENTION_JUSTIFIED: booleanish(false),
  // Realtime: which bus publishes/subscribes events. Unset → picked from the database dialect
  // (sqlite → memory, postgres → postgres); set to override either way.
  REALTIME_BUS: optionalString.pipe(z.enum(["memory", "postgres"]).optional()),
  // Process-wide cap on open event streams (Task 2's /events endpoint); beyond it, 503.
  REALTIME_MAX_STREAMS: intOr(1000, 1),
  // How long `/ready` (and the dedicated worker's `/health`) waits for the database ping before
  // answering 503 — a paused Postgres would otherwise leave the probe hanging.
  READY_TIMEOUT_MS: intOr(2_000, 100, 60_000),
  // The server-side request deadline: a request the handler has not answered by then gets 503
  // "The request took too long. It may still complete — check before retrying." (the handler
  // keeps running and may still commit a mutation; its result is discarded). Event streams are
  // exempt.
  REQUEST_TIMEOUT_MS: intOr(30_000, 1_000, 600_000),
  // The bearer `/metrics` requires (api and worker). Unset → `/metrics` answers 404.
  METRICS_TOKEN: optionalString.pipe(z.string().min(24).optional()),
  // Logs: passed through to @repo/log's createLogger, which validates them itself (an invalid
  // value falls back to the default with one warning line rather than stopping the process).
  // LOG_LEVEL debug|info|warn|error (default info); LOG_FORMAT json|pretty (default json in
  // production, pretty otherwise).
  LOG_LEVEL: optionalString,
  LOG_FORMAT: optionalString,
  // Test-only (apps/load's slow-query drill): every database statement waits this long first.
  // Honoured only outside production; loadEnv zeroes it (with one warning) when NODE_ENV is
  // production, so a stray value in a deployment's env can never slow it down.
  API_TEST_QUERY_DELAY_MS: intOr(0, 0, 10_000),
})

/** Characters a URL that goes into a mail header may never hold. */
export const UNSAFE_HEADER_URL = /[\s<>]/

/**
 * The base URLs that reach mail headers (AUTH_URL in List-Unsubscribe) or `<url>` links: a CR/LF,
 * an angle bracket or any whitespace could split a header or break the URL out of its brackets.
 */
const HEADER_URLS = ["AUTH_URL", "ACCOUNT_URL"] as const

function assertHeaderSafeUrl(name: string, value: string | undefined) {
  if (value && UNSAFE_HEADER_URL.test(value))
    throw new Error(`${name} must not contain whitespace, CR, LF, "<" or ">"`)
}

export const DEV_AUTH_URL = "http://auth.brand.localhost:3002"
export const DEV_ACCOUNT_URL = siteUrl("account", {})
export const DEV_APP_URL = siteUrl("app", {})
export const DEV_MAIL_FROM = `${BRAND_NAME} <no-reply@brand.localhost>`
// 32 zero-free bytes (1..32), base64 — a fixed, valid AES-256-GCM key for development and test.
export const DEV_TWO_FACTOR_KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=" // gitleaks:allow
// The relying party id a server started without one uses (tests, the dev stack): SITE_DOMAIN's own
// fallback, the dev parent domain (see @repo/sites' DEV_DOMAIN).
export const DEV_PASSKEY_RP_ID = "brand.localhost"

/**
 * Whether a WebAuthn relying party id is usable from `host`: the browser accepts an RP ID equal to
 * the page's host or one of its parent domains, nothing else. A single-label RP ID (`localhost`,
 * `com`) only ever covers itself: as a parent it is a top-level name the browser refuses, so
 * accepting it here would let a misconfigured stack boot with passkeys that never work.
 */
export function rpIdCovers(rpId: string, host: string): boolean {
  const id = rpId.toLowerCase()
  const name = host.toLowerCase()
  if (name === id) return true
  return id.includes(".") && name.endsWith(`.${id}`)
}

/** The bare address of a `Name <address>` sender (or the value itself when it has no brackets). */
export function mailAddress(from: string): string {
  return (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim()
}

/** Where support requests go: SUPPORT_EMAIL, else MAIL_FROM's address. */
export const supportEmailOf = (env: Pick<Env, "SUPPORT_EMAIL" | "MAIL_FROM">) =>
  env.SUPPORT_EMAIL ?? mailAddress(env.MAIL_FROM)

/** Where job applications go: HIRING_EMAIL, else wherever support requests go. */
export const hiringEmailOf = (env: Pick<Env, "HIRING_EMAIL" | "SUPPORT_EMAIL" | "MAIL_FROM">) =>
  env.HIRING_EMAIL ?? supportEmailOf(env)

export type Env = Omit<
  z.infer<typeof EnvSchema>,
  | "API_SERVICE_TOKEN"
  | "AUTH_URL"
  | "ACCOUNT_URL"
  | "APP_URL"
  | "MAIL_FROM"
  | "TWO_FACTOR_ENCRYPTION_KEY"
  | "PASSKEY_RP_ID"
  | "PASSKEY_RP_NAME"
> & {
  API_SERVICE_TOKEN: string
  AUTH_URL: string
  ACCOUNT_URL: string
  APP_URL: string
  MAIL_FROM: string
  TWO_FACTOR_ENCRYPTION_KEY: string
  PASSKEY_RP_ID: string
  PASSKEY_RP_NAME: string
}

type ParsedEnv = z.infer<typeof EnvSchema>

/** A provider's keys go together: some but not all of them set is a misconfiguration, not "off". */
function requireGroup(env: ParsedEnv, keys: (keyof ParsedEnv)[]): void {
  const present = keys.filter((key) => env[key] !== undefined)
  const missing = keys.filter((key) => env[key] === undefined)
  if (present.length > 0 && missing.length > 0) {
    throw new Error(`${missing.join(", ")} is not set (needed with ${present.join(", ")})`)
  }
}

const STRIPE_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTH",
  "STRIPE_PRICE_PRO_YEAR",
  "STRIPE_PRICE_TEAM_MONTH",
  "STRIPE_PRICE_TEAM_YEAR",
] as const satisfies (keyof ParsedEnv)[]

export const QUERY_DELAY_IGNORED_MESSAGE =
  "⚠ API_TEST_QUERY_DELAY_MS is ignored in production (a test-only slow-query hook)."

/** CNIL 2021-122's general case: six months to one year, up to three years for documented internal control. */
export const AUDIT_RETENTION_MIN_DAYS = 180
export const AUDIT_RETENTION_DEFAULT_MAX_DAYS = 1095
/** Only reachable with AUDIT_RETENTION_JUSTIFIED=true. */
export const AUDIT_RETENTION_JUSTIFIED_MAX_DAYS = 3650

export const AUDIT_RETENTION_JUSTIFIED_MESSAGE =
  "⚠ AUDIT_RETENTION_JUSTIFIED is true: document the legal obligation or DPIA that justifies " +
  "keeping audit_log rows longer than 1095 days."

/**
 * Parses and validates configuration. Bun loads .env files into Bun.env on its own. `warn`
 * receives the one startup warning loadEnv itself can raise (a test-only setting ignored in
 * production, or AUDIT_RETENTION_JUSTIFIED); it defaults to `console.warn`.
 */
export function loadEnv(
  source: Record<string, string | undefined>,
  { warn = (message: string) => console.warn(message) }: { warn?: (message: string) => void } = {}
): Env {
  // Checked on the raw value (only its ends trimmed, like every other string here): zod's URL
  // parsing silently drops an embedded tab or newline, which must be refused, not repaired.
  for (const name of HEADER_URLS) assertHeaderSafeUrl(name, source[name]?.trim())
  const env = EnvSchema.parse(source)
  if (env.API_TEST_QUERY_DELAY_MS > 0 && env.NODE_ENV === "production") {
    warn(QUERY_DELAY_IGNORED_MESSAGE)
    env.API_TEST_QUERY_DELAY_MS = 0
  }
  // audit.prune: AUDIT_PII_RETENTION_DAYS must leave a gap before AUDIT_RETENTION_DAYS (a row
  // that is about to be deleted need not also be stripped first), and AUDIT_RETENTION_DAYS stays
  // within CNIL's general case unless the operator opts into documenting a longer one.
  const auditRetentionMax = env.AUDIT_RETENTION_JUSTIFIED
    ? AUDIT_RETENTION_JUSTIFIED_MAX_DAYS
    : AUDIT_RETENTION_DEFAULT_MAX_DAYS
  if (
    env.AUDIT_RETENTION_DAYS < AUDIT_RETENTION_MIN_DAYS ||
    env.AUDIT_RETENTION_DAYS > auditRetentionMax
  ) {
    throw new Error(
      `AUDIT_RETENTION_DAYS must be between ${AUDIT_RETENTION_MIN_DAYS} and ${auditRetentionMax}` +
        (env.AUDIT_RETENTION_JUSTIFIED
          ? ""
          : " (set AUDIT_RETENTION_JUSTIFIED=true to document a longer period, up to " +
            `${AUDIT_RETENTION_JUSTIFIED_MAX_DAYS})`)
    )
  }
  if (env.AUDIT_PII_RETENTION_DAYS >= env.AUDIT_RETENTION_DAYS) {
    throw new Error("AUDIT_PII_RETENTION_DAYS must be strictly less than AUDIT_RETENTION_DAYS")
  }
  if (env.AUDIT_RETENTION_JUSTIFIED) warn(AUDIT_RETENTION_JUSTIFIED_MESSAGE)
  if (!source.WEBHOOK_CONCURRENCY?.trim()) {
    env.WEBHOOK_CONCURRENCY = Math.min(env.WEBHOOK_CONCURRENCY, env.JOBS_CONCURRENCY)
  } else if (env.WEBHOOK_CONCURRENCY > env.JOBS_CONCURRENCY) {
    throw new Error(
      `WEBHOOK_CONCURRENCY must be between 1 and JOBS_CONCURRENCY (${env.JOBS_CONCURRENCY})`
    )
  }
  const token = resolveServiceToken({
    given: env.API_SERVICE_TOKEN,
    devToken: DEV_API_TOKEN,
    nodeEnv: env.NODE_ENV,
    name: "API_SERVICE_TOKEN",
  })
  // A dev default in production would mail every user a link to a host that does not exist.
  if (!env.AUTH_URL && env.NODE_ENV === "production") throw new Error("AUTH_URL is not set")
  const authUrl = (env.AUTH_URL ?? DEV_AUTH_URL).replace(/\/+$/, "")
  if (!env.ACCOUNT_URL && env.NODE_ENV === "production") throw new Error("ACCOUNT_URL is not set")
  const accountUrl = (env.ACCOUNT_URL ?? DEV_ACCOUNT_URL).replace(/\/+$/, "")
  // …and once more after the defaults and trailing-slash trim, belt and braces.
  assertHeaderSafeUrl("AUTH_URL", authUrl)
  assertHeaderSafeUrl("ACCOUNT_URL", accountUrl)
  if (!env.APP_URL && env.NODE_ENV === "production") throw new Error("APP_URL is not set")
  const appUrl = (env.APP_URL ?? DEV_APP_URL).replace(/\/+$/, "")
  if (env.MAIL_PROVIDER === "smtp" && !env.SMTP_URL)
    throw new Error("MAIL_PROVIDER=smtp needs SMTP_URL")
  if (env.MAIL_PROVIDER === "resend" && !env.RESEND_API_KEY)
    throw new Error("MAIL_PROVIDER=resend needs RESEND_API_KEY")
  if (env.MAIL_PROVIDER === "file" && !env.MAIL_DIR)
    throw new Error("MAIL_PROVIDER=file needs MAIL_DIR")
  // The dev sender is a placeholder domain; a real provider refuses it, so production must set it.
  if (
    (env.MAIL_PROVIDER === "smtp" || env.MAIL_PROVIDER === "resend") &&
    env.NODE_ENV === "production" &&
    !env.MAIL_FROM
  ) {
    throw new Error("MAIL_FROM is not set")
  }
  const mailFrom = env.MAIL_FROM ?? DEV_MAIL_FROM
  requireGroup(env, ["OAUTH_GOOGLE_CLIENT_ID", "OAUTH_GOOGLE_CLIENT_SECRET"])
  requireGroup(env, ["OAUTH_GITHUB_CLIENT_ID", "OAUTH_GITHUB_CLIENT_SECRET"])
  requireGroup(env, [
    "OAUTH_APPLE_CLIENT_ID",
    "OAUTH_APPLE_TEAM_ID",
    "OAUTH_APPLE_KEY_ID",
    "OAUTH_APPLE_PRIVATE_KEY",
  ])
  if (env.BILLING_PROVIDER === "stripe") {
    const missing = STRIPE_KEYS.filter((key) => env[key] === undefined)
    if (missing.length > 0) throw new Error(`BILLING_PROVIDER=stripe needs ${missing.join(", ")}`)
  }
  if (env.TELEMETRY_PROVIDER === "sentry" && !env.SENTRY_DSN) {
    throw new Error("TELEMETRY_PROVIDER=sentry needs SENTRY_DSN")
  }
  if (env.ANALYTICS_PROVIDER === "posthog") {
    const missing = (["POSTHOG_KEY", "POSTHOG_HOST"] as const).filter((key) => !env[key])
    if (missing.length > 0) {
      throw new Error(`ANALYTICS_PROVIDER=posthog needs ${missing.join(", ")}`)
    }
  }
  if (env.ANALYTICS_PROVIDER === "plausible") {
    const missing = (["PLAUSIBLE_DOMAIN", "PLAUSIBLE_HOST"] as const).filter((key) => !env[key])
    if (missing.length > 0) {
      throw new Error(`ANALYTICS_PROVIDER=plausible needs ${missing.join(", ")}`)
    }
  }
  if (env.STORAGE_PROVIDER === "s3") {
    const missing = (
      ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const
    ).filter((key) => !env[key])
    if (missing.length > 0) throw new Error(`STORAGE_PROVIDER=s3 needs ${missing.join(", ")}`)
  }
  // The shared CSP's img-src allows https: only (besides 'self'), so a plain-http file host would
  // serve images no browser shows. *.localhost stays allowed for a local production-mode stack.
  if (env.STORAGE_PUBLIC_URL && env.NODE_ENV === "production") {
    const { protocol, hostname } = new URL(env.STORAGE_PUBLIC_URL)
    const local = hostname === "localhost" || hostname.endsWith(".localhost")
    if (protocol !== "https:" && !local) throw new Error("STORAGE_PUBLIC_URL must use https")
  }
  if (env.OAUTH_APPLE_PRIVATE_KEY) {
    try {
      pemToPkcs8(env.OAUTH_APPLE_PRIVATE_KEY)
    } catch {
      // Never echo the value: it is a private key.
      throw new Error("OAUTH_APPLE_PRIVATE_KEY is not a PKCS#8 PEM")
    }
  }
  if (!env.TWO_FACTOR_ENCRYPTION_KEY && env.NODE_ENV === "production") {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY is not set")
  }
  // The public dev key is printed in this file and in .env.example: using it in production would
  // let anyone decrypt every stored TOTP secret.
  if (env.NODE_ENV === "production" && env.TWO_FACTOR_ENCRYPTION_KEY === DEV_TWO_FACTOR_KEY) {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY must not be the development key")
  }
  const twoFactorKey = env.TWO_FACTOR_ENCRYPTION_KEY ?? DEV_TWO_FACTOR_KEY
  if (!ENCRYPTION_KEY_PATTERN.test(twoFactorKey)) {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY must decode to 32 bytes")
  }
  // The relying party id: PASSKEY_RP_ID when set, else the site's parent domain (SITE_DOMAIN,
  // brand.localhost when unset). The browser refuses every ceremony on a page whose host the RP ID
  // does not cover, and that failure reads exactly like a cancelled prompt, so a mismatch stops
  // the api here instead of shipping a feature that silently never works.
  // Lowercased: the library hashes the RP ID as given, and the browser's is always lowercase.
  const passkeyRpId = (
    env.PASSKEY_RP_ID ?? siteDomain({ SITE_DOMAIN: env.SITE_DOMAIN })
  ).toLowerCase()
  const authHost = new URL(authUrl).hostname
  const accountHost = new URL(accountUrl).hostname
  if (!rpIdCovers(passkeyRpId, authHost) || !rpIdCovers(passkeyRpId, accountHost)) {
    throw new Error(
      `PASSKEY_RP_ID "${passkeyRpId}" must equal, or be a parent domain of, both the AUTH_URL host ` +
        `(${authHost}) and the ACCOUNT_URL host (${accountHost}): set SITE_DOMAIN or PASSKEY_RP_ID`
    )
  }
  const passkeyRpName = env.PASSKEY_RP_NAME ?? BRAND_NAME
  return {
    ...env,
    API_SERVICE_TOKEN: token,
    AUTH_URL: authUrl,
    ACCOUNT_URL: accountUrl,
    APP_URL: appUrl,
    MAIL_FROM: mailFrom,
    TWO_FACTOR_ENCRYPTION_KEY: twoFactorKey,
    PASSKEY_RP_ID: passkeyRpId,
    PASSKEY_RP_NAME: passkeyRpName,
  }
}
