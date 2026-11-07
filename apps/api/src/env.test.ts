import { describe, expect, test } from "bun:test"
import { DEV_API_TOKEN } from "@repo/api-contract"
import { BRAND_NAME } from "@repo/sites"
import {
  AUDIT_RETENTION_JUSTIFIED_MESSAGE,
  DEV_TWO_FACTOR_KEY,
  hiringEmailOf,
  loadEnv,
  mailAddress,
  QUERY_DELAY_IGNORED_MESSAGE,
  rpIdCovers,
  supportEmailOf,
} from "./env"

// Production tokens must be at least 32 characters.
const prodToken = "p".repeat(32)
const AUTH_URL = "https://auth.example.com"
const ACCOUNT_URL = "https://account.example.com"
// The parent domain of the three URLs above: PASSKEY_RP_ID defaults to it and must cover them.
const SITE_DOMAIN = "example.com"
const APP_URL = "https://app.example.com"
// A valid 32-byte key that is deliberately not DEV_TWO_FACTOR_KEY, for fixtures that need a
// production-valid value but aren't testing the key itself.
const PROD_TWO_FACTOR_KEY = Buffer.alloc(32, 7).toString("base64")

test("NODE_ENV defaults to production, which requires a token", () => {
  expect(() => loadEnv({})).toThrow("API_SERVICE_TOKEN is required in production")
})

test("development defaults", () => {
  expect(loadEnv({ NODE_ENV: "development" })).toMatchObject({
    HOST: "api.brand.localhost",
    PORT: 3007,
    DATABASE_URL: "sqlite://.data/api.db",
    API_SERVICE_TOKEN: DEV_API_TOKEN,
    API_ALLOWED_ORIGINS: [],
    API_RATE_LIMIT: 300,
    API_RATE_WINDOW_SECONDS: 60,
    API_MAX_BODY_BYTES: 262_144,
    AUTH_URL: "http://auth.brand.localhost:3002",
  })
})

test("a blank token counts as missing", () => {
  expect(() => loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: "" })).toThrow(
    "API_SERVICE_TOKEN is required in production"
  )
})

test("API_ALLOWED_ORIGINS is a trimmed comma-separated list", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
    API_ALLOWED_ORIGINS: " https://a.example , https://b.example,",
  })
  expect(env.API_ALLOWED_ORIGINS).toEqual(["https://a.example", "https://b.example"])
})

test("the token is trimmed of surrounding whitespace", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    API_SERVICE_TOKEN: ` ${prodToken}\n`,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
  })
  expect(env.API_SERVICE_TOKEN).toBe(prodToken)
})

test("a whitespace-only token counts as missing", () => {
  expect(() => loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: " \n\t " })).toThrow(
    "API_SERVICE_TOKEN is required in production"
  )
})

test("production requires AUTH_URL; a blank one counts as missing", () => {
  expect(() => loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: prodToken })).toThrow(
    "AUTH_URL is not set"
  )
  expect(() =>
    loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: prodToken, AUTH_URL: " " })
  ).toThrow("AUTH_URL is not set")
})

test("a set AUTH_URL is kept, trailing slashes stripped", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL: "https://auth.example.com//",
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
  })
  expect(env.AUTH_URL).toBe("https://auth.example.com")
})

test("MAIL_PROVIDER defaults to log with a dev MAIL_FROM", () => {
  const env = loadEnv({ NODE_ENV: "development" })
  expect(env.MAIL_PROVIDER).toBe("log")
  expect(env.MAIL_FROM).toBe(`${BRAND_NAME} <no-reply@brand.localhost>`)
})

test("a blank or newline-padded MAIL_PROVIDER is read like the other vars", () => {
  expect(loadEnv({ NODE_ENV: "development", MAIL_PROVIDER: "" }).MAIL_PROVIDER).toBe("log")
  expect(loadEnv({ NODE_ENV: "development", MAIL_PROVIDER: "  " }).MAIL_PROVIDER).toBe("log")
  expect(() =>
    loadEnv({ NODE_ENV: "development", MAIL_PROVIDER: "smtp\n", SMTP_URL: "smtp://x" })
  ).not.toThrow()
  expect(() => loadEnv({ NODE_ENV: "development", MAIL_PROVIDER: "carrier-pigeon" })).toThrow()
})

test("smtp without SMTP_URL and resend without RESEND_API_KEY are rejected", () => {
  expect(() => loadEnv({ NODE_ENV: "development", MAIL_PROVIDER: "smtp" })).toThrow(/SMTP_URL/)
  expect(() => loadEnv({ NODE_ENV: "development", MAIL_PROVIDER: "resend" })).toThrow(
    /RESEND_API_KEY/
  )
})

test("a non-log provider without MAIL_FROM is rejected in production; a blank one counts as missing", () => {
  expect(() =>
    loadEnv({
      NODE_ENV: "production",
      API_SERVICE_TOKEN: prodToken,
      AUTH_URL,
      ACCOUNT_URL,
      SITE_DOMAIN,
      APP_URL,
      MAIL_PROVIDER: "resend",
      RESEND_API_KEY: "k",
      MAIL_FROM: "",
    })
  ).toThrow(/MAIL_FROM/)
})

test("ACCOUNT_URL is required in production and defaults in development", () => {
  expect(() => loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: prodToken, AUTH_URL })).toThrow(
    /ACCOUNT_URL/
  )
  expect(loadEnv({ NODE_ENV: "development" }).ACCOUNT_URL).toBe(
    "http://account.brand.localhost:3003"
  )
})

test("APP_URL is required in production and defaults in development", () => {
  expect(() =>
    loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: prodToken, AUTH_URL, ACCOUNT_URL })
  ).toThrow("APP_URL is not set")
  expect(loadEnv({ NODE_ENV: "development" }).APP_URL).toBe("http://app.brand.localhost:3001")
  const env = loadEnv({
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL: "https://app.example.com/",
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
  })
  expect(env.APP_URL).toBe("https://app.example.com")
})

const OAUTH_KEYS = [
  "OAUTH_GOOGLE_CLIENT_ID",
  "OAUTH_GOOGLE_CLIENT_SECRET",
  "OAUTH_GITHUB_CLIENT_ID",
  "OAUTH_GITHUB_CLIENT_SECRET",
  "OAUTH_APPLE_CLIENT_ID",
  "OAUTH_APPLE_TEAM_ID",
  "OAUTH_APPLE_KEY_ID",
  "OAUTH_APPLE_PRIVATE_KEY",
] as const
const PEM_BODY = Buffer.from("not really a key, but valid base64").toString("base64")
const apple = {
  OAUTH_APPLE_CLIENT_ID: "com.example.web",
  OAUTH_APPLE_TEAM_ID: "TEAM",
  OAUTH_APPLE_KEY_ID: "KEY",
}

test("no OAuth config leaves every provider unset", () => {
  const env = loadEnv({ NODE_ENV: "development" })
  for (const key of OAUTH_KEYS) expect(env[key]).toBeUndefined()
})

test("a partially configured provider names the missing key", () => {
  expect(() => loadEnv({ NODE_ENV: "development", OAUTH_GOOGLE_CLIENT_ID: "g" })).toThrow(
    /OAUTH_GOOGLE_CLIENT_SECRET is not set \(needed with OAUTH_GOOGLE_CLIENT_ID\)/
  )
  expect(() =>
    loadEnv({
      NODE_ENV: "development",
      OAUTH_GITHUB_CLIENT_SECRET: "hs",
      OAUTH_GOOGLE_CLIENT_ID: " ",
    })
  ).toThrow(/OAUTH_GITHUB_CLIENT_ID/)
  expect(() => loadEnv({ NODE_ENV: "development", ...apple })).toThrow(/OAUTH_APPLE_PRIVATE_KEY/)
})

test("a fully configured provider is kept", () => {
  const env = loadEnv({
    NODE_ENV: "development",
    OAUTH_GITHUB_CLIENT_ID: "h",
    OAUTH_GITHUB_CLIENT_SECRET: "hs\n",
  })
  expect(env.OAUTH_GITHUB_CLIENT_ID).toBe("h")
  expect(env.OAUTH_GITHUB_CLIENT_SECRET).toBe("hs")
})

test("an Apple key that is not a PKCS#8 PEM is rejected", () => {
  for (const key of [
    "not a key!",
    `-----BEGIN EC PRIVATE KEY-----\n${PEM_BODY}\n-----END EC PRIVATE KEY-----`, // gitleaks:allow
  ]) {
    expect(() =>
      loadEnv({ NODE_ENV: "development", ...apple, OAUTH_APPLE_PRIVATE_KEY: key })
    ).toThrow("OAUTH_APPLE_PRIVATE_KEY is not a PKCS#8 PEM")
  }
})

test("a \\n-escaped single-line Apple PEM is accepted", () => {
  const key = `-----BEGIN PRIVATE KEY-----\\n${PEM_BODY}\\n-----END PRIVATE KEY-----`
  const env = loadEnv({ NODE_ENV: "development", ...apple, OAUTH_APPLE_PRIVATE_KEY: key })
  expect(env.OAUTH_APPLE_PRIVATE_KEY).toBe(key)
})

const STRIPE = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_PRO_MONTH: "price_pm",
  STRIPE_PRICE_PRO_YEAR: "price_py",
  STRIPE_PRICE_TEAM_MONTH: "price_tm",
  STRIPE_PRICE_TEAM_YEAR: "price_ty",
}

test("BILLING_PROVIDER defaults to mock; a blank one counts as unset", () => {
  expect(loadEnv({ NODE_ENV: "development" }).BILLING_PROVIDER).toBe("mock")
  expect(loadEnv({ NODE_ENV: "development", BILLING_PROVIDER: " \n" }).BILLING_PROVIDER).toBe(
    "mock"
  )
  expect(() => loadEnv({ NODE_ENV: "development", BILLING_PROVIDER: "paypal" })).toThrow()
})

test("BILLING_PROVIDER=stripe names exactly the missing Stripe keys", () => {
  expect(() => loadEnv({ NODE_ENV: "development", BILLING_PROVIDER: "stripe" })).toThrow(
    "BILLING_PROVIDER=stripe needs STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTH, STRIPE_PRICE_PRO_YEAR, STRIPE_PRICE_TEAM_MONTH, STRIPE_PRICE_TEAM_YEAR"
  )
  const { STRIPE_WEBHOOK_SECRET: _w, STRIPE_PRICE_TEAM_YEAR: _t, ...partial } = STRIPE
  let message = ""
  try {
    loadEnv({ NODE_ENV: "development", BILLING_PROVIDER: "stripe", ...partial })
  } catch (error) {
    message = (error as Error).message
  }
  expect(message).toBe(
    "BILLING_PROVIDER=stripe needs STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_TEAM_YEAR"
  )
})

test("BILLING_PROVIDER=stripe with all six keys loads them", () => {
  const env = loadEnv({ NODE_ENV: "development", BILLING_PROVIDER: "stripe", ...STRIPE })
  expect(env).toMatchObject({ BILLING_PROVIDER: "stripe", ...STRIPE })
})

test("mock billing ignores Stripe keys that are only partly set", () => {
  expect(loadEnv({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk" }).BILLING_PROVIDER).toBe(
    "mock"
  )
})

test("MAIL_PROVIDER=file needs MAIL_DIR", () => {
  expect(() => loadEnv({ NODE_ENV: "test", MAIL_PROVIDER: "file" })).toThrow(
    "MAIL_PROVIDER=file needs MAIL_DIR"
  )
  expect(loadEnv({ NODE_ENV: "test", MAIL_PROVIDER: "file", MAIL_DIR: "/tmp/m" }).MAIL_DIR).toBe(
    "/tmp/m"
  )
})

test("SUPERADMIN_EMAILS splits on commas, trims, drops blanks; unset is nobody", () => {
  expect(loadEnv({ NODE_ENV: "test" }).SUPERADMIN_EMAILS).toEqual([])
  expect(
    loadEnv({ NODE_ENV: "test", SUPERADMIN_EMAILS: " Root@Example.com , ,ops@example.com" })
      .SUPERADMIN_EMAILS
  ).toEqual(["Root@Example.com", "ops@example.com"])
})

test("TELEMETRY_PROVIDER defaults to store; sentry needs SENTRY_DSN", () => {
  expect(loadEnv({ NODE_ENV: "test" }).TELEMETRY_PROVIDER).toBe("store")
  expect(() => loadEnv({ NODE_ENV: "test", TELEMETRY_PROVIDER: "sentry" })).toThrow(
    "TELEMETRY_PROVIDER=sentry needs SENTRY_DSN"
  )
  const env = loadEnv({
    NODE_ENV: "test",
    TELEMETRY_PROVIDER: "sentry",
    SENTRY_DSN: "https://abc@o1.ingest.sentry.io/42",
  })
  expect(env.SENTRY_DSN).toBe("https://abc@o1.ingest.sentry.io/42")
})

test("ANALYTICS_PROVIDER defaults to store; a blank one counts as unset", () => {
  expect(loadEnv({ NODE_ENV: "test" }).ANALYTICS_PROVIDER).toBe("store")
  expect(loadEnv({ NODE_ENV: "test", ANALYTICS_PROVIDER: " \n" }).ANALYTICS_PROVIDER).toBe("store")
  expect(() => loadEnv({ NODE_ENV: "test", ANALYTICS_PROVIDER: "mixpanel" })).toThrow()
})

test("ANALYTICS_PROVIDER=posthog needs POSTHOG_KEY and POSTHOG_HOST", () => {
  expect(() => loadEnv({ NODE_ENV: "test", ANALYTICS_PROVIDER: "posthog" })).toThrow(
    "ANALYTICS_PROVIDER=posthog needs POSTHOG_KEY, POSTHOG_HOST"
  )
  expect(() =>
    loadEnv({ NODE_ENV: "test", ANALYTICS_PROVIDER: "posthog", POSTHOG_KEY: "phc_x" })
  ).toThrow("ANALYTICS_PROVIDER=posthog needs POSTHOG_HOST")
  const env = loadEnv({
    NODE_ENV: "test",
    ANALYTICS_PROVIDER: "posthog",
    POSTHOG_KEY: "phc_x",
    POSTHOG_HOST: "https://us.i.posthog.com",
  })
  expect(env).toMatchObject({
    ANALYTICS_PROVIDER: "posthog",
    POSTHOG_KEY: "phc_x",
    POSTHOG_HOST: "https://us.i.posthog.com",
  })
})

test("POSTHOG_HOST must be a url, like AUTH_URL", () => {
  expect(() =>
    loadEnv({
      NODE_ENV: "test",
      ANALYTICS_PROVIDER: "posthog",
      POSTHOG_KEY: "phc_x",
      POSTHOG_HOST: "not a url",
    })
  ).toThrow()
})

test("ANALYTICS_PROVIDER=plausible needs PLAUSIBLE_DOMAIN and PLAUSIBLE_HOST", () => {
  expect(() => loadEnv({ NODE_ENV: "test", ANALYTICS_PROVIDER: "plausible" })).toThrow(
    "ANALYTICS_PROVIDER=plausible needs PLAUSIBLE_DOMAIN, PLAUSIBLE_HOST"
  )
  expect(() =>
    loadEnv({
      NODE_ENV: "test",
      ANALYTICS_PROVIDER: "plausible",
      PLAUSIBLE_DOMAIN: "brand.com",
    })
  ).toThrow("ANALYTICS_PROVIDER=plausible needs PLAUSIBLE_HOST")
  const env = loadEnv({
    NODE_ENV: "test",
    ANALYTICS_PROVIDER: "plausible",
    PLAUSIBLE_DOMAIN: "brand.com",
    PLAUSIBLE_HOST: "https://plausible.io",
  })
  expect(env).toMatchObject({
    ANALYTICS_PROVIDER: "plausible",
    PLAUSIBLE_DOMAIN: "brand.com",
    PLAUSIBLE_HOST: "https://plausible.io",
  })
})

test("PLAUSIBLE_HOST must be a url, like AUTH_URL", () => {
  expect(() =>
    loadEnv({
      NODE_ENV: "test",
      ANALYTICS_PROVIDER: "plausible",
      PLAUSIBLE_DOMAIN: "brand.com",
      PLAUSIBLE_HOST: "not a url",
    })
  ).toThrow()
})

test("SIGNUP_RATE_LIMIT / SIGNUP_RATE_WINDOW_SECONDS default to 30 per 600 s", () => {
  const env = loadEnv({ NODE_ENV: "test" })
  expect([env.SIGNUP_RATE_LIMIT, env.SIGNUP_RATE_WINDOW_SECONDS]).toEqual([30, 600])
  const custom = loadEnv({
    NODE_ENV: "test",
    SIGNUP_RATE_LIMIT: "5",
    SIGNUP_RATE_WINDOW_SECONDS: "60",
  })
  expect([custom.SIGNUP_RATE_LIMIT, custom.SIGNUP_RATE_WINDOW_SECONDS]).toEqual([5, 60])
})

test("PASSWORD_RESET_RATE_* default to 30 per 600 s; TELEMETRY_RATE_LIMIT to 60", () => {
  const env = loadEnv({ NODE_ENV: "test" })
  expect([env.PASSWORD_RESET_RATE_LIMIT, env.PASSWORD_RESET_RATE_WINDOW_SECONDS]).toEqual([30, 600])
  expect(env.TELEMETRY_RATE_LIMIT).toBe(60)
  const custom = loadEnv({
    NODE_ENV: "test",
    PASSWORD_RESET_RATE_LIMIT: "5",
    PASSWORD_RESET_RATE_WINDOW_SECONDS: "60",
    TELEMETRY_RATE_LIMIT: "1000",
  })
  expect([custom.PASSWORD_RESET_RATE_LIMIT, custom.PASSWORD_RESET_RATE_WINDOW_SECONDS]).toEqual([
    5, 60,
  ])
  expect(custom.TELEMETRY_RATE_LIMIT).toBe(1000)
})

test("SIGNUP_EMAIL_RATE_LIMIT defaults to 3; MAGIC_LINK_RATE_* to 30 per 600 s", () => {
  const env = loadEnv({ NODE_ENV: "test" })
  expect(env.SIGNUP_EMAIL_RATE_LIMIT).toBe(3)
  expect([env.MAGIC_LINK_RATE_LIMIT, env.MAGIC_LINK_RATE_WINDOW_SECONDS]).toEqual([30, 600])
  const custom = loadEnv({
    NODE_ENV: "test",
    SIGNUP_EMAIL_RATE_LIMIT: "7",
    MAGIC_LINK_RATE_LIMIT: "5",
    MAGIC_LINK_RATE_WINDOW_SECONDS: "60",
  })
  expect(custom.SIGNUP_EMAIL_RATE_LIMIT).toBe(7)
  expect([custom.MAGIC_LINK_RATE_LIMIT, custom.MAGIC_LINK_RATE_WINDOW_SECONDS]).toEqual([5, 60])
})

test("ANALYTICS_RATE_LIMIT defaults to 120; a blank value means unset", () => {
  expect(loadEnv({ NODE_ENV: "test" }).ANALYTICS_RATE_LIMIT).toBe(120)
  expect(loadEnv({ NODE_ENV: "test", ANALYTICS_RATE_LIMIT: "" }).ANALYTICS_RATE_LIMIT).toBe(120)
  expect(loadEnv({ NODE_ENV: "test", ANALYTICS_RATE_LIMIT: "500" }).ANALYTICS_RATE_LIMIT).toBe(500)
})

test("TWO_FACTOR_ENCRYPTION_KEY defaults to the fixed dev key outside production", () => {
  expect(loadEnv({ NODE_ENV: "test" }).TWO_FACTOR_ENCRYPTION_KEY).toBe(DEV_TWO_FACTOR_KEY)
  expect(loadEnv({ NODE_ENV: "development" }).TWO_FACTOR_ENCRYPTION_KEY).toBe(DEV_TWO_FACTOR_KEY)
})

test("production requires TWO_FACTOR_ENCRYPTION_KEY; a blank one counts as missing", () => {
  const required = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
  }
  expect(() => loadEnv(required)).toThrow("TWO_FACTOR_ENCRYPTION_KEY is not set")
  expect(() => loadEnv({ ...required, TWO_FACTOR_ENCRYPTION_KEY: " " })).toThrow(
    "TWO_FACTOR_ENCRYPTION_KEY is not set"
  )
})

test("a set TWO_FACTOR_ENCRYPTION_KEY must decode to 32 bytes", () => {
  const required = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
  }
  expect(() =>
    loadEnv({ ...required, TWO_FACTOR_ENCRYPTION_KEY: Buffer.from("too short").toString("base64") })
  ).toThrow("TWO_FACTOR_ENCRYPTION_KEY must decode to 32 bytes")
  expect(
    loadEnv({ ...required, TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY })
      .TWO_FACTOR_ENCRYPTION_KEY
  ).toBe(PROD_TWO_FACTOR_KEY)
})

test("production refuses the public development key", () => {
  const required = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
  }
  expect(() => loadEnv({ ...required, TWO_FACTOR_ENCRYPTION_KEY: DEV_TWO_FACTOR_KEY })).toThrow(
    "TWO_FACTOR_ENCRYPTION_KEY must not be the development key"
  )
})

test("strict base64 rejects junk Buffer.from would otherwise silently ignore", () => {
  const required = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
  }
  // Buffer.from("base64") decodes the valid prefix and silently drops the rest, so this still
  // decodes to exactly 32 bytes under a length-only check; the strict format check must reject it.
  const keyWithJunk = `${PROD_TWO_FACTOR_KEY}!!!not-base64`
  expect(() => loadEnv({ ...required, TWO_FACTOR_ENCRYPTION_KEY: keyWithJunk })).toThrow(
    "TWO_FACTOR_ENCRYPTION_KEY must decode to 32 bytes"
  )
})

test("PASSKEY_RP_ID defaults to brand.localhost; PASSKEY_RP_NAME to BRAND_NAME", () => {
  const env = loadEnv({ NODE_ENV: "test" })
  expect(env.PASSKEY_RP_ID).toBe("brand.localhost")
  expect(env.PASSKEY_RP_NAME).toBe(BRAND_NAME)
})

test("PASSKEY_RP_ID defaults to SITE_DOMAIN, normalised like @repo/sites", () => {
  const urls = { AUTH_URL, ACCOUNT_URL }
  expect(loadEnv({ NODE_ENV: "test", ...urls, SITE_DOMAIN: "example.com" }).PASSKEY_RP_ID).toBe(
    "example.com"
  )
  // A scheme, leading dot, trailing slash or capitals are dropped, as siteUrl() drops them.
  expect(
    loadEnv({ NODE_ENV: "test", ...urls, SITE_DOMAIN: "https://.Example.com/" }).PASSKEY_RP_ID
  ).toBe("example.com")
  // Blank counts as unset: the dev parent domain, which covers the dev URLs.
  expect(loadEnv({ NODE_ENV: "test", SITE_DOMAIN: " " }).PASSKEY_RP_ID).toBe("brand.localhost")
})

test("an explicit PASSKEY_RP_ID wins over SITE_DOMAIN", () => {
  expect(
    loadEnv({
      NODE_ENV: "test",
      AUTH_URL: "https://auth.override.example",
      ACCOUNT_URL: "https://account.override.example",
      SITE_DOMAIN: "example.com",
      PASSKEY_RP_ID: "override.example",
    }).PASSKEY_RP_ID
  ).toBe("override.example")
})

test("a PASSKEY_RP_ID equal to the AUTH_URL and ACCOUNT_URL host is accepted", () => {
  // Compose's default stack: every app on plain localhost ports, so the RP ID is the host itself.
  const env = loadEnv({
    NODE_ENV: "test",
    AUTH_URL: "http://localhost:3002",
    ACCOUNT_URL: "http://localhost:3003",
    PASSKEY_RP_ID: "localhost",
  })
  expect(env.PASSKEY_RP_ID).toBe("localhost")
})

test("the api refuses to start on a PASSKEY_RP_ID that does not cover both hosts", () => {
  // The documented production mistake: SITE_DOMAIN left unset, so the RP ID is brand.localhost
  // while the apps live on example.com — every ceremony would fail in the browser.
  expect(() => loadEnv({ NODE_ENV: "test", AUTH_URL, ACCOUNT_URL })).toThrow(
    'PASSKEY_RP_ID "brand.localhost" must equal, or be a parent domain of, both the AUTH_URL host ' +
      "(auth.example.com) and the ACCOUNT_URL host (account.example.com)"
  )
  // Covering one host is not enough: account sits on another domain.
  expect(() =>
    loadEnv({
      NODE_ENV: "test",
      AUTH_URL,
      ACCOUNT_URL: "https://account.other.com",
      SITE_DOMAIN: "example.com",
    })
  ).toThrow(/ACCOUNT_URL host \(account\.other\.com\)/)
  // A suffix that is not a whole label does not count: "ample.com" is no parent of example.com.
  expect(() =>
    loadEnv({ NODE_ENV: "test", AUTH_URL, ACCOUNT_URL, PASSKEY_RP_ID: "ample.com" })
  ).toThrow(/PASSKEY_RP_ID "ample\.com"/)
  // A subdomain of the apps' hosts is not a parent either.
  expect(() =>
    loadEnv({ NODE_ENV: "test", AUTH_URL, ACCOUNT_URL, PASSKEY_RP_ID: "x.auth.example.com" })
  ).toThrow(/PASSKEY_RP_ID/)
})

test("a single-label PASSKEY_RP_ID covers only itself, never subdomains under it", () => {
  expect(rpIdCovers("localhost", "localhost")).toBe(true)
  expect(rpIdCovers("localhost", "auth.brand.localhost")).toBe(false)
  expect(rpIdCovers("com", "auth.example.com")).toBe(false)
  expect(() =>
    loadEnv({
      NODE_ENV: "test",
      AUTH_URL: "http://auth.brand.localhost:3002",
      ACCOUNT_URL: "http://account.brand.localhost:3003",
      PASSKEY_RP_ID: "localhost",
    })
  ).toThrow(/PASSKEY_RP_ID "localhost"/)
})

test("an explicit PASSKEY_RP_ID is lowercased", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    AUTH_URL: "https://auth.example.com",
    ACCOUNT_URL: "https://account.example.com",
    PASSKEY_RP_ID: "Example.COM",
  })
  expect(env.PASSKEY_RP_ID).toBe("example.com")
})

test("rpIdCovers accepts the host itself or a parent domain, by whole labels, any case", () => {
  expect(rpIdCovers("example.com", "example.com")).toBe(true)
  expect(rpIdCovers("example.com", "auth.example.com")).toBe(true)
  expect(rpIdCovers("Example.COM", "auth.example.com")).toBe(true)
  expect(rpIdCovers("example.com", "auth.notexample.com")).toBe(false)
  expect(rpIdCovers("auth.example.com", "example.com")).toBe(false)
})

test("an explicit PASSKEY_RP_NAME wins over BRAND_NAME", () => {
  expect(loadEnv({ NODE_ENV: "test", PASSKEY_RP_NAME: "Acme" }).PASSKEY_RP_NAME).toBe("Acme")
})

test("PASSKEY_RP_ID and PASSKEY_RP_NAME need nothing in production beyond SITE_DOMAIN", () => {
  const required = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
  }
  const env = loadEnv(required)
  expect(env.PASSKEY_RP_ID).toBe("example.com")
  expect(env.PASSKEY_RP_NAME).toBe(BRAND_NAME)
})

test("STORAGE_PROVIDER defaults to local with STORAGE_DIR .data/storage", () => {
  const env = loadEnv({ NODE_ENV: "test" })
  expect(env.STORAGE_PROVIDER).toBe("local")
  expect(env.STORAGE_DIR).toBe(".data/storage")
})

test("STORAGE_PROVIDER=s3 names exactly the missing S3 keys", () => {
  expect(() => loadEnv({ NODE_ENV: "test", STORAGE_PROVIDER: "s3" })).toThrow(
    "STORAGE_PROVIDER=s3 needs S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
  )
  let message = ""
  try {
    loadEnv({ NODE_ENV: "test", STORAGE_PROVIDER: "s3", S3_BUCKET: "b", S3_REGION: "r" })
  } catch (error) {
    message = (error as Error).message
  }
  expect(message).toBe("STORAGE_PROVIDER=s3 needs S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY")
})

test("STORAGE_PROVIDER=s3 with every key loads them; S3_ENDPOINT is optional", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "uploads",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
  })
  expect(env).toMatchObject({
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "uploads",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
  })
  expect(env.S3_ENDPOINT).toBeUndefined()
})

test("an unknown STORAGE_PROVIDER throws", () => {
  expect(() => loadEnv({ NODE_ENV: "test", STORAGE_PROVIDER: "ftp" })).toThrow()
})

test("STORAGE_PUBLIC_URL must be a URL, with any trailing slash removed", () => {
  expect(() => loadEnv({ NODE_ENV: "test", STORAGE_PUBLIC_URL: "not-a-url" })).toThrow()
  const env = loadEnv({
    NODE_ENV: "test",
    STORAGE_PUBLIC_URL: "https://cdn.example.com/files/",
  })
  expect(env.STORAGE_PUBLIC_URL).toBe("https://cdn.example.com/files")
})

test("in production STORAGE_PUBLIC_URL must be https (the CSP's img-src), *.localhost excepted", () => {
  const prod = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
  }
  expect(() => loadEnv({ ...prod, STORAGE_PUBLIC_URL: "http://cdn.example.com" })).toThrow(
    "STORAGE_PUBLIC_URL must use https"
  )
  expect(
    loadEnv({ ...prod, STORAGE_PUBLIC_URL: "https://cdn.example.com" }).STORAGE_PUBLIC_URL
  ).toBe("https://cdn.example.com")
  expect(
    loadEnv({ ...prod, STORAGE_PUBLIC_URL: "http://files.brand.localhost:8333" }).STORAGE_PUBLIC_URL
  ).toBe("http://files.brand.localhost:8333")
  // Outside production http stays allowed (a local bucket).
  expect(
    loadEnv({ NODE_ENV: "test", STORAGE_PUBLIC_URL: "http://cdn.example.com" }).STORAGE_PUBLIC_URL
  ).toBe("http://cdn.example.com")
})

test("JOBS_* default to an in-process worker, 4 at a time, polling every second", () => {
  expect(loadEnv({ NODE_ENV: "test" })).toMatchObject({
    JOBS_WORKER: true,
    JOBS_CONCURRENCY: 4,
    JOBS_POLL_MS: 1000,
  })
  expect(loadEnv({ NODE_ENV: "test", JOBS_WORKER: "" }).JOBS_WORKER).toBe(true)
})

test("JOBS_WORKER reads true/false, 1/0, yes/no, on/off; anything else throws", () => {
  for (const value of ["false", "FALSE", "0", "no", "off", " false\n"]) {
    expect(loadEnv({ NODE_ENV: "test", JOBS_WORKER: value }).JOBS_WORKER).toBe(false)
  }
  for (const value of ["true", "1", "Yes", "on"]) {
    expect(loadEnv({ NODE_ENV: "test", JOBS_WORKER: value }).JOBS_WORKER).toBe(true)
  }
  expect(() => loadEnv({ NODE_ENV: "test", JOBS_WORKER: "nope" })).toThrow()
})

test("JOBS_CONCURRENCY is 1-50 and JOBS_POLL_MS 100-60000; outside that range throws", () => {
  const load = (extra: Record<string, string | undefined>) =>
    loadEnv({ NODE_ENV: "test", ...extra })
  expect(load({ JOBS_CONCURRENCY: "1", JOBS_POLL_MS: "100" })).toMatchObject({
    JOBS_CONCURRENCY: 1,
    JOBS_POLL_MS: 100,
  })
  expect(load({ JOBS_CONCURRENCY: "50", JOBS_POLL_MS: "60000" })).toMatchObject({
    JOBS_CONCURRENCY: 50,
    JOBS_POLL_MS: 60_000,
  })
  for (const extra of [
    { JOBS_CONCURRENCY: "0" },
    { JOBS_CONCURRENCY: "51" },
    { JOBS_CONCURRENCY: "2.5" },
    { JOBS_POLL_MS: "99" },
    { JOBS_POLL_MS: "60001" },
    { JOBS_POLL_MS: "fast" },
  ]) {
    expect(() => load(extra)).toThrow()
  }
})

test("BACKUP_ENABLED defaults to false; BACKUP_RETENTION_DAYS defaults to 14", () => {
  expect(loadEnv({ NODE_ENV: "test" })).toMatchObject({
    BACKUP_ENABLED: false,
    BACKUP_RETENTION_DAYS: 14,
  })
  expect(loadEnv({ NODE_ENV: "test", BACKUP_ENABLED: "" }).BACKUP_ENABLED).toBe(false)
})

test("BACKUP_ENABLED reads true/false, 1/0, yes/no, on/off; anything else throws", () => {
  for (const value of ["false", "FALSE", "0", "no", "off", " false\n"]) {
    expect(loadEnv({ NODE_ENV: "test", BACKUP_ENABLED: value }).BACKUP_ENABLED).toBe(false)
  }
  for (const value of ["true", "1", "Yes", "on"]) {
    expect(loadEnv({ NODE_ENV: "test", BACKUP_ENABLED: value }).BACKUP_ENABLED).toBe(true)
  }
  expect(() => loadEnv({ NODE_ENV: "test", BACKUP_ENABLED: "nope" })).toThrow()
})

test("STORAGE_SWEEP_ENABLED defaults to true; false turns it off; a typo throws", () => {
  expect(loadEnv({ NODE_ENV: "test" }).STORAGE_SWEEP_ENABLED).toBe(true)
  expect(loadEnv({ NODE_ENV: "test", STORAGE_SWEEP_ENABLED: "" }).STORAGE_SWEEP_ENABLED).toBe(true)
  expect(loadEnv({ NODE_ENV: "test", STORAGE_SWEEP_ENABLED: "false" }).STORAGE_SWEEP_ENABLED).toBe(
    false
  )
  expect(() => loadEnv({ NODE_ENV: "test", STORAGE_SWEEP_ENABLED: "nope" })).toThrow()
})

test("BACKUP_RETENTION_DAYS is an integer 1-365; outside that range or non-numeric throws", () => {
  expect(loadEnv({ NODE_ENV: "test", BACKUP_RETENTION_DAYS: "1" }).BACKUP_RETENTION_DAYS).toBe(1)
  expect(loadEnv({ NODE_ENV: "test", BACKUP_RETENTION_DAYS: "365" }).BACKUP_RETENTION_DAYS).toBe(
    365
  )
  expect(loadEnv({ NODE_ENV: "test", BACKUP_RETENTION_DAYS: "" }).BACKUP_RETENTION_DAYS).toBe(14)
  for (const value of ["0", "366", "2.5", "many"]) {
    expect(() => loadEnv({ NODE_ENV: "test", BACKUP_RETENTION_DAYS: value })).toThrow()
  }
})

describe("audit retention", () => {
  test("defaults: AUDIT_PII_RETENTION_DAYS 90, AUDIT_RETENTION_DAYS 365, AUDIT_RETENTION_JUSTIFIED false", () => {
    const env = loadEnv({ NODE_ENV: "test" })
    expect(env.AUDIT_PII_RETENTION_DAYS).toBe(90)
    expect(env.AUDIT_RETENTION_DAYS).toBe(365)
    expect(env.AUDIT_RETENTION_JUSTIFIED).toBe(false)
  })

  test("AUDIT_RETENTION_DAYS accepts its bounds (180-1095) and refuses outside them", () => {
    expect(loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_DAYS: "180" }).AUDIT_RETENTION_DAYS).toBe(
      180
    )
    expect(loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_DAYS: "1095" }).AUDIT_RETENTION_DAYS).toBe(
      1095
    )
    expect(() => loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_DAYS: "179" })).toThrow(
      "AUDIT_RETENTION_DAYS must be between 180 and 1095"
    )
    expect(() => loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_DAYS: "1096" })).toThrow(
      "AUDIT_RETENTION_DAYS must be between 180 and 1095"
    )
  })

  test("AUDIT_RETENTION_JUSTIFIED=true raises the ceiling to 3650 and warns exactly once", () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)
    const env = loadEnv(
      { NODE_ENV: "test", AUDIT_RETENTION_DAYS: "3650", AUDIT_RETENTION_JUSTIFIED: "true" },
      { warn }
    )
    expect(env.AUDIT_RETENTION_DAYS).toBe(3650)
    expect(warnings).toEqual([AUDIT_RETENTION_JUSTIFIED_MESSAGE])
  })

  test("AUDIT_RETENTION_JUSTIFIED=true still refuses beyond 3650", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "test",
        AUDIT_RETENTION_DAYS: "3651",
        AUDIT_RETENTION_JUSTIFIED: "true",
      })
    ).toThrow("AUDIT_RETENTION_DAYS must be between 180 and 3650")
  })

  test("AUDIT_RETENTION_JUSTIFIED=false (the default) never warns", () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)
    loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_DAYS: "1095" }, { warn })
    expect(warnings).toEqual([])
  })

  test("AUDIT_PII_RETENTION_DAYS must be strictly less than AUDIT_RETENTION_DAYS", () => {
    expect(
      loadEnv({
        NODE_ENV: "test",
        AUDIT_PII_RETENTION_DAYS: "364",
        AUDIT_RETENTION_DAYS: "365",
      }).AUDIT_PII_RETENTION_DAYS
    ).toBe(364)
    expect(() =>
      loadEnv({
        NODE_ENV: "test",
        AUDIT_PII_RETENTION_DAYS: "365",
        AUDIT_RETENTION_DAYS: "365",
      })
    ).toThrow("AUDIT_PII_RETENTION_DAYS must be strictly less than AUDIT_RETENTION_DAYS")
    expect(() =>
      loadEnv({
        NODE_ENV: "test",
        AUDIT_PII_RETENTION_DAYS: "400",
        AUDIT_RETENTION_DAYS: "365",
      })
    ).toThrow("AUDIT_PII_RETENTION_DAYS must be strictly less than AUDIT_RETENTION_DAYS")
  })

  test("AUDIT_PII_RETENTION_DAYS and AUDIT_RETENTION_DAYS must be positive integers", () => {
    for (const value of ["0", "-1", "2.5", "many"]) {
      expect(() => loadEnv({ NODE_ENV: "test", AUDIT_PII_RETENTION_DAYS: value })).toThrow()
    }
    for (const value of ["0", "-1", "2.5", "many"]) {
      expect(() => loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_DAYS: value })).toThrow()
    }
  })

  test("AUDIT_RETENTION_JUSTIFIED reads true/false, 1/0, yes/no, on/off; a typo throws", () => {
    expect(loadEnv({ NODE_ENV: "test" }).AUDIT_RETENTION_JUSTIFIED).toBe(false)
    expect(
      loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_JUSTIFIED: "" }).AUDIT_RETENTION_JUSTIFIED
    ).toBe(false)
    expect(
      loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_JUSTIFIED: "yes" }).AUDIT_RETENTION_JUSTIFIED
    ).toBe(true)
    expect(() => loadEnv({ NODE_ENV: "test", AUDIT_RETENTION_JUSTIFIED: "nope" })).toThrow()
  })
})

test("REALTIME_BUS defaults to unset (the server picks by dialect) and accepts memory/postgres", () => {
  expect(loadEnv({ NODE_ENV: "test" }).REALTIME_BUS).toBeUndefined()
  expect(loadEnv({ NODE_ENV: "test", REALTIME_BUS: "" }).REALTIME_BUS).toBeUndefined()
  expect(loadEnv({ NODE_ENV: "test", REALTIME_BUS: "memory" }).REALTIME_BUS).toBe("memory")
  expect(loadEnv({ NODE_ENV: "test", REALTIME_BUS: "postgres" }).REALTIME_BUS).toBe("postgres")
})

test("an invalid REALTIME_BUS is refused", () => {
  expect(() => loadEnv({ NODE_ENV: "test", REALTIME_BUS: "sqlite" })).toThrow()
})

test("READY_TIMEOUT_MS defaults to 2000 and must be an integer from 100 to 60000", () => {
  expect(loadEnv({ NODE_ENV: "test" }).READY_TIMEOUT_MS).toBe(2_000)
  expect(loadEnv({ NODE_ENV: "test", READY_TIMEOUT_MS: "" }).READY_TIMEOUT_MS).toBe(2_000)
  expect(loadEnv({ NODE_ENV: "test", READY_TIMEOUT_MS: "500" }).READY_TIMEOUT_MS).toBe(500)
  for (const value of ["99", "60001", "1.5", "soon"]) {
    expect(() => loadEnv({ NODE_ENV: "test", READY_TIMEOUT_MS: value })).toThrow()
  }
})

test("REQUEST_TIMEOUT_MS defaults to 30000 and must be an integer from 1000 to 600000", () => {
  expect(loadEnv({ NODE_ENV: "test" }).REQUEST_TIMEOUT_MS).toBe(30_000)
  expect(loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: "" }).REQUEST_TIMEOUT_MS).toBe(30_000)
  expect(loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: "3000" }).REQUEST_TIMEOUT_MS).toBe(3_000)
  for (const value of ["999", "600001", "0", "2.5"]) {
    expect(() => loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: value })).toThrow()
  }
})

test("REALTIME_MAX_STREAMS defaults to 1000 and must be an integer >= 1", () => {
  expect(loadEnv({ NODE_ENV: "test" }).REALTIME_MAX_STREAMS).toBe(1000)
  expect(loadEnv({ NODE_ENV: "test", REALTIME_MAX_STREAMS: "1" }).REALTIME_MAX_STREAMS).toBe(1)
  expect(loadEnv({ NODE_ENV: "test", REALTIME_MAX_STREAMS: "5000" }).REALTIME_MAX_STREAMS).toBe(
    5000
  )
  for (const value of ["0", "-1", "2.5", "many"]) {
    expect(() => loadEnv({ NODE_ENV: "test", REALTIME_MAX_STREAMS: value })).toThrow()
  }
})

test("WEBHOOK_CONCURRENCY defaults to 2 and is an integer from 1 to JOBS_CONCURRENCY", () => {
  const load = (extra: Record<string, string | undefined>) =>
    loadEnv({ NODE_ENV: "test", ...extra })
  expect(load({}).WEBHOOK_CONCURRENCY).toBe(2)
  expect(load({ WEBHOOK_CONCURRENCY: "" }).WEBHOOK_CONCURRENCY).toBe(2)
  expect(load({ WEBHOOK_CONCURRENCY: "1" }).WEBHOOK_CONCURRENCY).toBe(1)
  expect(load({ WEBHOOK_CONCURRENCY: "4" }).WEBHOOK_CONCURRENCY).toBe(4)
  expect(load({ JOBS_CONCURRENCY: "10", WEBHOOK_CONCURRENCY: "10" }).WEBHOOK_CONCURRENCY).toBe(10)
  // The default never exceeds a single-slot worker's concurrency.
  expect(load({ JOBS_CONCURRENCY: "1" }).WEBHOOK_CONCURRENCY).toBe(1)
  expect(() => load({ WEBHOOK_CONCURRENCY: "5" })).toThrow(
    "WEBHOOK_CONCURRENCY must be between 1 and JOBS_CONCURRENCY (4)"
  )
  for (const value of ["0", "2.5", "many"]) {
    expect(() => load({ WEBHOOK_CONCURRENCY: value })).toThrow()
  }
})

test("blank realtime and jobs settings (copied from .env.example) mean their defaults", () => {
  const blank = {
    NODE_ENV: "test",
    REALTIME_BUS: "",
    REALTIME_MAX_STREAMS: "",
    JOBS_WORKER: "",
    JOBS_CONCURRENCY: "",
    JOBS_POLL_MS: " ",
  }
  expect(loadEnv(blank)).toMatchObject({
    REALTIME_MAX_STREAMS: 1000,
    JOBS_WORKER: true,
    JOBS_CONCURRENCY: 4,
    JOBS_POLL_MS: 1000,
  })
  expect(loadEnv(blank).REALTIME_BUS).toBeUndefined()
})

test("SUPPORT_EMAIL is optional and must be an address; unset falls back to MAIL_FROM's", () => {
  expect(loadEnv({ NODE_ENV: "test" }).SUPPORT_EMAIL).toBeUndefined()
  expect(loadEnv({ NODE_ENV: "test", SUPPORT_EMAIL: " help@example.com " }).SUPPORT_EMAIL).toBe(
    "help@example.com"
  )
  expect(() => loadEnv({ NODE_ENV: "test", SUPPORT_EMAIL: "not an address" })).toThrow()
  expect(supportEmailOf({ SUPPORT_EMAIL: "help@example.com", MAIL_FROM: "x@example.com" })).toBe(
    "help@example.com"
  )
  expect(supportEmailOf({ SUPPORT_EMAIL: undefined, MAIL_FROM: "Brand <hi@example.com>" })).toBe(
    "hi@example.com"
  )
  expect(mailAddress("plain@example.com")).toBe("plain@example.com")
})

test("HIRING_EMAIL is optional and must be an address; unset falls back to the support inbox", () => {
  expect(loadEnv({ NODE_ENV: "test" }).HIRING_EMAIL).toBeUndefined()
  expect(loadEnv({ NODE_ENV: "test", HIRING_EMAIL: " jobs@example.com " }).HIRING_EMAIL).toBe(
    "jobs@example.com"
  )
  expect(() => loadEnv({ NODE_ENV: "test", HIRING_EMAIL: "not an address" })).toThrow()
  const from = "Brand <hi@example.com>"
  expect(
    hiringEmailOf({
      HIRING_EMAIL: "jobs@example.com",
      SUPPORT_EMAIL: "help@example.com",
      MAIL_FROM: from,
    })
  ).toBe("jobs@example.com")
  expect(
    hiringEmailOf({ HIRING_EMAIL: undefined, SUPPORT_EMAIL: "help@example.com", MAIL_FROM: from })
  ).toBe("help@example.com")
  expect(
    hiringEmailOf({ HIRING_EMAIL: undefined, SUPPORT_EMAIL: undefined, MAIL_FROM: from })
  ).toBe("hi@example.com")
})

test("METRICS_TOKEN is optional and at least 24 characters", () => {
  expect(loadEnv({ NODE_ENV: "test" }).METRICS_TOKEN).toBeUndefined()
  const token = "m".repeat(24)
  expect(loadEnv({ NODE_ENV: "test", METRICS_TOKEN: token }).METRICS_TOKEN).toBe(token)
  expect(() => loadEnv({ NODE_ENV: "test", METRICS_TOKEN: "too-short" })).toThrow()
})

describe("API_TEST_QUERY_DELAY_MS (test-only slow-query hook)", () => {
  const production = {
    NODE_ENV: "production",
    API_SERVICE_TOKEN: prodToken,
    AUTH_URL,
    ACCOUNT_URL,
    SITE_DOMAIN,
    APP_URL,
    TWO_FACTOR_ENCRYPTION_KEY: PROD_TWO_FACTOR_KEY,
  }

  test("unset or blank is 0 (off), with no warning", () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)
    expect(loadEnv({ NODE_ENV: "test" }, { warn }).API_TEST_QUERY_DELAY_MS).toBe(0)
    expect(
      loadEnv({ NODE_ENV: "test", API_TEST_QUERY_DELAY_MS: "" }, { warn }).API_TEST_QUERY_DELAY_MS
    ).toBe(0)
    expect(loadEnv(production, { warn }).API_TEST_QUERY_DELAY_MS).toBe(0)
    expect(warnings).toEqual([])
  })

  test("parsed as an integer outside production", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(loadEnv({ NODE_ENV, API_TEST_QUERY_DELAY_MS: "200" }).API_TEST_QUERY_DELAY_MS).toBe(
        200
      )
    }
    expect(
      loadEnv({ NODE_ENV: "test", API_TEST_QUERY_DELAY_MS: "10000" }).API_TEST_QUERY_DELAY_MS
    ).toBe(10_000)
  })

  test("refused outside 0–10 000 or when not an integer", () => {
    for (const value of ["-1", "10001", "1.5", "slow"]) {
      expect(() => loadEnv({ NODE_ENV: "test", API_TEST_QUERY_DELAY_MS: value })).toThrow()
    }
  })

  test("ignored in production, with exactly one warning", () => {
    const warnings: string[] = []
    const env = loadEnv(
      { ...production, API_TEST_QUERY_DELAY_MS: "200" },
      { warn: (message) => warnings.push(message) }
    )
    expect(env.API_TEST_QUERY_DELAY_MS).toBe(0)
    expect(warnings).toEqual([QUERY_DELAY_IGNORED_MESSAGE])
  })

  test("an unset NODE_ENV is production, so the delay is ignored there too", () => {
    const warnings: string[] = []
    const { NODE_ENV: _, ...rest } = production
    const env = loadEnv(
      { ...rest, API_TEST_QUERY_DELAY_MS: "200" },
      { warn: (message) => warnings.push(message) }
    )
    expect(env.API_TEST_QUERY_DELAY_MS).toBe(0)
    expect(warnings).toHaveLength(1)
  })
})

test("AUTH_URL and ACCOUNT_URL refuse whitespace, CR, LF and angle brackets", () => {
  for (const name of ["AUTH_URL", "ACCOUNT_URL"]) {
    for (const bad of [
      "https://x.example.com/a\r\nX-Evil: 1",
      "https://x.example.com/a\nb",
      "https://x.example.com/a\tb",
      "https://x.example.com/a b",
      "https://x.example.com/<a>",
      "https://x.example.com/>",
    ]) {
      expect(() => loadEnv({ NODE_ENV: "development", [name]: bad })).toThrow(
        `${name} must not contain whitespace, CR, LF, "<" or ">"`
      )
    }
  }
  // Surrounding whitespace is trimmed like every other value, not refused.
  expect(
    loadEnv({ NODE_ENV: "development", AUTH_URL: " http://auth.brand.localhost:3002 " }).AUTH_URL
  ).toBe("http://auth.brand.localhost:3002")
})
