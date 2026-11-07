import { describe, expect, test } from "bun:test"
import { DEV_TOKEN } from "@repo/ai-contract"
import { DEV_API_TOKEN } from "@repo/api-contract"
import { assertAuthEnv, assertEnv, DEV_AI_TOKEN, loadEnv, MissingEnvError } from "./env"

const ALL = [
  "API_URL",
  "API_SERVICE_TOKEN",
  "AI_SERVICE_URL",
  "AI_SERVICE_TOKEN",
  "COOKIE_DOMAIN",
  "AUTH_URL",
  "APP_URL",
] as const
const PRODUCTION = {
  NODE_ENV: "production",
  API_URL: "http://api:3007",
  API_SERVICE_TOKEN: "api-secret",
  AI_SERVICE_URL: "http://ai:3008",
  AI_SERVICE_TOKEN: "secret",
  COOKIE_DOMAIN: ".brand.com",
  AUTH_URL: "https://auth.brand.com",
  APP_URL: "https://app.brand.com",
}

test("development falls back to the local dev services", () => {
  expect(loadEnv(ALL, { NODE_ENV: "development" })).toEqual({
    API_URL: "http://api.brand.localhost:3007",
    API_SERVICE_TOKEN: DEV_API_TOKEN,
    AI_SERVICE_URL: "http://ai.brand.localhost:3008",
    AI_SERVICE_TOKEN: DEV_AI_TOKEN,
    COOKIE_DOMAIN: ".brand.localhost",
    AUTH_URL: "http://auth.brand.localhost:3002",
    APP_URL: "http://app.brand.localhost:3001",
  })
})

// The only use of @repo/ai-contract here, and a devDependency: removing apps/ai means deleting
// this test and that devDependency.
test("the AI token default is apps/ai's dev token", () => {
  expect(DEV_AI_TOKEN).toBe(DEV_TOKEN)
})

test("test mode also gets the defaults", () => {
  expect(loadEnv(["API_URL"], { NODE_ENV: "test" }).API_URL).toBe("http://api.brand.localhost:3007")
})

test("set values win; URLs lose a trailing slash, the token is kept verbatim", () => {
  const env = loadEnv(ALL, {
    ...PRODUCTION,
    API_URL: "http://api:3007/",
    AUTH_URL: "https://auth.brand.com/",
    AI_SERVICE_TOKEN: "t/",
  })
  expect(env).toEqual({
    API_URL: "http://api:3007",
    API_SERVICE_TOKEN: "api-secret",
    AI_SERVICE_URL: "http://ai:3008",
    AI_SERVICE_TOKEN: "t/",
    COOKIE_DOMAIN: ".brand.com",
    AUTH_URL: "https://auth.brand.com",
    APP_URL: "https://app.brand.com",
  })
})

for (const key of ALL) {
  test(`production requires ${key}`, () => {
    const source = { ...PRODUCTION, [key]: undefined }
    expect(() => loadEnv(ALL, source)).toThrow(`${key} is not set`)
  })
}

test("a blank value counts as missing", () => {
  expect(() => loadEnv(["API_URL"], { NODE_ENV: "production", API_URL: "  " })).toThrow(
    MissingEnvError
  )
})

test("only the requested keys are required", () => {
  expect(loadEnv(["API_URL"], { NODE_ENV: "production", API_URL: "http://api:3007" })).toEqual({
    API_URL: "http://api:3007",
  })
})

describe("assertAuthEnv", () => {
  const full = {
    NODE_ENV: "production",
    API_URL: "http://api:3007",
    API_SERVICE_TOKEN: "s".repeat(32),
    COOKIE_DOMAIN: ".brand.com",
    AUTH_URL: "https://auth.brand.com",
    APP_URL: "https://app.brand.com",
  }
  test("production with every key passes", () => {
    expect(() => assertAuthEnv(full)).not.toThrow()
  })
  test("production names the first missing key", () => {
    const { COOKIE_DOMAIN: _c, ...without } = full
    expect(() => assertAuthEnv(without)).toThrow("COOKIE_DOMAIN is not set")
  })
  test("outside production it is a no-op", () => {
    expect(() => assertAuthEnv({ NODE_ENV: "development" })).not.toThrow()
  })
})

describe("assertEnv", () => {
  const KEYS = ["API_URL", "API_SERVICE_TOKEN"] as const
  test("production names the first missing key", () => {
    expect(() => assertEnv(KEYS, { NODE_ENV: "production" })).toThrow("API_URL is not set")
  })
  test("production with the requested keys passes, whatever else is missing", () => {
    expect(() =>
      assertEnv(KEYS, {
        NODE_ENV: "production",
        API_URL: "http://api:3007",
        API_SERVICE_TOKEN: "s".repeat(32),
      })
    ).not.toThrow()
  })
  test("outside production it is a no-op", () => {
    expect(() => assertEnv(KEYS, { NODE_ENV: "development" })).not.toThrow()
  })
})
