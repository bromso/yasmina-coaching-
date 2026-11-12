import { join } from "node:path"

export const TMP = join(import.meta.dirname, ".tmp")
export const MAIL_DIR = join(TMP, "mail")

export const URLS = {
  www: "http://www.brand.localhost:3000",
  app: "http://app.brand.localhost:3001",
  auth: "http://auth.brand.localhost:3002",
  account: "http://account.brand.localhost:3003",
  docs: "http://docs.brand.localhost:3004",
  help: "http://help.brand.localhost:3005",
  jobs: "http://jobs.brand.localhost:3006",
  blog: "http://blog.brand.localhost:3009",
  legal: "http://legal.brand.localhost:3010",
  api: "http://api.brand.localhost:3007",
  ai: "http://ai.brand.localhost:3008",
} as const

const API_SERVICE_TOKEN = "e2e-api-service-token-0123456789abcdef"
const AI_SERVICE_TOKEN = "e2e-ai-service-token-0123456789abcdef"
// Test-only: a fixed, valid 32-byte key that is not the public DEV_TWO_FACTOR_KEY — the api runs
// with NODE_ENV=production here (see `shared` below), which refuses to start with that key.
const TWO_FACTOR_ENCRYPTION_KEY = "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk="

/** Every process gets these; production mode, the real hosts. */
export const shared = {
  NODE_ENV: "production",
  SITE_DOMAIN: "brand.localhost",
  API_URL: URLS.api,
  API_SERVICE_TOKEN,
  AI_SERVICE_URL: URLS.ai,
  AI_SERVICE_TOKEN,
  COOKIE_DOMAIN: ".brand.localhost",
  AUTH_URL: URLS.auth,
  APP_URL: URLS.app,
  ACCOUNT_URL: URLS.account,
} as const

export const apiEnv = {
  ...shared,
  HOST: "api.brand.localhost",
  PORT: "3007",
  TWO_FACTOR_ENCRYPTION_KEY,
  DATABASE_URL: `sqlite://${join(TMP, "api.db")}`,
  MAIL_PROVIDER: "file",
  MAIL_DIR,
  BILLING_PROVIDER: "mock",
  // Uploads on disk under .tmp, so every run starts with an empty store (global-setup.ts).
  STORAGE_PROVIDER: "local",
  STORAGE_DIR: join(TMP, "storage"),
  SUPERADMIN_EMAILS: "admin@e2e.test",
  API_RATE_LIMIT: "10000",
  SIGNUP_RATE_LIMIT: "1000",
  // admin.spec signs up the same superadmin address on every local run against a reused server.
  SIGNUP_EMAIL_RATE_LIMIT: "1000",
  MAGIC_LINK_RATE_LIMIT: "1000",
  PASSWORD_RESET_RATE_LIMIT: "1000",
  // Next fills x-forwarded-for from the socket; Playwright connects directly, so every e2e
  // browser is 127.0.0.1 and shares one telemetry bucket.
  TELEMETRY_RATE_LIMIT: "10000",
  // Same reasoning as TELEMETRY_RATE_LIMIT: every e2e browser shares one analytics:<ip hash> bucket.
  ANALYTICS_RATE_LIMIT: "10000",
  // webhooks.spec delivers to a receiver it starts on *.localhost; the api warns at startup that
  // this is on in production, which is right for e2e and never for a real deployment.
  WEBHOOK_ALLOW_LOCALHOST_HTTP: "true",
} as const

export const aiEnv = {
  ...shared,
  HOST: "ai.brand.localhost",
  PORT: "3008",
  AI_MODEL: "mock:echo",
} as const
