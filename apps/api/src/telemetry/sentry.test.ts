import { describe, expect, test } from "bun:test"
import type { ErrorRow } from "../queries/telemetry"
import { createTelemetryProvider } from "./create-provider"
import { buildEnvelope, parseDsn, sentryProvider } from "./sentry"

const row: ErrorRow = {
  id: 1,
  fingerprint: "f".repeat(64),
  day: "2026-10-04",
  app: "app",
  kind: "boundary",
  message: "boom",
  stack: "Error: boom\n    at render (http://app/x.js:1:2)\n    at main (http://app/y.js:3:4)",
  digest: "d1",
  route: "/notes",
  user_agent: null,
  count: 1,
  first_seen: "2026-10-04T10:00:00.000Z",
  last_seen: "2026-10-04T10:00:00.000Z",
}

describe("parseDsn", () => {
  test("derives the envelope url and the public key", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/42")).toEqual({
      envelopeUrl: "https://o1.ingest.sentry.io/api/42/envelope/",
      publicKey: "abc123",
    })
  })
  test("refuses a DSN without a key or a project", () => {
    expect(() => parseDsn("https://o1.ingest.sentry.io/42")).toThrow()
    expect(() => parseDsn("https://abc@o1.ingest.sentry.io/")).toThrow()
    expect(() => parseDsn("not a url")).toThrow()
  })
})

describe("buildEnvelope", () => {
  test("three JSON lines: envelope header, item header, event", () => {
    const lines = buildEnvelope(row, {
      environment: "test",
      dsn: "https://abc@o1.ingest.sentry.io/42",
    }).split("\n")
    expect(lines).toHaveLength(3)
    const [header, item, event] = lines.map((l) => JSON.parse(l))
    expect(header).toMatchObject({ dsn: "https://abc@o1.ingest.sentry.io/42" })
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(item).toEqual({ type: "event" })
    expect(event).toMatchObject({
      level: "error",
      platform: "javascript",
      environment: "test",
      tags: { app: "app", kind: "boundary", route: "/notes" },
      fingerprint: [row.fingerprint],
      exception: { values: [{ type: "Error", value: "boom" }] },
    })
    // Frames oldest first, as Sentry expects.
    expect(
      event.exception.values[0].stacktrace.frames.map((f: { function: string }) => f.function)
    ).toEqual(["main", "render"])
    expect(JSON.stringify(event)).not.toContain("user_agent")
  })
  test("server rows use the node platform", () => {
    const event = JSON.parse(
      buildEnvelope(
        { ...row, app: "api", kind: "server" },
        { environment: "x", dsn: "https://a@b/1" }
      ).split("\n")[2] ?? ""
    )
    expect(event.platform).toBe("node")
  })
  test("event_id is deterministic from the row's identity: a redelivery builds the same one", () => {
    const opts = { environment: "test", dsn: "https://abc@o1.ingest.sentry.io/42" }
    const first = JSON.parse(buildEnvelope(row, opts).split("\n")[0] ?? "").event_id
    const second = JSON.parse(
      buildEnvelope({ ...row, id: row.id + 1 }, opts).split("\n")[0] ?? ""
    ).event_id
    expect(second).toBe(first)
    const different = JSON.parse(
      buildEnvelope({ ...row, day: "2026-10-05" }, opts).split("\n")[0] ?? ""
    ).event_id
    expect(different).not.toBe(first)
  })
})

describe("sentryProvider", () => {
  test("posts the envelope with the auth header; a 2xx succeeds", async () => {
    const calls: Request[] = []
    const ok = sentryProvider({
      dsn: "https://abc@o1.ingest.sentry.io/42",
      environment: "test",
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("{}", { status: 200 })
      },
    })
    await ok.onNewError(row)
    expect(calls[0]?.url).toBe("https://o1.ingest.sentry.io/api/42/envelope/")
    expect(calls[0]?.headers.get("x-sentry-auth")).toContain("sentry_key=abc")
    expect(calls[0]?.headers.get("content-type")).toBe("application/x-sentry-envelope")
  })

  test("a 4xx other than 429 is logged and treated as done: retrying would just repeat it", async () => {
    const logs: string[] = []
    const badAuth = sentryProvider({
      dsn: "https://abc@o1/1",
      environment: "t",
      log: (m) => logs.push(m),
      fetch: async () => new Response("no", { status: 401 }),
    })
    await expect(badAuth.onNewError(row)).resolves.toBeUndefined()
    expect(logs.join(" ")).toContain("401")
  })

  test("a 5xx, a 429, a network error and a timeout all throw: the job retries", async () => {
    const serverError = sentryProvider({
      dsn: "https://abc@o1/1",
      environment: "t",
      log: () => {},
      fetch: async () => new Response("no", { status: 503 }),
    })
    await expect(serverError.onNewError(row)).rejects.toThrow("503")

    const rateLimited = sentryProvider({
      dsn: "https://abc@o1/1",
      environment: "t",
      log: () => {},
      fetch: async () => new Response("no", { status: 429 }),
    })
    await expect(rateLimited.onNewError(row)).rejects.toThrow("429")

    const unreachable = sentryProvider({
      dsn: "https://abc@o1/1",
      environment: "t",
      log: () => {},
      fetch: async () => {
        throw new Error("fetch failed")
      },
    })
    await expect(unreachable.onNewError(row)).rejects.toThrow("fetch failed")

    const hanging = sentryProvider({
      dsn: "https://abc@o1/1",
      environment: "t",
      log: () => {},
      timeoutMs: 20,
      fetch: (_input, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        ),
    })
    await expect(hanging.onNewError(row)).rejects.toThrow("aborted")
  })
})

test("createTelemetryProvider: store by default, sentry with a DSN, throws on a bad one", () => {
  const log = () => {}
  expect(createTelemetryProvider({ TELEMETRY_PROVIDER: "store", NODE_ENV: "test" }, log).kind).toBe(
    "store"
  )
  expect(
    createTelemetryProvider(
      { TELEMETRY_PROVIDER: "sentry", SENTRY_DSN: "https://k@h/1", NODE_ENV: "test" },
      log
    ).kind
  ).toBe("sentry")
  expect(() =>
    createTelemetryProvider(
      { TELEMETRY_PROVIDER: "sentry", SENTRY_DSN: "https://h/1", NODE_ENV: "test" },
      log
    )
  ).toThrow()
})
