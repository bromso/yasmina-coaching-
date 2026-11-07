import { describe, expect, test } from "bun:test"
import { currentRequestId, outsideRequestContext, withRequestContext } from "./context"
import { createLogger, maskEmail, newRequestId, redact, validRequestId } from "./index"

const capture = (opts: Partial<Parameters<typeof createLogger>[0]> = {}) => {
  const lines: string[] = []
  const log = createLogger({ service: "t", format: "json", write: (l) => lines.push(l), ...opts })
  return { log, lines, json: () => lines.map((l) => JSON.parse(l)) }
}

describe("@repo/log", () => {
  test("json line: time, level, service, message, fields", () => {
    const { log, json } = capture()
    log.info("hello", { a: 1 })
    const [line] = json()
    expect(line).toMatchObject({ level: "info", service: "t", message: "hello", a: 1 })
    expect(new Date(line.time).toString()).not.toBe("Invalid Date")
  })

  test("levels below the threshold are dropped", () => {
    const { log, lines } = capture({ level: "warn" })
    log.info("no")
    log.warn("yes")
    expect(lines).toHaveLength(1)
  })

  test("LOG_LEVEL and LOG_FORMAT from env; an invalid level falls back to info with one warning", () => {
    const { log, json } = capture({
      format: undefined,
      env: { LOG_LEVEL: "loud", LOG_FORMAT: "json" },
    })
    log.debug("hidden")
    log.info("shown")
    const levels = json().map((l) => l.level)
    expect(levels).toEqual(["warn", "info"])
  })

  test("redaction: any depth, any case; email masked", () => {
    expect(
      redact({
        Authorization: "Bearer x",
        nested: { headers: { "X-Session-Token": "s" } },
        email: "ada@example.com",
        password: "p",
        ok: 1,
      })
    ).toEqual({
      Authorization: "[redacted]",
      nested: { headers: { "X-Session-Token": "[redacted]" } },
      email: "a***@example.com",
      password: "[redacted]",
      ok: 1,
    })
    expect(maskEmail("ada@example.com")).toBe("a***@example.com")
    expect(redact({ sessionToken: "t", api_secret: "s", "Set-Cookie": "c", tokens: 2 })).toEqual({
      sessionToken: "[redacted]",
      api_secret: "[redacted]",
      "Set-Cookie": "[redacted]",
      tokens: "[redacted]",
    })
  })

  test("an error field is serialised with name, message and stack", () => {
    const { log, json } = capture()
    log.error("boom", { error: new TypeError("bad") })
    expect(json()[0].error).toMatchObject({ name: "TypeError", message: "bad" })
    expect(typeof json()[0].error.stack).toBe("string")
  })

  test("never throws: a circular field logs a fallback line", () => {
    const { log, lines } = capture()
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => log.info("circular", { a })).not.toThrow()
    expect(lines).toHaveLength(1)
  })

  test("request id from context, across await and a timer; child adds fields", async () => {
    const { log, json } = capture()
    await withRequestContext({ requestId: "req-12345678" }, async () => {
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 1))
      expect(currentRequestId()).toBe("req-12345678")
      log.child({ job: "mail.send" }).info("in")
    })
    log.info("out")
    expect(json()[0]).toMatchObject({ requestId: "req-12345678", job: "mail.send" })
    expect(json()[1].requestId).toBeUndefined()
  })

  test("request ids: generated 22 chars; incoming validated", () => {
    expect(newRequestId()).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(validRequestId("abc-DEF_123")).toBe("abc-DEF_123")
    expect(validRequestId("short")).toBeNull()
    expect(validRequestId("has space in it")).toBeNull()
    expect(validRequestId(null)).toBeNull()
  })

  test("pretty format is one readable line with level and service", () => {
    const { log, lines } = capture({ format: "pretty" })
    log.warn("careful", { n: 2 })
    expect(lines[0]).toContain("WARN")
    expect(lines[0]).toContain("[t]")
    expect(lines[0]).toContain("careful")
    expect(lines[0]).toContain("n=2")
  })
})

describe("error serialisation", () => {
  const fetchFailed = () =>
    new Error("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    })

  test("keeps the cause chain and codes", () => {
    const { log, json } = capture()
    log.error("send failed", { error: fetchFailed() })
    const { error } = json()[0]
    expect(error.message).toBe("fetch failed")
    expect(error.cause).toMatchObject({ message: "connect ECONNREFUSED", code: "ECONNREFUSED" })
    expect(typeof error.cause.stack).toBe("string")
  })

  test("pretty format prints the cause on the error's line", () => {
    const { log, lines } = capture({ format: "pretty" })
    log.error("send failed", { error: fetchFailed() })
    expect(lines[0]?.split("\n")[0]).toContain(
      "error=Error: fetch failed <- Error: connect ECONNREFUSED [ECONNREFUSED]"
    )
  })

  test("own string/number props are kept, objects and sensitive keys are not", () => {
    const error = Object.assign(new Error("duplicate key"), {
      code: "23505",
      detail: "Key (slug)=(x) already exists.",
      headers: { authorization: "Bearer x" },
      token: "t",
    })
    const out = redact(error) as Record<string, unknown>
    expect(out).toMatchObject({ code: "23505", detail: "Key (slug)=(x) already exists." })
    expect(out.headers).toBeUndefined()
    expect(out.token).toBe("[redacted]")
  })

  test("a non-Error cause is redacted like any value", () => {
    const out = redact(new Error("x", { cause: { password: "p", status: 503 } })) as {
      cause: unknown
    }
    expect(out.cause).toEqual({ password: "[redacted]", status: 503 })
  })

  test("a cause chain longer than the cap stops cleanly", () => {
    let error = new Error("e0")
    for (let i = 1; i <= 20; i++) error = new Error(`e${i}`, { cause: error })
    const { log, json } = capture()
    expect(() => log.error("deep", { error })).not.toThrow()
    let node = json()[0].error
    let links = 0
    while (typeof node === "object" && node.cause !== undefined) {
      node = node.cause
      links++
    }
    expect(links).toBeLessThan(20)
    expect(typeof node === "string" ? node : "").toMatch(/truncated|depth/)
  })

  test("a self-referencing cause does not loop", () => {
    const error = new Error("self")
    ;(error as { cause?: unknown }).cause = error
    const { log, lines } = capture()
    expect(() => log.error("loop", { error })).not.toThrow()
    expect(lines).toHaveLength(1)
  })
})

test("fields cannot overwrite the envelope", async () => {
  const { log, json } = capture()
  log.error("real", { level: "info", message: "fake", service: "x", time: "never", n: 1 })
  await withRequestContext({ requestId: "req-12345678" }, async () => {
    log.child({ requestId: "other-123456" }).info("in")
  })
  const [line, inCtx] = json()
  expect(line).toMatchObject({ level: "error", message: "real", service: "t", n: 1 })
  expect(line["field.level"]).toBe("info")
  expect(line["field.message"]).toBe("fake")
  expect(line.time).not.toBe("never")
  expect(inCtx.requestId).toBe("req-12345678")
  expect(inCtx["field.requestId"]).toBe("other-123456")
})

describe("redaction hardening", () => {
  test("api keys, DSNs, credentials, private keys and a bare auth key", () => {
    expect(
      redact({
        apiKey: "k",
        RESEND_API_KEY: "k",
        "x-api-key": "k",
        SENTRY_DSN: "https://k@sentry.io/1",
        credentials: { u: "p" },
        OAUTH_APPLE_PRIVATE_KEY: "pem",
        auth: "x",
        author: "Ada",
      })
    ).toEqual({
      apiKey: "[redacted]",
      RESEND_API_KEY: "[redacted]",
      "x-api-key": "[redacted]",
      SENTRY_DSN: "[redacted]",
      credentials: "[redacted]",
      OAUTH_APPLE_PRIVATE_KEY: "[redacted]",
      auth: "[redacted]",
      author: "Ada",
    })
  })

  test("addresses masked under to, from, address and any key ending in email", () => {
    expect(
      redact({
        to: "ada@example.com",
        From: "Brand <no-reply@brand.com>",
        address: "bob@example.com",
        userEmail: "cy@example.com",
        INVITEE_EMAIL: "di@example.com",
        cc: ["x@example.com"],
        recipients: { to: ["ed@example.com", "fa@example.com"] },
        from: 3,
        port: 25,
      })
    ).toEqual({
      to: "a***@example.com",
      From: "B***@brand.com>",
      address: "b***@example.com",
      userEmail: "c***@example.com",
      INVITEE_EMAIL: "d***@example.com",
      cc: ["x@example.com"],
      recipients: { to: ["e***@example.com", "f***@example.com"] },
      from: 3,
      port: 25,
    })
    expect(redact({ address: "127.0.0.1", to: "v0022" })).toEqual({
      address: "127.0.0.1",
      to: "v0022",
    })
  })

  test("a Map is walked as an object", () => {
    const map = new Map<string, unknown>([
      ["authorization", "Bearer x"],
      ["email", "ada@example.com"],
      ["n", 1],
    ])
    expect(redact({ headers: map })).toEqual({
      headers: { authorization: "[redacted]", email: "a***@example.com", n: 1 },
    })
  })

  test("a URL loses its credentials and sensitive query values", () => {
    const url = new URL("https://user:pw@example.com/verify?token=abc&next=%2Fhome&api_key=k")
    const out = redact({ url }) as { url: string }
    expect(out.url).not.toContain("pw")
    expect(out.url).not.toContain("user")
    expect(out.url).not.toContain("abc")
    expect(out.url).toContain("next=%2Fhome")
    expect(new URL(out.url).searchParams.get("token")).toBe("[redacted]")
    expect(new URL(out.url).searchParams.get("api_key")).toBe("[redacted]")
  })
})

test("outsideRequestContext drops the id for its whole chain", async () => {
  const { log, json } = capture()
  await withRequestContext({ requestId: "req-12345678" }, async () => {
    await outsideRequestContext(async () => {
      await new Promise((r) => setTimeout(r, 1))
      log.info("outside")
    })
    log.info("inside")
  })
  expect(json()[0].requestId).toBeUndefined()
  expect(json()[1].requestId).toBe("req-12345678")
})
