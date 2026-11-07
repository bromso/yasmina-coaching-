import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { describeApiError } from "./api-errors"
import { MissingEnvError } from "./env"

const GENERIC = "The notes service is unavailable"
const unreachable = new TypeError("fetch failed")

describe("outside production", () => {
  test("an unreachable API names the URL", () => {
    expect(describeApiError(unreachable, { nodeEnv: "development" })).toMatch(
      /^Couldn't reach the API at https?:\/\//
    )
  })

  test("a missing variable names it", () => {
    expect(describeApiError(new MissingEnvError("API_URL"), { nodeEnv: "development" })).toBe(
      "API_URL is not set"
    )
  })
})

describe("in production", () => {
  test("an unreachable API is the generic message, without the internal URL", () => {
    const message = describeApiError(unreachable, { nodeEnv: "production" })
    expect(message).toBe(GENERIC)
    expect(message).not.toContain("http")
  })

  test("a missing variable is the generic message, without its name", () => {
    expect(describeApiError(new MissingEnvError("API_URL"), { nodeEnv: "production" })).toBe(
      GENERIC
    )
  })

  test("the generic message is in the reader's language", () => {
    expect(describeApiError(unreachable, { nodeEnv: "production", locale: "sv" })).toBe(
      "Anteckningstjänsten är inte tillgänglig"
    )
  })
})

test.each(["development", "production"])(
  "a contract error's message passes through (%s)",
  (env) => {
    const error = new ORPCError("NOT_FOUND", { message: "Note not found" })
    expect(describeApiError(error, { nodeEnv: env })).toBe("Note not found")
  }
)

test.each(["development", "production"])(
  "a declared contract error's message passes through (%s)",
  (env) => {
    const error = new ORPCError("NOT_FOUND", { defined: true, message: "Note not found" })
    expect(describeApiError(error, { nodeEnv: env })).toBe("Note not found")
  }
)

test("a 400 input-validation error's message passes through", () => {
  const error = new ORPCError("BAD_REQUEST", { message: "Input validation failed" })
  expect(describeApiError(error, { nodeEnv: "production" })).toBe("Input validation failed")
})

describe("guard, limiter and server errors are not shown to end users", () => {
  const unauthorized = new ORPCError("UNAUTHORIZED", { message: "Unauthorized" })
  const rateLimited = new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests" })
  const internal = new ORPCError("INTERNAL_SERVER_ERROR", { message: "Internal error" })

  test.each([
    ["401", unauthorized],
    ["429", rateLimited],
    ["500", internal],
  ])("a %s is the generic message in production", (_, error) => {
    expect(describeApiError(error, { nodeEnv: "production" })).toBe(GENERIC)
  })

  test("a 401 names the URL and the status in development", () => {
    const message = describeApiError(unauthorized, { nodeEnv: "development" })
    expect(message).toMatch(/^The API at https?:\/\/\S+ answered 401 UNAUTHORIZED$/)
  })

  test("a 500 names the URL and the status in development", () => {
    const message = describeApiError(internal, { nodeEnv: "development" })
    expect(message).toMatch(/^The API at https?:\/\/\S+ answered 500 INTERNAL_SERVER_ERROR$/)
  })
})
