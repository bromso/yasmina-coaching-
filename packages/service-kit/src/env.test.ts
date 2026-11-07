import { expect, test } from "bun:test"
import { isDevLike, resolveServiceToken } from "./env"

const base = { devToken: "dev-token", name: "API_SERVICE_TOKEN" }
const strong = "a".repeat(32)

test("development and test are dev-like; production is not", () => {
  expect(isDevLike("development")).toBe(true)
  expect(isDevLike("test")).toBe(true)
  expect(isDevLike("production")).toBe(false)
})

test("a given token always wins", () => {
  expect(resolveServiceToken({ ...base, given: strong, nodeEnv: "production" })).toBe(strong)
  expect(resolveServiceToken({ ...base, given: "real", nodeEnv: "development" })).toBe("real")
})

test("development and test fall back to the dev token", () => {
  expect(resolveServiceToken({ ...base, given: undefined, nodeEnv: "development" })).toBe(
    "dev-token"
  )
  expect(resolveServiceToken({ ...base, given: undefined, nodeEnv: "test" })).toBe("dev-token")
})

test("production without a token refuses, naming the variable", () => {
  expect(() => resolveServiceToken({ ...base, given: undefined, nodeEnv: "production" })).toThrow(
    "API_SERVICE_TOKEN is required in production"
  )
})

test("production refuses the public development token, even when given explicitly", () => {
  const devToken = "dev-only-insecure-api-token-that-is-long-enough"
  expect(() =>
    resolveServiceToken({ ...base, devToken, given: devToken, nodeEnv: "production" })
  ).toThrow("API_SERVICE_TOKEN must not be the public development token in production")
})

test("the dev token given explicitly is accepted outside production", () => {
  expect(resolveServiceToken({ ...base, given: "dev-token", nodeEnv: "development" })).toBe(
    "dev-token"
  )
  expect(resolveServiceToken({ ...base, given: "dev-token", nodeEnv: "test" })).toBe("dev-token")
})

test("production refuses a token shorter than 32 characters", () => {
  expect(() =>
    resolveServiceToken({ ...base, given: "a".repeat(31), nodeEnv: "production" })
  ).toThrow("API_SERVICE_TOKEN must be at least 32 characters in production")
})

test("short tokens are accepted outside production", () => {
  expect(resolveServiceToken({ ...base, given: "short", nodeEnv: "test" })).toBe("short")
})
