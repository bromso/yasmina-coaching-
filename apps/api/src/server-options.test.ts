import { expect, test } from "bun:test"
import { storeAnalyticsProvider } from "./analytics/providers/provider"
import { loadEnv } from "./env"
import { logMailer } from "./mail/log"
import { serverOptionsFromEnv } from "./server-options"
import { localStorage } from "./storage/local"
import { storeProvider } from "./telemetry/store"

const deps = {
  mailer: logMailer(),
  storage: localStorage(".data/test-unused"),
  telemetry: storeProvider,
  analytics: storeAnalyticsProvider,
}

test("STORAGE_PUBLIC_URL reaches the server as storagePublicUrl", () => {
  const env = loadEnv({ NODE_ENV: "test", STORAGE_PUBLIC_URL: "https://cdn.example.com/" })
  expect(serverOptionsFromEnv(env, deps).storagePublicUrl).toBe("https://cdn.example.com")
  expect(serverOptionsFromEnv(loadEnv({ NODE_ENV: "test" }), deps).storagePublicUrl).toBeUndefined()
})

test("the env's scalars and the built dependencies reach the server", () => {
  const env = loadEnv({
    NODE_ENV: "development",
    PORT: "4100",
    API_MAX_BODY_BYTES: "1000",
    SUPERADMIN_EMAILS: "root@example.com",
  })
  const options = serverOptionsFromEnv(env, deps)
  expect(options).toMatchObject({
    port: 4100,
    maxBodyBytes: 1000,
    development: true,
    allowLocalhostOrigins: true,
    authUrl: env.AUTH_URL,
    accountUrl: env.ACCOUNT_URL,
    appUrl: env.APP_URL,
    twoFactorEncryptionKey: env.TWO_FACTOR_ENCRYPTION_KEY,
    superadminEmails: ["root@example.com"],
  })
  expect(options.mailer).toBe(deps.mailer)
  expect(options.storage).toBe(deps.storage)
  expect(options.telemetry).toBe(deps.telemetry)
  expect(options.analytics).toBe(deps.analytics)
})

test("JOBS_* and WEBHOOK_CONCURRENCY reach the server as jobsWorker / jobsConcurrency / jobsPollMs / webhookConcurrency", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    JOBS_WORKER: "false",
    JOBS_CONCURRENCY: "8",
    JOBS_POLL_MS: "250",
    WEBHOOK_CONCURRENCY: "3",
  })
  expect(serverOptionsFromEnv(env, deps)).toMatchObject({
    jobsWorker: false,
    jobsConcurrency: 8,
    jobsPollMs: 250,
    webhookConcurrency: 3,
  })
  expect(serverOptionsFromEnv(loadEnv({ NODE_ENV: "test" }), deps)).toMatchObject({
    jobsWorker: true,
    jobsConcurrency: 4,
    jobsPollMs: 1000,
    webhookConcurrency: 2,
  })
})

test("REALTIME_* reach the server as realtimeBus / realtimeMaxStreams", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    REALTIME_BUS: "postgres",
    REALTIME_MAX_STREAMS: "50",
  })
  expect(serverOptionsFromEnv(env, deps)).toMatchObject({
    realtimeBus: "postgres",
    realtimeMaxStreams: 50,
  })
  expect(serverOptionsFromEnv(loadEnv({ NODE_ENV: "test" }), deps)).toMatchObject({
    realtimeBus: undefined,
    realtimeMaxStreams: 1000,
  })
})

test("SUPPORT_EMAIL reaches the server as supportEmail, else MAIL_FROM's address", () => {
  const env = loadEnv({ NODE_ENV: "test", SUPPORT_EMAIL: "help@example.com" })
  expect(serverOptionsFromEnv(env, deps).supportEmail).toBe("help@example.com")
  const fallback = loadEnv({ NODE_ENV: "test", MAIL_FROM: "Brand <hi@example.com>" })
  expect(serverOptionsFromEnv(fallback, deps).supportEmail).toBe("hi@example.com")
})

test("HIRING_EMAIL reaches the server as hiringEmail, else wherever support mail goes", () => {
  const env = loadEnv({ NODE_ENV: "test", HIRING_EMAIL: "jobs@example.com" })
  expect(serverOptionsFromEnv(env, deps).hiringEmail).toBe("jobs@example.com")
  const support = loadEnv({ NODE_ENV: "test", SUPPORT_EMAIL: "help@example.com" })
  expect(serverOptionsFromEnv(support, deps).hiringEmail).toBe("help@example.com")
  const fallback = loadEnv({ NODE_ENV: "test", MAIL_FROM: "Brand <hi@example.com>" })
  expect(serverOptionsFromEnv(fallback, deps).hiringEmail).toBe("hi@example.com")
})

test("READY_TIMEOUT_MS reaches the server as readyTimeoutMs", () => {
  const env = loadEnv({ NODE_ENV: "test", READY_TIMEOUT_MS: "750" })
  expect(serverOptionsFromEnv(env, deps).readyTimeoutMs).toBe(750)
})

test("REQUEST_TIMEOUT_MS reaches the server as requestTimeoutMs", () => {
  const env = loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: "4000" })
  expect(serverOptionsFromEnv(env, deps).requestTimeoutMs).toBe(4_000)
})

test("API_TEST_QUERY_DELAY_MS reaches the server as queryDelayMs", () => {
  const env = loadEnv({ NODE_ENV: "test", API_TEST_QUERY_DELAY_MS: "200" })
  expect(serverOptionsFromEnv(env, deps).queryDelayMs).toBe(200)
  expect(serverOptionsFromEnv(loadEnv({ NODE_ENV: "test" }), deps).queryDelayMs).toBe(0)
})

test("PASSKEY_RP_ID / PASSKEY_RP_NAME reach the server as passkeyRpId / passkeyRpName", () => {
  const urls = { AUTH_URL: "https://auth.brand.com", ACCOUNT_URL: "https://account.brand.com" }
  const env = loadEnv({
    NODE_ENV: "test",
    ...urls,
    PASSKEY_RP_ID: "brand.com",
    PASSKEY_RP_NAME: "Brand",
  })
  expect(serverOptionsFromEnv(env, deps)).toMatchObject({
    passkeyRpId: "brand.com",
    passkeyRpName: "Brand",
  })
  // Unset: SITE_DOMAIN, as env.ts resolves it.
  const derived = loadEnv({
    NODE_ENV: "test",
    AUTH_URL: "https://auth.example.org",
    ACCOUNT_URL: "https://account.example.org",
    SITE_DOMAIN: "example.org",
  })
  expect(serverOptionsFromEnv(derived, deps).passkeyRpId).toBe("example.org")
})

test("webhooks may target *.localhost only with WEBHOOK_ALLOW_LOCALHOST_HTTP, in any NODE_ENV", () => {
  for (const NODE_ENV of ["development", "test"] as const)
    expect(serverOptionsFromEnv(loadEnv({ NODE_ENV }), deps).webhookAllowLocalhostHttp).toBe(false)
  const optedIn = loadEnv({ NODE_ENV: "test", WEBHOOK_ALLOW_LOCALHOST_HTTP: "true" })
  expect(serverOptionsFromEnv(optedIn, deps).webhookAllowLocalhostHttp).toBe(true)
  const production = { ...optedIn, NODE_ENV: "production" as const }
  expect(serverOptionsFromEnv(production, deps).webhookAllowLocalhostHttp).toBe(true)
})
