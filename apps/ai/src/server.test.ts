import { afterEach, describe, expect, test } from "bun:test"
import type { BrowserBatch } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { createMemoryRateLimiter } from "@repo/service-kit"
import type { LanguageModel } from "ai"
import type { UsageEntry } from "./log"
import { echoModel } from "./mock-models"
import { aiRouteOf, createServer, type ServerOptions, toAiErrorEvent } from "./server"
import {
  failingModel,
  failsAfterToolModel,
  hangingModel,
  recoveringModel,
  slowGenerateModel,
  textModel,
  toolCallModel,
} from "./test-models"

const TOKEN = "test-token"
const limits = { maxMessages: 3, maxMessageBytes: 2_000, maxOutputTokens: 256, maxSteps: 3 }

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
  await stop?.()
  stop = undefined
})

function start(model: LanguageModel, overrides: Partial<ServerOptions> = {}) {
  const logs = { usage: [] as UsageEntry[], errors: [] as unknown[] }
  const app = createServer({
    hostname: "127.0.0.1",
    port: 0,
    model,
    modelId: "mock:test",
    token: TOKEN,
    allowedOrigins: ["https://app.example.com"],
    allowLocalhostOrigins: false,
    limits,
    rateLimiter: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }),
    log: { usage: (e) => logs.usage.push(e), error: (_m, e) => logs.errors.push(e) },
    ...overrides,
  })
  stop = app.stop
  return { logs, url: (path: string) => new URL(path, app.server.url) }
}

const userMessage = (text: string) => ({
  id: crypto.randomUUID(),
  role: "user",
  parts: [{ type: "text", text }],
})

function postChat(
  url: URL,
  body: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal
) {
  return fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal,
  })
}

/** Parses the AI SDK UI message stream (SSE) into its JSON events. */
async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  return (await res.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)))
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await Bun.sleep(10)
  }
}

describe("routing and protection", () => {
  test("/health is open", async () => {
    const { url } = start(textModel("hi"))
    const res = await fetch(url("/health"))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("OK")
  })

  test("/chat without a token is 401 and never reaches the model", async () => {
    const model = textModel("hi")
    const { url } = start(model)
    const res = await fetch(url("/chat"), { method: "POST", body: "{}" })
    expect(res.status).toBe(401)
    expect(model.doStreamCalls).toHaveLength(0)
  })

  test("/chat from a disallowed origin is 403", async () => {
    const { url } = start(textModel("hi"))
    const res = await postChat(
      url("/chat"),
      { messages: [userMessage("hi")] },
      {
        origin: "https://evil.example",
      }
    )
    expect(res.status).toBe(403)
  })

  test("over the rate limit is 429 with Retry-After", async () => {
    const { url } = start(textModel("hi"), {
      rateLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    const body = { messages: [userMessage("hi")] }
    expect((await postChat(url("/chat"), body)).status).toBe(200)
    const limited = await postChat(url("/chat"), body)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
  })

  test("x-ai-client-id keys the rate limit per client, not per proxy IP", async () => {
    const { url } = start(textModel("hi"), {
      rateLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    const body = { messages: [userMessage("hi")] }
    const as = (id: string) => ({ "x-ai-client-id": id })
    expect((await postChat(url("/chat"), body, as("user-a"))).status).toBe(200)
    expect((await postChat(url("/chat"), body, as("user-b"))).status).toBe(200)
    expect((await postChat(url("/chat"), body, as("user-a"))).status).toBe(429)
  })

  test("client ids and IPs live in separate key spaces", async () => {
    const keys: string[] = []
    const { url } = start(textModel("hi"), {
      rateLimiter: {
        hit: (key) => {
          keys.push(key)
          return { allowed: true }
        },
      },
    })
    const body = { messages: [userMessage("hi")] }
    await (await postChat(url("/chat"), body, { "x-ai-client-id": "127.0.0.1" })).text()
    await (await postChat(url("/chat"), body, { "x-ai-client-id": "   " })).text()
    await (await postChat(url("/chat"), body, { "x-ai-client-id": "x".repeat(500) })).text()
    expect(keys).toEqual(["client:127.0.0.1", "ip:127.0.0.1", `client:${"x".repeat(128)}`])
  })

  test("an unhandled failure is a generic 500 and its details stay server-side", async () => {
    const { url, logs } = start(textModel("hi"), {
      rateLimiter: { hit: () => Promise.reject(new Error("redis down: sk-live-secret")) },
    })
    const res = await postChat(url("/chat"), { messages: [userMessage("hi")] })
    expect(res.status).toBe(500)
    const raw = await res.text()
    expect(JSON.parse(raw)).toEqual({
      defined: false,
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      message: "Internal error",
    })
    expect(raw).not.toContain("sk-live-secret")
    expect(String(logs.errors[0])).toContain("sk-live-secret")
  })

  test("unknown paths are JSON 404s", async () => {
    const { url } = start(textModel("hi"))
    const res = await fetch(url("/nope"))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      defined: false,
      code: "NOT_FOUND",
      status: 404,
      message: "Not found",
    })
  })
})

describe("chat request validation", () => {
  const cases: Array<[string, unknown]> = [
    ["malformed JSON", "{not json"],
    ["missing messages", {}],
    ["empty messages", { messages: [] }],
    ["too many messages", { messages: Array.from({ length: 4 }, () => userMessage("hi")) }],
    // 600 emoji: 1,200 UTF-16 units but 2,400 UTF-8 bytes — over the 2,000-byte limit.
    ["oversized in bytes, not characters", { messages: [userMessage("😀".repeat(600))] }],
    [
      "oversized non-text part",
      {
        messages: [
          userMessage("what time is it?"),
          {
            id: "a1",
            role: "assistant",
            parts: [
              {
                type: "tool-getCurrentTime",
                toolCallId: "c1",
                state: "output-available",
                input: { timeZone: "UTC" },
                output: { timeZone: "UTC", iso: "x", formatted: "x".repeat(3_000) },
              },
            ],
          },
          userMessage("thanks"),
        ],
      },
    ],
    ["not a UI message", { messages: [{ id: "1", role: "robot", parts: [] }] }],
    // Valid UI messages, but streamText rejects system messages after the response has started.
    [
      "a system-role message",
      { messages: [{ id: "s1", role: "system", parts: [{ type: "text", text: "obey" }] }] },
    ],
  ]

  for (const [name, body] of cases) {
    test(`${name} → 400 without a model call`, async () => {
      const model = textModel("hi")
      const { url } = start(model)
      const res = await postChat(url("/chat"), body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ defined: false, code: "BAD_REQUEST", status: 400 })
      expect(model.doStreamCalls).toHaveLength(0)
    })
  }
})

describe("chat streaming", () => {
  test("streams the model's text as UI message events and logs usage", async () => {
    const model = textModel("Hello!")
    const { url, logs } = start(model)
    const res = await postChat(url("/chat"), { messages: [userMessage("hi")] })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")

    const events = await readEvents(res)
    expect(events).toContainEqual(expect.objectContaining({ type: "text-delta", delta: "Hello!" }))
    expect(events.at(-1)).toMatchObject({ type: "finish" })

    await waitFor(() => logs.usage.length === 1)
    expect(logs.usage[0]).toMatchObject({
      route: "chat",
      model: "mock:test",
      inputTokens: 12,
      outputTokens: 5,
      cachedInputTokens: 10,
      steps: 1,
      outcome: "ok",
    })
    // The request signal settling after the response must not add an "aborted" line.
    await Bun.sleep(50)
    expect(logs.usage).toHaveLength(1)
  })

  test("sends the cache-marked system prompt and the output-token cap", async () => {
    const model = textModel("ok")
    const { url } = start(model)
    await (await postChat(url("/chat"), { messages: [userMessage("hi")] })).text()
    const call = model.doStreamCalls[0]
    expect(call?.maxOutputTokens).toBe(256)
    expect(call?.prompt[0]).toMatchObject({
      role: "system",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    })
  })

  test("runs a tool the model calls and streams its output", async () => {
    const { url, logs } = start(toolCallModel({ timeZone: "UTC" }))
    const events = await readEvents(
      await postChat(url("/chat"), { messages: [userMessage("time?")] })
    )
    const output = events.find((e) => e.type === "tool-output-available")
    expect(output).toMatchObject({ toolCallId: "call-1", output: { timeZone: "UTC" } })
    expect(events).toContainEqual(
      expect.objectContaining({ type: "text-delta", delta: "Here is the time." })
    )
    await waitFor(() => logs.usage.length === 1)
    expect(logs.usage[0]?.steps).toBe(2)
  })

  test("the keyless echo model answers a time question with a real tool call", async () => {
    const { url } = start(echoModel)
    const events = await readEvents(
      await postChat(url("/chat"), { messages: [userMessage("what time is it?")] })
    )
    const output = events.find((e) => e.type === "tool-output-available")
    expect(output).toMatchObject({ output: { timeZone: "UTC" } })
    const formatted = (output?.output as { formatted: string } | undefined)?.formatted
    const deltas = events.filter((e) => e.type === "text-delta")
    expect(deltas.at(-1)).toMatchObject({ delta: `Echo: it's ${formatted} (UTC)` })
    expect(events.at(-1)).toMatchObject({ type: "finish" })
  })

  test("a provider failure reaches the client only as a generic error", async () => {
    const { url, logs } = start(failingModel("upstream exploded: sk-live-secret"))
    const res = await postChat(url("/chat"), { messages: [userMessage("hi")] })
    const raw = await res.clone().text()
    const events = await readEvents(res)
    expect(events).toContainEqual({ type: "error", errorText: "An error occurred." })
    expect(raw).not.toContain("sk-live-secret")
    await waitFor(() => logs.errors.length > 0)
    expect(String(logs.errors[0])).toContain("sk-live-secret")
    await waitFor(() => logs.usage.length > 0)
    expect(logs.usage).toEqual([
      expect.objectContaining({ route: "chat", model: "mock:test", outcome: "error" }),
    ])
  })

  test("a summarize failure is reported reduced: key and error name, never the message", async () => {
    const reported: BrowserBatch[] = []
    const { url, logs } = start(failingModel("upstream exploded: sk-live-secret"), {
      telemetry: { report: (batch) => reported.push(batch) },
    })
    const res = await fetch(url("/openapi/summarize"), {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "Long text" }),
    })
    expect(res.status).toBe(502)
    await waitFor(() => reported.length > 0)
    expect(reported).toEqual([
      { errors: [{ kind: "server", message: "summarize failed: Error" }], vitals: [] },
    ])
    expect(JSON.stringify(reported)).not.toContain("sk-live-secret")
    // The full text stays in the local log.
    expect(String(logs.errors[0])).toContain("sk-live-secret")
  })

  test("a request with no answer by requestTimeoutMs gets 503", async () => {
    const { url } = start(slowGenerateModel(400), { requestTimeoutMs: 100 })
    const started = performance.now()
    const res = await fetch(url("/openapi/summarize"), {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "Long text" }),
    })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "The request took too long. It may still complete — check before retrying.",
    })
    expect(performance.now() - started).toBeLessThan(400)
    await Bun.sleep(450) // let the discarded call finish before the server stops
  })

  test("toAiErrorEvent keeps only the error's name and never throws", () => {
    class APICallError extends Error {
      override name = "AI_APICallError"
    }
    expect(toAiErrorEvent("k", new APICallError("secret"))).toEqual({
      kind: "server",
      message: "k: AI_APICallError",
    })
    expect(toAiErrorEvent("k", Object.create(null)).message).toBe("k: Error")
    expect(toAiErrorEvent("k", "a string with sk-live-secret").message).toBe("k: Error")
    expect(toAiErrorEvent("x".repeat(600), new Error()).message).toHaveLength(500)
  })

  test("a chat stream that ends failed is reported exactly once, reduced", async () => {
    const reported: BrowserBatch[] = []
    const { url } = start(failingModel("upstream exploded: sk-live-secret"), {
      telemetry: { report: (batch) => reported.push(batch) },
    })
    await (await postChat(url("/chat"), { messages: [userMessage("hi")] })).text()
    await waitFor(() => reported.length > 0)
    await Bun.sleep(50)
    expect(reported).toEqual([
      { errors: [{ kind: "server", message: "chat stream failed: Error" }], vitals: [] },
    ])
    expect(JSON.stringify(reported)).not.toContain("sk-live-secret")
  })

  test("a stream error the model recovers from is not reported", async () => {
    const reported: BrowserBatch[] = []
    const { url, logs } = start(recoveringModel("transient hiccup"), {
      telemetry: { report: (batch) => reported.push(batch) },
    })
    const res = await postChat(url("/chat"), { messages: [userMessage("hi")] })
    expect(res.status).toBe(200)
    await res.text()
    await waitFor(() => logs.usage.length > 0)
    await Bun.sleep(50)
    expect(logs.usage).toEqual([expect.objectContaining({ outcome: "ok" })])
    expect(reported).toEqual([])
  })

  test("an unhandled failure is reported to telemetry too; a throwing reporter changes nothing", async () => {
    const reported: BrowserBatch[] = []
    const { url } = start(textModel("hi"), {
      rateLimiter: { hit: () => Promise.reject(new Error("redis down")) },
      telemetry: { report: (batch) => reported.push(batch) },
    })
    const res = await postChat(url("/chat"), { messages: [userMessage("hi")] })
    expect(res.status).toBe(500)
    expect(reported.map((b) => b.errors[0]?.message)).toEqual(["unhandled: Error"])

    await stop?.()
    const broken = start(textModel("hi"), {
      rateLimiter: { hit: () => Promise.reject(new Error("redis down")) },
      telemetry: {
        report: () => {
          throw new Error("reporter exploded")
        },
      },
    })
    const again = await postChat(broken.url("/chat"), { messages: [userMessage("hi")] })
    expect(again.status).toBe(500)
    expect(broken.logs.errors.map(String)).toContain("Error: reporter exploded")
  })

  test("a failure after a finished step still logs that step's tokens", async () => {
    const { url, logs } = start(failsAfterToolModel("step two exploded"))
    await (await postChat(url("/chat"), { messages: [userMessage("time?")] })).text()
    await waitFor(() => logs.usage.length > 0)
    expect(logs.usage).toEqual([
      expect.objectContaining({
        route: "chat",
        inputTokens: 12,
        outputTokens: 5,
        cachedInputTokens: 10,
        steps: 1,
        outcome: "error",
      }),
    ])
  })

  test("a non-fatal stream error followed by a finish logs the call's real totals", async () => {
    const { url, logs } = start(recoveringModel("transient hiccup"))
    await (await postChat(url("/chat"), { messages: [userMessage("hi")] })).text()
    await waitFor(() => logs.errors.length > 0)
    await waitFor(() => logs.usage.length > 0)
    await Bun.sleep(50)
    expect(logs.usage).toEqual([
      expect.objectContaining({
        route: "chat",
        inputTokens: 12,
        outputTokens: 5,
        steps: 1,
        outcome: "ok",
      }),
    ])
  })

  test("a client disconnect cancels the model call and logs an aborted usage line", async () => {
    const model = hangingModel()
    const { url, logs } = start(model)
    const controller = new AbortController()
    const pending = postChat(
      url("/chat"),
      { messages: [userMessage("hi")] },
      {},
      controller.signal
    ).then(
      (res) => res.text(),
      () => "aborted"
    )
    await waitFor(() => model.doStreamCalls.length === 1)
    controller.abort()
    await pending.catch(() => {})
    await waitFor(() => model.doStreamCalls[0]?.abortSignal?.aborted === true)
    await waitFor(() => logs.usage.length > 0)
    expect(logs.usage).toEqual([
      expect.objectContaining({ route: "chat", outcome: "aborted", steps: 0 }),
    ])
    expect(logs.errors).toHaveLength(0)
  })
})

describe("lifecycle", () => {
  test("/ready answers OK, then 503 once shutdown starts", async () => {
    const app = createServer({
      hostname: "127.0.0.1",
      port: 0,
      model: textModel("hi"),
      modelId: "mock:test",
      token: TOKEN,
      allowedOrigins: [],
      allowLocalhostOrigins: false,
      limits,
      rateLimiter: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }),
      log: { usage: () => {}, error: () => {} },
      drainMs: 500,
      graceMs: 300,
    })
    const ready = () => fetch(new URL("/ready", app.server.url))
    expect(await (await ready()).text()).toBe("OK")
    const done = app.lifecycle.shutdown(app.server)
    expect((await ready()).status).toBe(503)
    await done
  })
})

test("a denied token answers in the shared error shape", async () => {
  const { url } = start(textModel("hi"))
  const res = await fetch(url("/chat"), { method: "POST", body: "{}" })
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({
    defined: false,
    code: "UNAUTHORIZED",
    status: 401,
    message: "Unauthorized",
  })
})

type Line = Record<string, unknown>

/** Like `start`, but captures the structured logger's own lines (access + `ai.usage`) as JSON. */
function startLogged(model: LanguageModel, overrides: Partial<ServerOptions> = {}) {
  const lines: string[] = []
  const logger = createLogger({ service: "ai", format: "json", write: (l) => lines.push(l) })
  const app = createServer({
    hostname: "127.0.0.1",
    port: 0,
    model,
    modelId: "mock:test",
    token: TOKEN,
    allowedOrigins: ["https://app.example.com"],
    allowLocalhostOrigins: false,
    limits,
    rateLimiter: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }),
    logger,
    ...overrides,
  })
  stop = app.stop
  const json = (): Line[] => lines.map((l) => JSON.parse(l) as Line)
  return { url: (path: string) => new URL(path, app.server.url), json }
}

describe("request ids and structured logs", () => {
  test("a request without x-request-id gets a generated id, echoed and logged", async () => {
    const { url, json } = startLogged(textModel("hi"))
    const res = await postChat(url("/chat"), { messages: [userMessage("hi")] })
    await res.text()
    const id = res.headers.get("x-request-id")
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const access = json().filter((l) => l.message === "request")
    expect(access).toHaveLength(1)
    expect(access[0]).toMatchObject({
      level: "info",
      service: "ai",
      method: "POST",
      route: "chat",
      status: 200,
      requestId: id,
    })
    expect(typeof access[0]?.ms).toBe("number")
  })

  test("a trusted caller's valid x-request-id is kept and echoed", async () => {
    const { url, json } = startLogged(textModel("hi"))
    const res = await postChat(
      url("/chat"),
      { messages: [userMessage("hi")] },
      { "x-request-id": "test-req-0001" }
    )
    await res.text()
    expect(res.headers.get("x-request-id")).toBe("test-req-0001")
    const access = json().filter((l) => l.message === "request")
    expect(access[0]?.requestId).toBe("test-req-0001")
  })

  test("without the bearer, a supplied x-request-id is never echoed or trusted", async () => {
    const { url, json } = startLogged(textModel("hi"))
    const res = await fetch(url("/chat"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "test-req-0001" },
      body: JSON.stringify({ messages: [userMessage("hi")] }),
    })
    expect(res.status).toBe(401)
    const id = res.headers.get("x-request-id")
    expect(id).not.toBe("test-req-0001")
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const access = json().filter((l) => l.message === "request")
    expect(access[0]).toMatchObject({ status: 401, requestId: id })
    expect(access[0]).not.toHaveProperty("clientId")
  })

  test("the ai.usage line carries the request's id", async () => {
    const { url, json } = startLogged(textModel("hi"))
    const res = await postChat(
      url("/chat"),
      { messages: [userMessage("hi")] },
      { "x-request-id": "usage-req-0001" }
    )
    await readEvents(res)
    const usage = json().filter((l) => l.message === "ai.usage")
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({
      level: "info",
      service: "ai",
      route: "chat",
      model: "mock:test",
      requestId: "usage-req-0001",
    })
  })

  test("x-ai-client-id names the caller on the access line", async () => {
    const { url, json } = startLogged(textModel("hi"))
    const res = await postChat(
      url("/chat"),
      { messages: [userMessage("hi")] },
      { "x-ai-client-id": "client-1" }
    )
    await res.text()
    const access = json().filter((l) => l.message === "request")
    expect(access[0]).toMatchObject({ clientId: "client-1" })
  })

  test("no line for /health", async () => {
    const { url, json } = startLogged(textModel("hi"))
    await fetch(url("/health"))
    expect(json().filter((l) => l.message === "request")).toHaveLength(0)
  })

  test("an unknown procedure path is labelled other, never the raw path", async () => {
    const { url, json } = startLogged(textModel("hi"))
    await fetch(url("/rpc/made/up/12345"), {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: "{}",
    })
    const access = json().filter((l) => l.message === "request")
    expect(access[0]).toMatchObject({ route: "other" })
  })
})

describe("aiRouteOf", () => {
  const route = (path: string) => aiRouteOf(new Request(`http://x${path}`))
  test("maps paths to bounded labels", () => {
    expect(route("/chat")).toBe("chat")
    expect(route("/rpc/summarize")).toBe("summarize")
    expect(route("/rpc/made/up")).toBe("other")
    expect(route("/openapi/summarize")).toBe("openapi")
    expect(route("/openapi/anything/at/all")).toBe("openapi")
    expect(route("/whatever")).toBe("other")
  })
})
